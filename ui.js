// ui.js - wires the page to data.js (your real files) and to the emulator and assembler.
const F = window.HACK_FILES;
const $ = (s) => document.querySelector(s);
const hex = (n) => "0x" + (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
const toLines = (t) => t.replace(/\n$/, "").split(/\r?\n/);
const codeOf = (raw) => raw.split("//")[0].replace(/\s+/g, "");
const isLabel = (c) => c[0] === "(" && c[c.length - 1] === ")";
const isTyping = (el) => el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Part A: HDL ----------
let hdlName = "CPU.hdl";
function showHdl(name) {
  hdlName = name;
  const el = $("#hdl-code");
  el.textContent = "";
  toLines(F[name]).forEach((t, i) => {
    const n = document.createElement("span"); n.className = "n"; n.textContent = i + 1;
    const c = document.createElement("span"); c.textContent = t + "\n";
    el.append(n, c);
  });
  document.querySelectorAll("[data-hdl]").forEach((b) => b.setAttribute("aria-selected", b.dataset.hdl === name));
}
document.querySelectorAll("[data-hdl]").forEach((b) => (b.onclick = () => showHdl(b.dataset.hdl)));
$("#copy-hdl").onclick = async () => {
  try { await navigator.clipboard.writeText(F[hdlName]); $("#hdl-status").textContent = "Copied " + hdlName; }
  catch (e) { $("#hdl-status").textContent = "Copy was blocked by the browser"; }
};
$("#dl-hdl").onclick = () => download(hdlName, F[hdlName]);
showHdl(hdlName);

// Screenshots: drop each PNG into assets/ under the name shown here. A missing file keeps the empty frame.
const SCREENSHOTS = {
  "CPU.tst": "assets/CPU.png",
  "Memory.tst": "assets/Memory.png",
  "ComputerAdd.tst": "assets/ComputerAdd.png",
  "ComputerMax.tst": "assets/ComputerMax.png",
  "ComputerRect.tst": "assets/ComputerRect.png",
};
$("#tests").append(...Object.entries(SCREENSHOTS).map(([test, src]) => {
  const li = document.createElement("li"); li.textContent = test;
  const slot = document.createElement("div"); slot.className = "shot";
  slot.textContent = "Screenshot slot (empty): " + src.split("/").pop();
  const img = new Image();
  img.alt = "Screenshot of " + test;
  img.onload = () => { slot.replaceChildren(img); slot.classList.add("loaded"); };
  img.src = src;
  li.append(slot); return li;
}));

// ---------- Part B: assembler ----------
const ADD_ASM = "// Add.asm - R0 = 2 + 3\n@2\nD=A\n@3\nD=D+A\n@0\nM=D\n";
const PRESETS = { box: F["Box.asm"], add: ADD_ASM };
const hackText = F["Box.hack"].split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join("");
$("#src").value = F["Box.asm"];
$("#pane-py").textContent = F["assembler.py"];

function assembleNow() {
  const st = $("#status"), badge = $("#badge");
  badge.hidden = true;
  try {
    const r = assemble($("#src").value);
    $("#pane-hack").textContent = r.words.map((w, i) => String(i + 1).padStart(3) + "  " + w).join("\n");
    $("#pane-sym").textContent = formatSymbols(r.labels, r.variables);
    st.className = "status ok";
    st.textContent = `Instructions: ${r.words.length} · Labels: ${Object.keys(r.labels).length} · Variables: ${Object.keys(r.variables).length}`;
    badge.hidden = r.words.join("") !== hackText;
  } catch (e) {
    $("#pane-hack").textContent = ""; $("#pane-sym").textContent = "";
    st.className = "status err"; st.textContent = e.message;
  }
}
$("#asm-btn").onclick = assembleNow;
$("#preset").onchange = (e) => { $("#src").value = PRESETS[e.target.value]; assembleNow(); };
document.querySelectorAll("[data-pane]").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("[data-pane]").forEach((x) => x.classList.toggle("on", x === b));
  ["hack", "sym", "py"].forEach((p) => ($("#pane-" + p).hidden = p !== b.dataset.pane));
}));
assembleNow();

// ---------- Part C: emulator ----------
const rom = parseHack(F["Box.hack"]);
const cv = $("#screen"), ctx = cv.getContext("2d");
const img = ctx.createImageData(512, 256), px = new Uint32Array(img.data.buffer);
let cpu, shadow, running = true, speed = 500;
const held = new Map();                       // source -> key code; the box shows while anything is held
const keyValue = () => { for (const v of held.values()) return v; return 0; };

function resetAll() {
  cpu = new HackComputer(rom);
  shadow = new Int16Array(8192);              // what is currently drawn, word by word
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 512, 256);
}
resetAll();

function paint() {                            // redraw only the words that changed
  const s = cpu.screen; let dirty = false;
  for (let w = 0; w < 8192; w++) {
    const v = s[w];
    if (v === shadow[w]) continue;
    shadow[w] = v; dirty = true;
    const base = (w >> 5) * 512 + (w & 31) * 16;
    for (let b = 0; b < 16; b++) px[base + b] = (v >> b) & 1 ? 0xff000000 : 0xffffffff;
  }
  if (dirty) ctx.putImageData(img, 0, 0);
}

