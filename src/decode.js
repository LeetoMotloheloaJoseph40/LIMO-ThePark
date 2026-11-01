// =====================================================================================
// decode.js  -  turns a 32-bit machine word BACK into an instruction (the inverse of assembler.js).
//
//   decode(word)         returns  { valid, mnemonic, format, class, rd, rs1, rs2, imm,
//                                   readsRs1, readsRs2, writesRd, isHalt, reason }
//   disassemble(word)    returns  text such as  "kopanyah t0, noto, 25"
//   registerName(n)      returns  the name shown for register number n, e.g. 0 -> "noto"
//
// WHO USES IT
//   - the pipeline core, in the ID stage: "which instruction is this, and which registers does it use?"
//   - the interface, to show the instruction sitting in a pipeline register (it only has the word)
//   - the tests: assemble -> decode must give back what we started with
//
// HOW TO READ THIS FILE: it is assembler.js run backwards.
//   PART 1  cutting fields out of the word (the opposite of "gluing" them together)
//   PART 2  decode(): find which instruction it is, then read its operands
//   PART 3  disassemble(): write the instruction as text again
// =====================================================================================

import { INSTRUCTIONS, REGISTER_LOOKUP } from './isa.js';


// =====================================================================================
// PART 1: CUTTING FIELDS OUT OF THE WORD
// =====================================================================================

// bits(word, 14, 12) returns bits 14 down to 12 of the word, like writing word[14:12].
// We use >>> (not >>) so that bit 31 is treated as a plain bit and never as a minus sign.
function bits(word, high, low) {
  const width = high - low + 1;
  const mask = Math.pow(2, width) - 1;           // width ones, e.g. width 5 -> 31
  return Math.floor(word / Math.pow(2, low)) % (mask + 1);
}

// A number stored in `width` bits is negative if its top bit is 1 (two's complement).
// signExtend(0b111111111111, 12) = -1      signExtend(0b000000000101, 12) = 5
function signExtend(value, width) {
  if (value >= Math.pow(2, width - 1)) return value - Math.pow(2, width);
  return value;
}

// The immediate is stored in different places in each format (spec section 3).
// This puts the pieces back in order. It is the opposite of buildFields() in assembler.js.
function readImmediate(word, ins) {
  if (ins.fmt === 'I' && ins.shift) {
    return bits(word, 24, 20);                    // chetse: the 5-bit shift amount, never negative
  }
  if (ins.fmt === 'I') {
    return signExtend(bits(word, 31, 20), 12);    // imm[11:0] is one block
  }
  if (ins.fmt === 'S') {
    // imm[11:5] is bits 31-25, imm[4:0] is bits 11-7
    const high = bits(word, 31, 25);
    const low = bits(word, 11, 7);
    return signExtend(high * 32 + low, 12);
  }
  if (ins.fmt === 'B') {
    // imm[12] = bit 31, imm[10:5] = bits 30-25, imm[4:1] = bits 11-8, imm[11] = bit 7.
    // Bit 0 of the offset is not stored; it is always 0, so we put a 0 on the right.
    const imm12 = bits(word, 31, 31);
    const imm11 = bits(word, 7, 7);
    const imm10to5 = bits(word, 30, 25);
    const imm4to1 = bits(word, 11, 8);
    const value = imm12 * 4096 + imm11 * 2048 + imm10to5 * 32 + imm4to1 * 2;
    return signExtend(value, 13);
  }
  if (ins.fmt === 'J') {
    // imm[20] = bit 31, imm[10:1] = bits 30-21, imm[11] = bit 20, imm[19:12] = bits 19-12
    const imm20 = bits(word, 31, 31);
    const imm19to12 = bits(word, 19, 12);
    const imm11 = bits(word, 20, 20);
    const imm10to1 = bits(word, 30, 21);
    const value = imm20 * 1048576 + imm19to12 * 4096 + imm11 * 2048 + imm10to1 * 2;
    return signExtend(value, 21);
  }
  return 0;                                       // R-type has no immediate
}


// =====================================================================================
// PART 2: decode()
// =====================================================================================

// Which instruction is this word?  Compare it with every row of the instruction table.
// A row matches when every field the table gives for that row is equal to the word's field:
//   opcode always, funct3 if the row has one, funct7 if the row has one.
// (kopanyah has no funct7 in the table because those bits are part of its immediate.)
// Returns the mnemonic, or null if no row matches.
function findInstruction(word) {
  const opcode = bits(word, 6, 0);
  const funct3 = bits(word, 14, 12);
  const funct7 = bits(word, 31, 25);
  for (const mnemonic of Object.keys(INSTRUCTIONS)) {
    const row = INSTRUCTIONS[mnemonic];
    if (row.opcode !== opcode) continue;
    if (row.funct3 !== undefined && row.funct3 !== funct3) continue;
    if (row.funct7 !== undefined && row.funct7 !== funct7) continue;
    return mnemonic;
  }
  return null;
}

