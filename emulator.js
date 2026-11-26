// emulator.js - Hack computer, bit-for-bit with CPU.hdl, Memory.hdl and Computer.hdl.
// Plain script (no modules) so index.html works when opened from disk.

function alu(x, y, c) {                // c = instruction bits 11..6: zx nx zy ny f no
  if (c & 32) x = 0;                   // zx
  if (c & 16) x = ~x;                  // nx
  if (c & 8) y = 0;                    // zy
  if (c & 4) y = ~y;                   // ny
  let o = c & 2 ? x + y : x & y;       // f: 1 = add, 0 = and
  if (c & 1) o = ~o;                   // no
  return (o << 16) >> 16;              // 16-bit signed result
}

class HackComputer {
  constructor(rom) {
    this.rom = rom;                    // ROM32K: 16-bit words
    this.ram = new Int16Array(16384);  // RAM16K
    this.screen = new Int16Array(8192);// 512x256 px, 32 words per row
    this.key = 0;                      // Keyboard register (0 = no key)
    this.resetIn = false;              // reset input
    this.pc = 0; this.A = 0; this.D = 0; this.cycles = 0;
  }
  read(a) {                            // Memory.hdl read path
    if (a < 16384) return this.ram[a];
    if (a < 24576) return this.screen[a - 16384];
    return this.key;                   // address[14] and [13] set: keyboard
  }
  write(a, v) {                        // keyboard is read-only
    if (a < 16384) this.ram[a] = v;
    else if (a < 24576) this.screen[a - 16384] = v;
  }
  step() {                             // one clock cycle
    this.cycles++;
    if (this.resetIn) { this.pc = 0; return; }
    const ins = (this.rom[this.pc] || 0) & 0xffff;
    const next = (this.pc + 1) & 0x7fff;
    if (!(ins & 0x8000)) { this.A = ins; this.pc = next; return; }   // A-instruction
    const addr = this.A & 0x7fff;      // addressM = A before this cycle
    const y = ins & 0x1000 ? this.read(addr) : this.A;               // a bit: M or A
    const out = alu(this.D, y, (ins >> 6) & 63);
    const j = ins & 7;
    const jump = ((j & 4) && out < 0) || ((j & 2) && out === 0) || ((j & 1) && out > 0);
    if (ins & 8) this.write(addr, out);  // d3: M
    if (ins & 16) this.D = out;          // d2: D
    if (ins & 32) this.A = out;          // d1: A (a jump still uses the old A)
    this.pc = jump ? addr : next;
  }
  run(n) { for (let i = 0; i < n; i++) this.step(); }
}

function parseHack(text) {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s) => parseInt(s, 2));
}

// Runs Box.hack with no key, then key 65, then no key again, and checks the screen.
function selfTest(rom) {
  const expected = new Set();
  for (let r = 39; r <= 58; r++) for (let w = 0; w < 4; w++) expected.add(r * 32 + w);
  const m = new HackComputer(rom);
  const phase = (key) => {
    m.key = key;
    const before = m.screen.slice();
    m.run(5000);
    const changed = [];
    for (let i = 0; i < 8192; i++) if (before[i] !== m.screen[i]) changed.push(i);
    return changed;
  };
  const inBox = (d) => d.length === 80 && d.every((i) => expected.has(i));
  const up = phase(0);
  const down = phase(65);
  const blackOk = down.every((i) => m.screen[i] === -1);
  const back = phase(0);
  const whiteOk = [...expected].every((i) => m.screen[i] === 0);
  const checks = [
    ["no key: nothing changes", up.length === 0],
    ["key down: exactly 80 words (rows 39-58, words 0-3) turn black", inBox(down) && blackOk],
    ["key released: the same 80 words are erased", inBox(back) && whiteOk],
  ];
  checks.forEach(([name, ok]) => console[ok ? "log" : "error"](`[self-test] ${ok ? "PASS" : "FAIL"}: ${name}`));
  return checks.every((c) => c[1]);
}

if (typeof module !== "undefined") module.exports = { alu, HackComputer, parseHack, selfTest };