const asmBox = $("#asm"), rows = [], pcLine = [];
let hiLine = -1;
toLines(F["Box.asm"]).forEach((raw, i) => {
  const d = document.createElement("div"); d.className = "src";
  const n = document.createElement("span"); n.className = "n"; n.textContent = i + 1;
  d.append(n, document.createTextNode(raw || " "));
  asmBox.append(d); rows.push(d);
  const c = codeOf(raw);
  if (c && !isLabel(c)) pcLine.push(i);
});

function showRegs() {
  const k = cpu.key;
  const mon = (a) => { const v = cpu.read(a); return `${v}  (${hex(v)})`; };
  $("#r-pc").textContent = cpu.pc;
  $("#r-a").textContent = `${cpu.A}  (${hex(cpu.A)})`;
  $("#r-d").textContent = `${cpu.D}  (${hex(cpu.D)})`;
  $("#r-kbd").textContent = `${k}  ${k ? "Key Down (Box Drawn)" : "Key Released (Box Erased)"}`;
  $("#r-cyc").textContent = cpu.cycles.toLocaleString();
  $("#m1").textContent = mon(17632);
  $("#m2").textContent = mon(18240);
  const a = Number($("#mon-addr").value);
  $("#m3").textContent = Number.isInteger(a) && a >= 0 && a <= 32767 ? mon(a) : "enter 0 to 32767";
  $("#keystate").textContent = running ? "" : "CPU paused: resume to see the box update.";
  const want = pcLine[cpu.pc];
  if (want !== hiLine) {
    if (rows[hiLine]) rows[hiLine].classList.remove("hi");
    if (rows[want]) { rows[want].classList.add("hi"); asmBox.scrollTop = rows[want].offsetTop - asmBox.clientHeight / 2; }
    hiLine = want;
  }
}

function tick() {
  cpu.key = keyValue();
  if (running) cpu.run(speed);
  paint(); showRegs();
  requestAnimationFrame(tick);
}

$("#pause").onclick = (e) => { running = !running; e.target.textContent = running ? "Pause CPU" : "Resume CPU"; };
$("#step").onclick = () => {
  running = false; $("#pause").textContent = "Resume CPU";
  cpu.key = keyValue(); cpu.step(); paint(); showRegs();
};
$("#reset").onclick = () => { resetAll(); paint(); showRegs(); };
$("#speed").oninput = (e) => (speed = +e.target.value);

addEventListener("keydown", (e) => {
  if (!isTyping(e.target)) held.set("k:" + e.code, e.key.length === 1 ? e.key.toUpperCase().charCodeAt(0) : 128);
});
addEventListener("keyup", (e) => held.delete("k:" + e.code));
addEventListener("blur", () => held.clear());
document.addEventListener("visibilitychange", () => { if (document.hidden) held.clear(); });
const release = () => { held.delete("pointer"); held.delete("hold"); };
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
cv.addEventListener("pointerdown", () => held.set("pointer", 128));
$("#hold").addEventListener("pointerdown", () => held.set("hold", 128));

// ---------- Submission ----------
function kCalc() {
  const m = $("#roll").value.match(/(\d\d)\s*$/), d = $("#kcalc");
  d.textContent = "";
  if (!m) { d.textContent = "Enter a roll number ending in two digits."; return; }
  const K = Number(m[1]), w = (K % 4) + 1, a = 16384 + 32 * K;
  [["K (last two digits)", K], ["K mod 3", K % 3], ["K mod 4", K % 4], ["Start row", K],
   ["Start address", `${a} (${hex(a)})`], ["Width", `${16 * w} px (${w} word${w > 1 ? "s" : ""} per row)`]]
    .forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      d.append(dt, dd);
    });
}
function rowHelper() {
  const n = Math.min(236, Math.max(0, Math.floor(Number($("#row").value) || 0)));
  const a = 16384 + 32 * n, last = a + 32 * 19 + 3;
  $("#rowout").textContent = `@${a}   // row ${n}, first word\nbottom-right word ${last}, rows ${n}-${n + 19}`;
}
$("#roll").oninput = kCalc;
$("#row").oninput = rowHelper;
kCalc(); rowHelper();
$("#files").append(...["index.html", "styles.css", "emulator.js", "assembler.js", "ui.js", "data.js", ...Object.keys(F)]
  .map((n) => { const li = document.createElement("li"); li.textContent = n; return li; }));

// ---------- Navigation highlight and start-up ----------
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("cur", a.hash === "#" + e.target.id));
}), { rootMargin: "-40% 0px -55% 0px" });
document.querySelectorAll("section.sec").forEach((s) => io.observe(s));

console.info(selfTest(rom) ? "Box self-test passed" : "Box self-test FAILED");
requestAnimationFrame(tick);