// What does each instruction do with its registers?  This follows the "syntax" column of isa.js,
// so there is nothing new to keep in step when the ISA changes.
//   reads rs1 / rs2   -> the hazard unit needs this: only a register an instruction REALLY reads
//                        can cause a load-use stall (spec section 7, "actually uses")
//   writes rd         -> true for instructions that put a result in a register
const USAGE_BY_SYNTAX = {
  RRR:    { cls: 'alu',    readsRs1: true,  readsRs2: true,  writesRd: true  },   // kopanya, tlosa, le, kapa
  RRI:    { cls: 'alu',    readsRs1: true,  readsRs2: false, writesRd: true  },   // kopanyah
  RRS:    { cls: 'alu',    readsRs1: true,  readsRs2: false, writesRd: true  },   // chetse
  LOAD:   { cls: 'load',   readsRs1: true,  readsRs2: false, writesRd: true  },   // tshela (khutla is fixed below)
  STORE:  { cls: 'store',  readsRs1: true,  readsRs2: true,  writesRd: false },   // boloka: rs2 is the data
  BRANCH: { cls: 'branch', readsRs1: true,  readsRs2: true,  writesRd: false },   // lekana, haelekane, nyane
  JUMP:   { cls: 'jump',   readsRs1: false, readsRs2: false, writesRd: true  },   // tlola
};

const HALT_WORD = 0x00000063;   // lekana noto, noto, <itself>: a branch to itself (spec section 6)

function hexOf(word) {
  return '0x' + word.toString(16).toUpperCase().padStart(8, '0');
}

// decode(word): the main function.
// If the word is not one of the 13 instructions, valid is false and `reason` says why in plain
// language. The simulator must stop on such a word (spec section 6, undefined behaviour table).
export function decode(word) {
  const w = word >>> 0;                           // make sure we have an unsigned 32-bit number

  const mnemonic = findInstruction(w);
  if (mnemonic === null) {
    let reason = `${hexOf(w)} is not one of the 13 LIMO instructions.`;
    if (w === 0) {
      reason = '0x00000000 is not an instruction. This is what is fetched after the end of a program; ' +
        'end the program with a halt (a branch to itself).';
    }
    return { valid: false, word: w, hex: hexOf(w), reason: reason };
  }

  const ins = INSTRUCTIONS[mnemonic];
  const usage = USAGE_BY_SYNTAX[ins.syntax];
  let cls = usage.cls;
  if (mnemonic === 'khutla') cls = 'jump';        // khutla uses the LOAD operand shape but it jumps

  // The register fields sit in the same place in every format (that is why the immediates are scrambled).
  // But only the fields the instruction really has are meaningful, so we zero the others.
  const rd = usage.writesRd ? bits(w, 11, 7) : 0;
  const rs1 = usage.readsRs1 ? bits(w, 19, 15) : 0;
  const rs2 = usage.readsRs2 ? bits(w, 24, 20) : 0;

  return {
    valid: true,
    word: w,
    hex: hexOf(w),
    mnemonic: mnemonic,
    format: ins.fmt,
    class: cls,                                   // 'alu', 'load', 'store', 'branch' or 'jump'
    rd: rd,
    rs1: rs1,
    rs2: rs2,
    imm: readImmediate(w, ins),                   // signed; for branches and jumps a byte offset
    readsRs1: usage.readsRs1,
    readsRs2: usage.readsRs2,
    writesRd: usage.writesRd,                     // note: a write to p0 is discarded (spec section 6)
    isHalt: w === HALT_WORD,
    reason: '',
  };
}


// =====================================================================================
// PART 3: disassemble()
// =====================================================================================

// Register number -> the name to show. We use the Sesotho name or the alias when there is one
// (0 -> noto, 1 -> hae, 2 -> lesupa, 5 -> n0, 10 -> t0 ...) and the plain p-number otherwise.
// REGISTER_LOOKUP lists p0..p31 first, so the first name that is not "p<number>" is the right one.
const NAME_OF_REGISTER = [];
for (const name of Object.keys(REGISTER_LOOKUP)) {
  const number = REGISTER_LOOKUP[name];
  const isPlainNumber = name === 'p' + number;
  if (NAME_OF_REGISTER[number] === undefined && !isPlainNumber) NAME_OF_REGISTER[number] = name;
}

// style 'alias' (default): noto, hae, n0, t0, p3        style 'number': p0, p1, p5, p10, p3
export function registerName(number, style) {
  if (style === 'number' || NAME_OF_REGISTER[number] === undefined) return 'p' + number;
  return NAME_OF_REGISTER[number];
}

// disassemble(word): the instruction as text, in the same shape the assembler reads.
// Branch and jump offsets are written as plain byte offsets (labels are lost: a word has no labels),
// so  nyane n0, n1, 16  can be typed straight back into the assembler and gives the same word.
export function disassemble(word, style) {
  const d = decode(word);
  if (!d.valid) return '(not an instruction) ' + d.hex;

  const name = (n) => registerName(n, style);
  const ins = INSTRUCTIONS[d.mnemonic];

  if (ins.syntax === 'RRR') return `${d.mnemonic} ${name(d.rd)}, ${name(d.rs1)}, ${name(d.rs2)}`;
  if (ins.syntax === 'RRI' || ins.syntax === 'RRS') return `${d.mnemonic} ${name(d.rd)}, ${name(d.rs1)}, ${d.imm}`;
  if (ins.syntax === 'LOAD') return `${d.mnemonic} ${name(d.rd)}, ${d.imm}(${name(d.rs1)})`;
  if (ins.syntax === 'STORE') return `${d.mnemonic} ${name(d.rs2)}, ${d.imm}(${name(d.rs1)})`;
  if (ins.syntax === 'BRANCH') return `${d.mnemonic} ${name(d.rs1)}, ${name(d.rs2)}, ${d.imm}`;
  if (ins.syntax === 'JUMP') return `${d.mnemonic} ${name(d.rd)}, ${d.imm}`;
  throw new Error('Unknown syntax ' + ins.syntax);   // cannot happen unless isa.js is wrong
}
