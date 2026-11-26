// assembler.js - JavaScript port of assembler.py: same tables, two passes, same output.
const COMP = {"0":"0101010","1":"0111111","-1":"0111010","D":"0001100","A":"0110000","!D":"0001101","!A":"0110001","-D":"0001111","-A":"0110011","D+1":"0011111","A+1":"0110111","D-1":"0001110","A-1":"0110010","D+A":"0000010","D-A":"0010011","A-D":"0000111","D&A":"0000000","D|A":"0010101","M":"1110000","!M":"1110001","-M":"1110011","M+1":"1110111","M-1":"1110010","D+M":"1000010","D-M":"1010011","M-D":"1000111","D&M":"1000000","D|M":"1010101","A+D":"0000010","M+D":"1000010","A&D":"0000000","A|D":"0010101","M&D":"1000000","M|D":"1010101"};
const DEST = {"":"000","M":"001","D":"010","MD":"011","A":"100","AM":"101","AD":"110","AMD":"111"};
const JUMP = {"":"000","JGT":"001","JEQ":"010","JGE":"011","JLT":"100","JNE":"101","JLE":"110","JMP":"111"};
const PREDEFINED = {};
for (let i = 0; i < 16; i++) PREDEFINED["R" + i] = i;
Object.assign(PREDEFINED, { SP: 0, LCL: 1, ARG: 2, THIS: 3, THAT: 4, SCREEN: 16384, KBD: 24576 });

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fail = (line, msg) => new Error(`Line ${line}: ${msg}`);

function cleanLines(text) {            // step 0: drop // comments and whitespace
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const code = raw.split("//")[0].replace(/\s+/g, "");
    if (code) out.push({ code, line: i + 1 });
  });
  return out;
}

function firstPass(lines) {            // pass 1: ROM address of each (LABEL)
  const labels = Object.create(null), instrs = [];
  for (const { code, line } of lines) {
    if (code[0] === "(" && code[code.length - 1] === ")") {
      const name = code.slice(1, -1);
      if (name in labels) throw fail(line, `label '${name}' is declared twice`);
      labels[name] = instrs.length;
    } else instrs.push({ code, line });
  }
  return { labels, instrs };
}

function encodeC(code, line) {         // dest=comp;jump -> 111 a c1..c6 d1..d3 j1..j3
  const eq = code.indexOf("=");
  const dest = eq >= 0 ? code.slice(0, eq) : "";
  const rest = eq >= 0 ? code.slice(eq + 1) : code;
  const semi = rest.indexOf(";");
  const comp = semi >= 0 ? rest.slice(0, semi) : rest;
  const jump = semi >= 0 ? rest.slice(semi + 1) : "";
  if (!has(COMP, comp)) throw fail(line, `unknown computation '${comp}' in '${code}'`);
  if (!has(DEST, dest)) throw fail(line, `unknown destination '${dest}' in '${code}'`);
  if (!has(JUMP, jump)) throw fail(line, `unknown jump '${jump}' in '${code}'`);
  return "111" + COMP[comp] + DEST[dest] + JUMP[jump];
}

function secondPass(instrs, labels) { // pass 2: symbols and bit patterns
  const symbols = Object.assign(Object.create(null), PREDEFINED, labels);
  const variables = Object.create(null);
  let nextRam = 16;                    // R0-R15 are reserved
  const words = [];
  for (const { code, line } of instrs) {
    if (code[0] !== "@") { words.push(encodeC(code, line)); continue; }
    const operand = code.slice(1);
    if (!operand) throw fail(line, "'@' with nothing after it");
    let value;
    if (/^\d+$/.test(operand)) value = parseInt(operand, 10);
    else {
      if (!(operand in symbols)) { symbols[operand] = nextRam; variables[operand] = nextRam++; }
      value = symbols[operand];
    }
    if (value > 32767) throw fail(line, `value ${value} does not fit in 15 bits`);
    words.push(value.toString(2).padStart(16, "0"));
  }
  return { words, variables };
}

function assemble(text) {
  const { labels, instrs } = firstPass(cleanLines(text));
  const { words, variables } = secondPass(instrs, labels);
  return { words, labels, variables };
}

function formatSymbols(labels, variables) {   // same layout as write_symbols()
  const section = (title, entries) => [
    title, "-".repeat(title.length), "Symbol".padEnd(16) + "Address".padStart(8),
    ...entries.map(([n, a]) => n.padEnd(16) + String(a).padStart(8)),
  ].join("\n");
  return [
    section("Predefined symbols", Object.entries(PREDEFINED)),
    section("ROM labels", Object.entries(labels).sort((a, b) => a[1] - b[1])),
    section("RAM variables", Object.entries(variables)),
  ].join("\n\n");
}

if (typeof module !== "undefined") module.exports = { assemble, formatSymbols, PREDEFINED };
