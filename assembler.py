#!/usr/bin/env python3
"""
assembler.py - two-pass assembler for the Hack machine language.

Usage:
    python assembler.py <input.asm>

Outputs, written to the same folder as the input file:
    <input>.hack   16-bit binary machine code, one instruction per line
    symbols.txt    symbol table: predefined symbols, ROM labels, RAM variables

Uses only the Python standard library.
"""

import os
import sys


# ---------------------------------------------------------------------------
# Lookup tables from the Hack specification
# ---------------------------------------------------------------------------

# Predefined symbols: name -> decimal address
PREDEFINED_SYMBOLS = {f"R{i}": i for i in range(16)}
PREDEFINED_SYMBOLS.update({
    "SP": 0,
    "LCL": 1,
    "ARG": 2,
    "THIS": 3,
    "THAT": 4,
    "SCREEN": 16384,
    "KBD": 24576,
})

# comp mnemonic -> 7 bits: a c1 c2 c3 c4 c5 c6
COMP_TABLE = {
    "0":   "0101010",
    "1":   "0111111",
    "-1":  "0111010",
    "D":   "0001100",
    "A":   "0110000",
    "!D":  "0001101",
    "!A":  "0110001",
    "-D":  "0001111",
    "-A":  "0110011",
    "D+1": "0011111",
    "A+1": "0110111",
    "D-1": "0001110",
    "A-1": "0110010",
    "D+A": "0000010",
    "D-A": "0010011",
    "A-D": "0000111",
    "D&A": "0000000",
    "D|A": "0010101",
    "M":   "1110000",
    "!M":  "1110001",
    "-M":  "1110011",
    "M+1": "1110111",
    "M-1": "1110010",
    "D+M": "1000010",
    "D-M": "1010011",
    "M-D": "1000111",
    "D&M": "1000000",
    "D|M": "1010101",

    # Commutative aliases: A+D is the same operation as D+A, and so on.
    "A+D": "0000010",
    "M+D": "1000010",
    "A&D": "0000000",
    "A|D": "0010101",
    "M&D": "1000000",
    "M|D": "1010101",
}

# dest mnemonic -> 3 bits: d1 d2 d3 (d1 = A, d2 = D, d3 = M)
DEST_TABLE = {
    "":    "000",
    "M":   "001",
    "D":   "010",
    "MD":  "011",
    "A":   "100",
    "AM":  "101",
    "AD":  "110",
    "AMD": "111",
}

# jump mnemonic -> 3 bits: j1 j2 j3 (j1 = JLT, j2 = JEQ, j3 = JGT)
JUMP_TABLE = {
    "":    "000",
    "JGT": "001",
    "JEQ": "010",
    "JGE": "011",
    "JLT": "100",
    "JNE": "101",
    "JLE": "110",
    "JMP": "111",
}


class AssemblerError(Exception):
    """Raised when the source contains something that cannot be translated."""


# ---------------------------------------------------------------------------
# Step 0: clean the source text
# ---------------------------------------------------------------------------

def clean_lines(text):
    """Remove // comments and all whitespace. Drop lines that become empty."""
    cleaned = []
    for raw in text.splitlines():
        code = raw.split("//", 1)[0]     # strip the comment
        code = "".join(code.split())     # strip spaces, tabs and \r
        if code:
            cleaned.append(code)
    return cleaned


# ---------------------------------------------------------------------------
# Pass 1: find the ROM address of every (LABEL)
# ---------------------------------------------------------------------------

def first_pass(lines):
    """
    Returns (labels, instructions).
      labels        {"LOOP": rom_address, ...}
      instructions  the lines that are real instructions, label lines removed

    A label's address is the number of real instructions that come before it.
    A label line takes no ROM slot, so the counter does not advance for it.
    """
    labels = {}
    instructions = []
    for line in lines:
        if line.startswith("(") and line.endswith(")"):
            name = line[1:-1]
            if name in labels:
                raise AssemblerError(f"label '{name}' is declared twice")
            labels[name] = len(instructions)
        else:
            instructions.append(line)
    return labels, instructions


