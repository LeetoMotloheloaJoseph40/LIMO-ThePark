// Five-stage, hazard-free LIMO pipeline core.
// Each stage reads the old state. step() returns a new state and never mutates its input.
// Forwarding, load-use stalls and hazard statistics are intentionally left to M4.

const WORDS = 1024;
const DATA_TOP = WORDS - 1;

export const bubbleCtrl = () => ({
  regWrite: false, aluSrc: false, aluOp: 'ADD', memRead: false,
  memWrite: false, wbSel: 'ALU', branch: false, jump: false, jalr: false,
  branchKind: null,
});

export const bubbleIFID = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0 });
export const bubbleIDEX = () => ({
  valid: false, pc: 0, instr: 0, pcPlus4: 0, rs1: 0, rs2: 0, rd: 0,
  rs1Val: 0, rs2Val: 0, imm: 0, usesRs1: false, usesRs2: false, ctrl: bubbleCtrl(),
});
export const bubbleEXMEM = () => ({
  valid: false, pc: 0, instr: 0, pcPlus4: 0, rd: 0, aluResult: 0,
  storeData: 0, halt: false, ctrl: bubbleCtrl(),
});
export const bubbleMEMWB = () => ({
  valid: false, pc: 0, instr: 0, pcPlus4: 0, rd: 0, aluResult: 0,
  memData: 0, halt: false, ctrl: bubbleCtrl(),
});

function freshRegisters() {
  const regs = new Int32Array(32);
  regs[2] = 0x1000; // lesupa/sp resets one word above data memory.
  return regs;
}

function asWords(memory, fallbackLength = WORDS) {
  if (memory instanceof Uint32Array) return memory.slice();
  if (memory === undefined) return new Uint32Array(fallbackLength);
  return Uint32Array.from(memory);
}

export function createState({ imem, dmem } = {}) {
  const instructionMemory = asWords(imem);
  const dataMemory = asWords(dmem, WORDS);
  if (instructionMemory.length !== WORDS || dataMemory.length !== WORDS) {
    throw new RangeError('Instruction and data memory must each contain 1024 words (4 KiB).');
  }
  return {
    cycle: 0, pc: 0, halted: false, haltPending: false, error: null,
    regs: freshRegisters(), imem: instructionMemory, dmem: dataMemory,
    ifid: bubbleIFID(), idex: bubbleIDEX(), exmem: bubbleEXMEM(), memwb: bubbleMEMWB(),
    trace: null,
  };
}

// Reset architectural state and pipeline registers while keeping the loaded program.
export function reset(state) {
  return createState({ imem: state.imem });
}

const signExtend = (value, bits) => (value << (32 - bits)) >> (32 - bits);
const u32 = (value) => value >>> 0;
const hex32 = (value) => '0x' + u32(value).toString(16).toUpperCase().padStart(8, '0');

