// =====================================================================================
// refmodel.js  -  a tiny "one instruction at a time" LIMO machine, used ONLY by the tests.
//
// It is NOT the pipeline. It has no stages and no hazards. It follows spec v1.1 section 6
// ("Execution rules") literally, so we can answer: "what should this program leave in the
// registers and memory?", and "how many cycles should the pipeline need?".
//
// Why we need it: the simulator core (M3) must end every program in the same state as this
// simple machine. If the two disagree, the bug is in the pipeline (or in this file) and we
// can find out which by reading the spec.
//
//   runReference(words)  ->  { halted, stopReason, pc, regs, dmem,
//                              instructions, stalls, flushed, cycles }
// =====================================================================================

import { decode } from '../../src/decode.js';

const IMEM_WORDS = 1024;      // 0x000 - 0xFFC  (spec section 2)
const DMEM_WORDS = 1024;
const STACK_START = 0x1000;   // p2 (lesupa) at reset (spec section 2)

export function runReference(words, options = {}) {
  const maxSteps = options.maxSteps || 100000;     // so a program that never halts cannot hang a test

  const imem = new Uint32Array(IMEM_WORDS);
  imem.set(words);
  const dmem = new Uint32Array(DMEM_WORDS);
  const regs = new Int32Array(32);
  regs[2] = STACK_START;

  let pc = 0;
  let halted = false;
  let stopReason = '';

  let instructions = 0;     // N: instructions executed, including the halt
  let stalls = 0;           // load-use bubbles
  let flushed = 0;          // 2 for every taken branch or jump (the halt's own branch is not counted)
  let previous = null;      // the instruction executed just before this one (for load-use)

  // Write a register. Writes to p0 are discarded (spec section 6, rule 2).
  const write = (n, value) => { if (n !== 0) regs[n] = value | 0; };

  // A memory address must be a multiple of 4 and inside 0x000-0xFFC (spec section 6, table).
  const addressProblem = (address) => {
    if (address % 4 !== 0) return `address ${address} is not word-aligned`;
    if (address < 0 || address > 0xFFC) return `address ${address} is outside data memory`;
    return '';
  };

  // A jump target must be a multiple of 4 and inside instruction memory.
  const targetProblem = (target) => {
    if (target % 4 !== 0) return `target ${target} is not a multiple of 4`;
    if (target < 0 || target > 0xFFC) return `target ${target} is outside instruction memory`;
    return '';
  };

  for (let step = 0; step < maxSteps && !halted && stopReason === ''; step++) {
    // ---- fetch ----
    if (pc % 4 !== 0 || pc < 0 || pc > 0xFFC) { stopReason = `PC ${pc} is outside instruction memory`; break; }
    const d = decode(imem[pc / 4]);
    if (!d.valid) { stopReason = d.reason; break; }

    // ---- load-use stall: the previous instruction was a load whose result this one reads ----
    if (previous !== null && previous.class === 'load' && previous.rd !== 0) {
      if ((d.readsRs1 && d.rs1 === previous.rd) || (d.readsRs2 && d.rs2 === previous.rd)) stalls++;
    }

    // ---- execute ----
    const a = regs[d.rs1];
    const b = regs[d.rs2];
    let nextPc = pc + 4;
    let taken = false;

    if (d.mnemonic === 'kopanya') write(d.rd, a + b);
    else if (d.mnemonic === 'tlosa') write(d.rd, a - b);
    else if (d.mnemonic === 'le') write(d.rd, a & b);
    else if (d.mnemonic === 'kapa') write(d.rd, a | b);
    else if (d.mnemonic === 'kopanyah') write(d.rd, a + d.imm);
    else if (d.mnemonic === 'chetse') write(d.rd, a << d.imm);
    else if (d.mnemonic === 'tshela') {
      const address = (a + d.imm) | 0;
      const problem = addressProblem(address);
      if (problem !== '') { stopReason = `load: ${problem}`; break; }
      write(d.rd, dmem[address / 4]);
    } else if (d.mnemonic === 'boloka') {
      const address = (a + d.imm) | 0;
      const problem = addressProblem(address);
      if (problem !== '') { stopReason = `store: ${problem}`; break; }
      dmem[address / 4] = b;
    } else if (d.class === 'branch') {
      if (d.mnemonic === 'lekana') taken = a === b;
      if (d.mnemonic === 'haelekane') taken = a !== b;
      if (d.mnemonic === 'nyane') taken = a < b;                 // signed compare
      if (taken) nextPc = pc + d.imm;
    } else if (d.mnemonic === 'tlola') {
      write(d.rd, pc + 4);
      taken = true;
      nextPc = pc + d.imm;
    } else if (d.mnemonic === 'khutla') {
      const target = (a + d.imm) | 0;                            // read rs1 BEFORE writing rd (rule 4)
      write(d.rd, pc + 4);
      taken = true;
      nextPc = target;
    }

    instructions++;

    // ---- halt: a branch to itself (spec section 6) ----
    if (d.isHalt) { halted = true; break; }

    if (taken) {
      flushed += 2;
      const problem = targetProblem(nextPc);
      if (problem !== '') { stopReason = `jump: ${problem}`; break; }
    }

    previous = d;
    pc = nextPc;
  }

  if (!halted && stopReason === '') stopReason = 'the program did not halt within the step limit';

  return {
    halted: halted,
    stopReason: stopReason,
    pc: pc,
    regs: regs,
    dmem: dmem,
    instructions: instructions,
    stalls: stalls,
    flushed: flushed,
    cycles: instructions + 4 + stalls + flushed,     // spec section 6, "Cycle counting"
  };
}