# ---------------------------------------------------------------------------
# Pass 2: translate each instruction to 16 bits
# ---------------------------------------------------------------------------

def encode_a_instruction(value):
    """A-instruction: a leading 0 followed by the 15-bit value."""
    if not 0 <= value <= 32767:
        raise AssemblerError(f"value {value} does not fit in 15 bits")
    return f"{value:016b}"


def encode_c_instruction(line):
    """Turn  dest=comp;jump  into the bit string  111 a c1..c6 d1..d3 j1..j3."""
    # Optional destination comes before '='
    if "=" in line:
        dest, rest = line.split("=", 1)
    else:
        dest, rest = "", line

    # Optional jump comes after ';'
    if ";" in rest:
        comp, jump = rest.split(";", 1)
    else:
        comp, jump = rest, ""

    if comp not in COMP_TABLE:
        raise AssemblerError(f"unknown computation '{comp}' in '{line}'")
    if dest not in DEST_TABLE:
        raise AssemblerError(f"unknown destination '{dest}' in '{line}'")
    if jump not in JUMP_TABLE:
        raise AssemblerError(f"unknown jump '{jump}' in '{line}'")

    return "111" + COMP_TABLE[comp] + DEST_TABLE[dest] + JUMP_TABLE[jump]


def second_pass(instructions, labels):
    """
    Translate every instruction.
    Returns (machine_code, variables):
      machine_code  list of 16-character bit strings
      variables     {"name": ram_address} for the RAM variables created here
    """
    symbols = dict(PREDEFINED_SYMBOLS)
    symbols.update(labels)          # ROM labels are known after pass 1

    variables = {}
    next_free_ram = 16              # R0-R15 are reserved, so variables start at 16

    machine_code = []
    for line in instructions:
        if line.startswith("@"):
            operand = line[1:]
            if not operand:
                raise AssemblerError("'@' with nothing after it")

            if operand.isdigit():               # @value: decimal constant
                value = int(operand)
            else:                               # @symbol: label or variable
                if operand not in symbols:      # first time this name appears
                    symbols[operand] = next_free_ram
                    variables[operand] = next_free_ram
                    next_free_ram += 1
                value = symbols[operand]

            machine_code.append(encode_a_instruction(value))
        else:
            machine_code.append(encode_c_instruction(line))

    return machine_code, variables


# ---------------------------------------------------------------------------
# Output files
# ---------------------------------------------------------------------------

def write_hack(path, machine_code):
    with open(path, "w") as f:
        f.write("\n".join(machine_code) + "\n")


def write_symbols(path, labels, variables):
    """Write symbols.txt: predefined symbols, ROM labels, RAM variables."""

    def section(title, entries):
        lines = [title, "-" * len(title), f"{'Symbol':<16}{'Address':>8}"]
        for name, address in entries:
            lines.append(f"{name:<16}{address:>8}")
        return "\n".join(lines)

    sections = [
        section("Predefined symbols", PREDEFINED_SYMBOLS.items()),
        section("ROM labels", sorted(labels.items(), key=lambda kv: kv[1])),
        section("RAM variables", variables.items()),
    ]
    with open(path, "w") as f:
        f.write("\n\n".join(sections) + "\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) != 2:
        print("Usage: python assembler.py <input.asm>", file=sys.stderr)
        return 1

    asm_path = os.path.abspath(sys.argv[1])
    folder = os.path.dirname(asm_path)
    hack_path = os.path.splitext(asm_path)[0] + ".hack"
    symbols_path = os.path.join(folder, "symbols.txt")

    try:
        with open(asm_path, "r") as f:
            text = f.read()
        lines = clean_lines(text)
        labels, instructions = first_pass(lines)
        machine_code, variables = second_pass(instructions, labels)
    except (OSError, AssemblerError) as err:
        print(f"Error: {err}", file=sys.stderr)
        return 1

    write_hack(hack_path, machine_code)
    write_symbols(symbols_path, labels, variables)

    print(f"Wrote {len(machine_code)} instructions to {hack_path}")
    print(f"Wrote symbol table to {symbols_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