function decode(instr, pc, regs) {
  const opcode = instr & 0x7f;
  const rd = (instr >>> 7) & 0x1f;
  const funct3 = (instr >>> 12) & 7;
  const rs1 = (instr >>> 15) & 0x1f;
  const rs2 = (instr >>> 20) & 0x1f;
  const funct7 = (instr >>> 25) & 0x7f;
  let mnemonic;
  let imm = 0;
  let usesRs1 = false;
  let usesRs2 = false;
  const ctrl = bubbleCtrl();

  if (opcode === 0x33) {
    usesRs1 = true;
    usesRs2 = true;
    ctrl.regWrite = true;
    if (funct3 === 0 && funct7 === 0) { mnemonic = 'kopanya'; ctrl.aluOp = 'ADD'; }
    else if (funct3 === 0 && funct7 === 0x20) { mnemonic = 'tlosa'; ctrl.aluOp = 'SUB'; }
    else if (funct3 === 7 && funct7 === 0) { mnemonic = 'le'; ctrl.aluOp = 'AND'; }
    else if (funct3 === 6 && funct7 === 0) { mnemonic = 'kapa'; ctrl.aluOp = 'OR'; }
  } else if (opcode === 0x13) {
    usesRs1 = true;
    ctrl.aluSrc = true;
    ctrl.regWrite = true;
    if (funct3 === 0) { mnemonic = 'kopanyah'; imm = signExtend(instr >>> 20, 12); ctrl.aluOp = 'ADD'; }
    else if (funct3 === 1 && funct7 === 0) { mnemonic = 'chetse'; imm = rs2; ctrl.aluOp = 'SLL'; }
  } else if (opcode === 0x03 && funct3 === 2) {
    mnemonic = 'tshela';
    usesRs1 = true;
    imm = signExtend(instr >>> 20, 12);
    ctrl.aluSrc = true; ctrl.aluOp = 'ADD'; ctrl.memRead = true;
    ctrl.regWrite = true; ctrl.wbSel = 'MEM';
  } else if (opcode === 0x23 && funct3 === 2) {
    mnemonic = 'boloka';
    usesRs1 = true; usesRs2 = true;
    imm = signExtend(((instr >>> 25) << 5) | ((instr >>> 7) & 0x1f), 12);
    ctrl.aluSrc = true; ctrl.aluOp = 'ADD'; ctrl.memWrite = true;
  } else if (opcode === 0x63 && [0, 1, 4].includes(funct3)) {
    mnemonic = funct3 === 0 ? 'lekana' : funct3 === 1 ? 'haelekane' : 'nyane';
    usesRs1 = true; usesRs2 = true;
    imm = signExtend(
      (((instr >>> 31) & 1) << 12) |
      (((instr >>> 7) & 1) << 11) |
      (((instr >>> 25) & 0x3f) << 5) |
      (((instr >>> 8) & 0xf) << 1), 13,
    );
    ctrl.aluOp = mnemonic === 'lekana' ? 'EQ' : mnemonic === 'haelekane' ? 'NE' : 'LT';
    ctrl.branch = true; ctrl.branchKind = mnemonic;
  } else if (opcode === 0x6f) {
    mnemonic = 'tlola';
    imm = signExtend(
      (((instr >>> 31) & 1) << 20) |
      (((instr >>> 21) & 0x3ff) << 1) |
      (((instr >>> 20) & 1) << 11) |
      (((instr >>> 12) & 0xff) << 12), 21,
    );
    ctrl.aluSrc = null; ctrl.aluOp = null;
    ctrl.jump = true; ctrl.regWrite = true; ctrl.wbSel = 'PC4';
  } else if (opcode === 0x67 && funct3 === 0) {
    mnemonic = 'khutla';
    usesRs1 = true;
    imm = signExtend(instr >>> 20, 12);
    ctrl.aluSrc = true; ctrl.aluOp = 'ADD';
    ctrl.jalr = true; ctrl.regWrite = true; ctrl.wbSel = 'PC4';
  }

  if (!mnemonic) {
    throw new Error(`Invalid LIMO instruction ${hex32(instr)} at PC ${hex32(pc)}.`);
  }
  return {
    mnemonic, rd, rs1, rs2, imm, usesRs1, usesRs2, ctrl,
    rs1Val: rs1 === 0 ? 0 : regs[rs1],
    rs2Val: rs2 === 0 ? 0 : regs[rs2],
  };
}

function branchTaken(kind, a, b) {
  if (kind === 'lekana') return a === b;
  if (kind === 'haelekane') return a !== b;
  return a < b; // nyane is a signed comparison.
}

function execute(idex) {
  if (!idex.valid) return { result: 0, target: null, taken: false, halt: false, aluA: 0, aluB: 0 };
  const { ctrl } = idex;
  const aluA = idex.rs1Val | 0;
  const aluB = ctrl.aluSrc ? idex.imm | 0 : idex.rs2Val | 0;
  let result = 0;
  if (ctrl.aluOp === 'ADD') result = (aluA + aluB) | 0;
  else if (ctrl.aluOp === 'SUB') result = (aluA - aluB) | 0;
  else if (ctrl.aluOp === 'AND') result = aluA & aluB;
  else if (ctrl.aluOp === 'OR') result = aluA | aluB;
  else if (ctrl.aluOp === 'SLL') result = aluA << (idex.imm & 31);
  else if (ctrl.aluOp === 'EQ') result = aluA === aluB ? 1 : 0;
  else if (ctrl.aluOp === 'NE') result = aluA !== aluB ? 1 : 0;
  else if (ctrl.aluOp === 'LT') result = aluA < aluB ? 1 : 0;

  let taken = false;
  let target = null;
  if (ctrl.branch) {
    taken = branchTaken(ctrl.branchKind, aluA, idex.rs2Val | 0);
    if (taken) target = (idex.pc + idex.imm) >>> 0;
  } else if (ctrl.jump) target = (idex.pc + idex.imm) >>> 0;
  else if (ctrl.jalr) target = (((aluA + idex.imm) >>> 0) & 0xfffffffe) >>> 0;

  const halt = ctrl.branch && taken && target === idex.pc;
  return { result: result | 0, target, taken, halt, aluA, aluB };
}

function fault(state, pc, message, trace, committed = {}) {
  return {
    ...state, ...committed, cycle: state.cycle + 1, halted: true, haltPending: false,
    error: { pc: u32(pc), message }, trace: { ...trace, error: message },
  };
}

function stageSummary(slot) {
  return slot.valid ? { valid: true, pc: slot.pc, instr: slot.instr } : { valid: false, bubble: true };
}

