// =====================================================================================
// isa.js  -  the LIMO ISA written as tables.
//
// In your M1 PDF these tables are sections 2.2 (registers), 2.3 (immediate ranges) and
// 2.4 (instruction set). Here they are the same information, written so a program can
// look things up. Every other file imports these tables, so if the ISA ever changes,
// this is the ONLY file you edit.
// =====================================================================================

// -------------------------------------------------------------------------------------
// TABLE 1: the instructions (M1 section 2.4).
//   fmt     = the format (R, I, S, B or J)          -> M1 section 2.3
//   opcode  = bits 6-0                              -> same as RV32I
//   funct3  = bits 14-12     funct7 = bits 31-25    -> same as RV32I
//   syntax  = how the operands are written (used by the assembler to know what to expect)
//   usage   = the text shown in error messages
//   rv32i   = the RV32I instruction with the same bit pattern
// -------------------------------------------------------------------------------------
export const INSTRUCTIONS = {
  kopanya:   { fmt: 'R', opcode: 0b0110011, funct3: 0b000, funct7: 0b0000000, syntax: 'RRR',    usage: 'kopanya rd, rs1, rs2',      rv32i: 'add'  },
  tlosa:     { fmt: 'R', opcode: 0b0110011, funct3: 0b000, funct7: 0b0100000, syntax: 'RRR',    usage: 'tlosa rd, rs1, rs2',        rv32i: 'sub'  },
  kopanyah:  { fmt: 'I', opcode: 0b0010011, funct3: 0b000,                    syntax: 'RRI',    usage: 'kopanyah rd, rs1, imm',     rv32i: 'addi' },
  le:        { fmt: 'R', opcode: 0b0110011, funct3: 0b111, funct7: 0b0000000, syntax: 'RRR',    usage: 'le rd, rs1, rs2',           rv32i: 'and'  },
  kapa:      { fmt: 'R', opcode: 0b0110011, funct3: 0b110, funct7: 0b0000000, syntax: 'RRR',    usage: 'kapa rd, rs1, rs2',         rv32i: 'or'   },
  chetse:    { fmt: 'I', opcode: 0b0010011, funct3: 0b001, funct7: 0b0000000, syntax: 'RRS',    usage: 'chetse rd, rs1, shamt',     rv32i: 'slli', shift: true },
  tshela:    { fmt: 'I', opcode: 0b0000011, funct3: 0b010,                    syntax: 'LOAD',   usage: 'tshela rd, imm(rs1)',       rv32i: 'lw'   },
  boloka:    { fmt: 'S', opcode: 0b0100011, funct3: 0b010,                    syntax: 'STORE',  usage: 'boloka rs2, imm(rs1)',      rv32i: 'sw'   },
  lekana:    { fmt: 'B', opcode: 0b1100011, funct3: 0b000,                    syntax: 'BRANCH', usage: 'lekana rs1, rs2, label',    rv32i: 'beq'  },
  haelekane: { fmt: 'B', opcode: 0b1100011, funct3: 0b001,                    syntax: 'BRANCH', usage: 'haelekane rs1, rs2, label', rv32i: 'bne'  },
  nyane:     { fmt: 'B', opcode: 0b1100011, funct3: 0b100,                    syntax: 'BRANCH', usage: 'nyane rs1, rs2, label',     rv32i: 'blt'  },
  tlola:     { fmt: 'J', opcode: 0b1101111,                                   syntax: 'JUMP',   usage: 'tlola rd, label',           rv32i: 'jal'  },
  khutla:    { fmt: 'I', opcode: 0b1100111, funct3: 0b000,                    syntax: 'LOAD',   usage: 'khutla rd, imm(rs1)',       rv32i: 'jalr' },
};

// -------------------------------------------------------------------------------------
// TABLE 2: the registers (M1 section 2.2). A name on the left, a register number on the right.
// The assembler accepts the number (p5), the alias (n0) or the Sesotho name (noto).
// -------------------------------------------------------------------------------------
export const REGISTER_LOOKUP = {};

// p0, p1, ... p31  ->  0, 1, ... 31   (a small loop so we do not type 32 lines)
for (let number = 0; number < 32; number++) {
  REGISTER_LOOKUP['p' + number] = number;
}

// Special registers: Sesotho name and alias
REGISTER_LOOKUP.noto = 0;    REGISTER_LOOKUP.zero = 0;   // p0  hard-wired zero
REGISTER_LOOKUP.hae = 1;     REGISTER_LOOKUP.ra = 1;     // p1  return address
REGISTER_LOOKUP.lesupa = 2;  REGISTER_LOOKUP.sp = 2;     // p2  stack pointer

// p5-p7 temporaries
REGISTER_LOOKUP.n0 = 5;   REGISTER_LOOKUP.n1 = 6;   REGISTER_LOOKUP.n2 = 7;
// p8-p9 saved
REGISTER_LOOKUP.b0 = 8;   REGISTER_LOOKUP.b1 = 9;
// p10-p17 arguments / return values
REGISTER_LOOKUP.t0 = 10;  REGISTER_LOOKUP.t1 = 11;  REGISTER_LOOKUP.t2 = 12;  REGISTER_LOOKUP.t3 = 13;
REGISTER_LOOKUP.t4 = 14;  REGISTER_LOOKUP.t5 = 15;  REGISTER_LOOKUP.t6 = 16;  REGISTER_LOOKUP.t7 = 17;
// p18-p27 saved
REGISTER_LOOKUP.b2 = 18;  REGISTER_LOOKUP.b3 = 19;  REGISTER_LOOKUP.b4 = 20;  REGISTER_LOOKUP.b5 = 21;
REGISTER_LOOKUP.b6 = 22;  REGISTER_LOOKUP.b7 = 23;  REGISTER_LOOKUP.b8 = 24;  REGISTER_LOOKUP.b9 = 25;
REGISTER_LOOKUP.b10 = 26; REGISTER_LOOKUP.b11 = 27;
// p28-p31 temporaries
REGISTER_LOOKUP.n3 = 28;  REGISTER_LOOKUP.n4 = 29;  REGISTER_LOOKUP.n5 = 30;  REGISTER_LOOKUP.n6 = 31;

// -------------------------------------------------------------------------------------
// TABLE 3: immediate ranges (M1 section 2.3).
// -------------------------------------------------------------------------------------
export const RANGES = {
  I:     { min: -2048,    max: 2047 },      // kopanyah, tshela, khutla
  S:     { min: -2048,    max: 2047 },      // boloka
  SHAMT: { min: 0,        max: 31 },        // chetse
  B:     { min: -4096,    max: 4094 },      // branches, in bytes (even)
  J:     { min: -1048576, max: 1048574 },   // tlola, in bytes (even)
};

export const INSTRUCTION_MEMORY_BYTES = 4096;   // 0x000 - 0xFFF  (M1 section 2.1)

// -------------------------------------------------------------------------------------
// Apostrophe rule (M1 section 2.4). If a mnemonic ever contains an apostrophe, such as ts'ela,
// then "tsela" is accepted as an alias - but only if "tsela" is not already another mnemonic.
// Today no mnemonic has an apostrophe, so this table stays empty. It is ready for the future.
// -------------------------------------------------------------------------------------
export const MNEMONIC_ALIASES = {};
const allMnemonics = Object.keys(INSTRUCTIONS);
for (const name of allMnemonics) {
  if (name.includes("'")) {
    const withoutApostrophe = name.split("'").join('');
    if (!allMnemonics.includes(withoutApostrophe)) {
      MNEMONIC_ALIASES[withoutApostrophe] = name;
    }
  }
}