export function step(state) {
  if (state.halted) return state;

  const cycle = state.cycle + 1;
  const regs = state.regs.slice();
  const dmem = state.dmem.slice();
  const narration = [];
  const wb = { valid: state.memwb.valid, rd: 0, value: null, wroteRegister: false };

  // WB commits first so ID reads the value written in the first half-cycle.
  if (state.memwb.valid && state.memwb.ctrl.regWrite) {
    const source = state.memwb.ctrl.wbSel;
    const value = source === 'MEM' ? state.memwb.memData
      : source === 'PC4' ? state.memwb.pcPlus4 : state.memwb.aluResult;
    wb.rd = state.memwb.rd; wb.value = value | 0;
    if (state.memwb.rd !== 0) {
      regs[state.memwb.rd] = value | 0;
      wb.wroteRegister = true;
    }
    narration.push(state.memwb.rd === 0
      ? `WB: ${state.memwb.ctrl.wbSel} result discarded for p0.`
      : `WB: wrote ${value | 0} to p${state.memwb.rd}.`);
  } else if (state.memwb.valid) narration.push('WB: instruction has no register write.');
  regs[0] = 0;

  let memData = 0;
  const memory = { valid: state.exmem.valid, address: null, readData: null, writeData: null, didRead: false, didWrite: false };
  if (state.exmem.valid && (state.exmem.ctrl.memRead || state.exmem.ctrl.memWrite)) {
    const address = state.exmem.aluResult >>> 0;
    memory.address = address;
    if ((address & 3) !== 0) {
      return fault(state, state.exmem.pc, `Memory address ${hex32(address)} is not word-aligned.`, {
        cycle,
        stages: { MEM: { ...memory, error: `Memory address ${hex32(address)} is not word-aligned.` } },
        narration: [...narration, `MEM: stopped at misaligned address ${hex32(address)}.`],
      }, { regs, dmem });
    }
    if (address > DATA_TOP * 4) {
      return fault(state, state.exmem.pc, `Memory address ${hex32(address)} is outside data memory (0x00000000-0x00000FFC).`, {
        cycle,
        stages: { MEM: { ...memory, error: `Memory address ${hex32(address)} is outside data memory.` } },
        narration: [...narration, `MEM: stopped at out-of-range address ${hex32(address)}.`],
      }, { regs, dmem });
    }
    const index = address >>> 2;
    if (state.exmem.ctrl.memRead) {
      memData = state.dmem[index] | 0;
      memory.readData = memData; memory.didRead = true;
      narration.push(`MEM: read ${memData} from ${hex32(address)}.`);
    } else {
      memory.writeData = state.exmem.storeData | 0; memory.didWrite = true;
      dmem[index] = state.exmem.storeData >>> 0;
      narration.push(`MEM: stored ${state.exmem.storeData | 0} at ${hex32(address)}.`);
    }
  } else if (state.exmem.valid) narration.push('MEM: no data-memory access.');

  const ex = execute(state.idex);
  if (state.idex.valid && ex.target !== null) {
    if ((ex.target & 3) !== 0 || ex.target >= WORDS * 4) {
      return fault(state, state.idex.pc, `Control-transfer target ${hex32(ex.target)} is unaligned or outside instruction memory.`, {
        cycle,
        stages: {
          EX: {
            valid: true, pc: state.idex.pc, instr: state.idex.instr,
            mnemonic: state.idex.mnemonic, aluA: ex.aluA | 0, aluB: ex.aluB | 0,
            branchTaken: ex.taken, branchTarget: ex.target,
            error: `Control-transfer target ${hex32(ex.target)} is unaligned or outside instruction memory.`,
          },
        },
        narration: [...narration, `EX: stopped at invalid target ${hex32(ex.target)}.`],
      }, { regs, dmem });
    }
    if (ex.taken || state.idex.ctrl.jump || state.idex.ctrl.jalr) {
      narration.push(`EX: ${state.idex.mnemonic} transfers control to ${hex32(ex.target)}.`);
    }
  } else if (state.idex.valid) narration.push(`EX: ${state.idex.mnemonic} computed ${ex.result | 0}.`);

  // Resolve EX before ID so an invalid younger word on a taken path is
  // discarded by the flush instead of being reported as an executed fault.
  const redirect = state.idex.valid && ex.target !== null && (ex.taken || state.idex.ctrl.jump || state.idex.ctrl.jalr);
  let decoded = null;
  try {
    if (state.ifid.valid && !redirect) decoded = decode(state.ifid.instr, state.ifid.pc, regs);
  } catch (error) {
    return fault(state, state.ifid.pc, error.message, {
      cycle,
      stages: { ID: { valid: true, pc: state.ifid.pc, instr: state.ifid.instr, error: error.message } },
      narration: [...narration, `ID: ${error.message}`],
    }, { regs, dmem });
  }
  if (decoded) narration.push(`ID: decoded ${decoded.mnemonic}.`);

  const oldFetchPc = state.pc >>> 0;
  const fetched = state.haltPending ? null : {
    valid: true, pc: oldFetchPc, instr: state.imem[oldFetchPc >>> 2] ?? 0,
    pcPlus4: (oldFetchPc + 4) >>> 0,
  };
  let nextPc = state.haltPending ? state.pc >>> 0 : (state.pc + 4) >>> 0;
  let nextIFID = fetched ?? bubbleIFID();
  let nextIDEX = decoded ? {
    valid: true, pc: state.ifid.pc, instr: state.ifid.instr, pcPlus4: state.ifid.pcPlus4,
    rs1: decoded.rs1, rs2: decoded.rs2, rd: decoded.rd,
    rs1Val: decoded.rs1Val | 0, rs2Val: decoded.rs2Val | 0, imm: decoded.imm | 0,
    usesRs1: decoded.usesRs1, usesRs2: decoded.usesRs2, mnemonic: decoded.mnemonic,
    ctrl: decoded.ctrl,
  } : bubbleIDEX();

  // Basic EX-stage redirect is needed for ISA control-flow semantics. M4 adds
  // hazard-unit accounting, forwarding and load-use stalls around this path.
  let haltPending = state.haltPending;
  if (redirect) {
    nextPc = ex.target;
    nextIFID = bubbleIFID();
    nextIDEX = bubbleIDEX();
    if (ex.halt) haltPending = true;
    narration.push('Control redirect: younger IF and ID slots were cleared.');
  }

  const nextEXMEM = state.idex.valid ? {
    valid: true, pc: state.idex.pc, instr: state.idex.instr, pcPlus4: state.idex.pcPlus4,
    rd: state.idex.rd, aluResult: ex.result | 0, storeData: state.idex.rs2Val | 0,
    halt: ex.halt, ctrl: { ...state.idex.ctrl },
  } : bubbleEXMEM();
  const nextMEMWB = state.exmem.valid ? {
    valid: true, pc: state.exmem.pc, instr: state.exmem.instr, pcPlus4: state.exmem.pcPlus4,
    rd: state.exmem.rd, aluResult: state.exmem.aluResult | 0, memData: memData | 0,
    halt: state.exmem.halt, ctrl: { ...state.exmem.ctrl },
  } : bubbleMEMWB();

  const halted = state.memwb.valid && state.memwb.halt;
  if (halted) narration.push('WB: halt branch completed; execution stopped.');
  const trace = {
    cycle,
    stages: {
      IF: fetched ? { valid: true, pc: fetched.pc, instr: fetched.instr, flushed: redirect } : { valid: false, bubble: true },
      ID: decoded ? {
        valid: true, pc: state.ifid.pc, instr: state.ifid.instr, mnemonic: decoded.mnemonic,
        rs1: decoded.rs1, rs2: decoded.rs2, rd: decoded.rd, imm: decoded.imm,
      } : redirect && state.ifid.valid
        ? { ...stageSummary(state.ifid), flushed: true }
        : stageSummary(state.ifid),
      EX: state.idex.valid ? {
        valid: true, pc: state.idex.pc, instr: state.idex.instr, mnemonic: state.idex.mnemonic,
        aluA: ex.aluA | 0, aluB: ex.aluB | 0, aluResult: ex.result | 0,
        branchTaken: ex.taken, branchTarget: ex.target,
      } : { valid: false, bubble: true },
      MEM: { ...memory },
      WB: {
        valid: state.memwb.valid,
        ...(state.memwb.valid
          ? { pc: state.memwb.pc, instr: state.memwb.instr }
          : { bubble: true }),
        ...(state.memwb.valid && state.memwb.ctrl.regWrite ? { rd: wb.rd } : {}),
        value: wb.value, wroteRegister: wb.wroteRegister,
      },
    },
    control: {
      ID: decoded ? { ...decoded.ctrl } : bubbleCtrl(),
      EX: state.idex.valid ? { ...state.idex.ctrl } : bubbleCtrl(),
      MEM: state.exmem.valid ? { ...state.exmem.ctrl } : bubbleCtrl(),
      WB: state.memwb.valid ? { ...state.memwb.ctrl } : bubbleCtrl(),
    },
    memoryAddress: memory.address, memoryReadData: memory.readData,
    memoryWriteData: memory.writeData, writeBackValue: wb.value,
    redirect: redirect ? ex.target : null,
    narration,
  };

  return {
    ...state,
    cycle, pc: nextPc, halted, haltPending,
    regs, dmem,
    ifid: nextIFID, idex: nextIDEX, exmem: nextEXMEM, memwb: nextMEMWB,
    trace,
  };
}
