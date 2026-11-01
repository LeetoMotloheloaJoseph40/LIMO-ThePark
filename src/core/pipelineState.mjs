// Five-stage LIMO pipeline. The frozen ISA is documented in
// docs/ISA-spec-v1.1-frozen.md; this module deliberately has no UI/assembler imports.

const u32 = (value) => Number(value) >>> 0;
const i32 = (value) => Number(value) | 0;
const sext = (value, bits) => (value << (32 - bits)) >> (32 - bits);

export const bubbleCtrl = () => ({
  regWrite: false, aluSrc: false, aluOp: 'ADD', memRead: false,
  memWrite: false, wbSel: 'ALU', branch: false, jump: false, jalr: false,
});

export const bubbleIFID = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0 });
export const bubbleIDEX = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0,
  rs1: 0, rs2: 0, rd: 0, rs1Val: 0, rs2Val: 0, imm: 0, ctrl: bubbleCtrl() });
export const bubbleEXMEM = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0,
  rs1: 0, rs2: 0, rd: 0, aluResult: 0, storeData: 0, imm: 0,
  haltCandidate: false, ctrl: bubbleCtrl() });
export const bubbleMEMWB = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0,
  rd: 0, aluResult: 0, memData: 0, haltCandidate: false, ctrl: bubbleCtrl() });

const makeTrace = (cycle, narration = []) => ({ cycle, narration });

export function createState({ imem = new Uint32Array(1024), dmem = new Uint32Array(1024) } = {}) {
  const regs = new Int32Array(32);
  regs[2] = 0x1000; // lesupa: one word above the top of the byte-addressed data memory.
  return {
    cycle: 0, pc: 0, halted: false, error: null,
    instructionCount: 0, stalls: 0, flushed: 0,
    regs, imem, dmem: dmem.slice(),
    ifid: bubbleIFID(), idex: bubbleIDEX(), exmem: bubbleEXMEM(), memwb: bubbleMEMWB(),
    trace: makeTrace(0, ['Reset: PC=0x00000000, p0=0, p2=0x00001000; pipeline empty.']),
  };
}

// Reset preserves the loaded program but restores the architectural reset state.
export const reset = (state) => createState({ imem: state.imem });

function decode(instr, pc, regs) {
  const opcode = instr & 0x7f;
  const rd = (instr >>> 7) & 31;
  const funct3 = (instr >>> 12) & 7;
  const rs1 = (instr >>> 15) & 31;
  const rs2 = (instr >>> 20) & 31;
  const funct7 = instr >>> 25;
  const base = {
    valid: true, pc, instr: u32(instr), pcPlus4: u32(pc + 4),
    rs1, rs2, rd, rs1Val: rs1 === 0 ? 0 : i32(regs[rs1]),
    rs2Val: rs2 === 0 ? 0 : i32(regs[rs2]), imm: 0,
    ctrl: { ...bubbleCtrl() },
  };
  const illegal = () => { throw new Error(`unsupported instruction 0x${u32(instr).toString(16).padStart(8, '0')}`); };

  switch (opcode) {
    case 0x33: // R-type
      if (funct3 === 0 && funct7 === 0) base.ctrl.aluOp = 'ADD';
      else if (funct3 === 0 && funct7 === 0x20) base.ctrl.aluOp = 'SUB';
      else if (funct3 === 7 && funct7 === 0) base.ctrl.aluOp = 'AND';
      else if (funct3 === 6 && funct7 === 0) base.ctrl.aluOp = 'OR';
      else return illegal();
      base.ctrl.regWrite = true;
      break;
    case 0x13: // I ALU
      if (funct3 === 0) base.ctrl.aluOp = 'ADD';
      else if (funct3 === 1 && funct7 === 0) base.ctrl.aluOp = 'SLL';
      else return illegal();
      base.imm = funct3 === 1 ? rs2 : sext(instr >>> 20, 12);
      base.ctrl.aluSrc = true;
      base.ctrl.regWrite = true;
      break;
    case 0x03: // tshela (lw)
      if (funct3 !== 2) return illegal();
      base.imm = sext(instr >>> 20, 12);
      base.ctrl.aluSrc = true; base.ctrl.aluOp = 'ADD';
      base.ctrl.memRead = true; base.ctrl.regWrite = true; base.ctrl.wbSel = 'MEM';
      break;
    case 0x23: { // boloka (sw)
      if (funct3 !== 2) return illegal();
      const raw = ((instr >>> 25) << 5) | ((instr >>> 7) & 31);
      base.imm = sext(raw, 12);
      base.ctrl.aluSrc = true; base.ctrl.aluOp = 'ADD'; base.ctrl.memWrite = true;
      break;
    }
    case 0x63: { // lekana, haelekane, nyane
      if (![0, 1, 4].includes(funct3)) return illegal();
      const raw = (((instr >>> 31) & 1) << 12)
        | (((instr >>> 7) & 1) << 11)
        | (((instr >>> 25) & 0x3f) << 5)
        | (((instr >>> 8) & 0xf) << 1);
      base.imm = sext(raw, 13);
      base.ctrl.branch = true;
      base.ctrl.aluOp = funct3 === 4 ? 'SLT' : 'SUB';
      base.ctrl.branchKind = funct3 === 0 ? 'EQ' : (funct3 === 1 ? 'NE' : 'LT');
      base.ctrl.usesRs1 = true; base.ctrl.usesRs2 = true;
      break;
    }
    case 0x6f: { // tlola (jal)
      const raw = (((instr >>> 31) & 1) << 20)
        | (((instr >>> 12) & 0xff) << 12)
        | (((instr >>> 20) & 1) << 11)
        | (((instr >>> 21) & 0x3ff) << 1);
      base.imm = sext(raw, 21);
      base.ctrl.jump = true; base.ctrl.regWrite = true; base.ctrl.wbSel = 'PC4';
      base.ctrl.usesRs1 = false; base.ctrl.usesRs2 = false;
      break;
    }
    case 0x67: // khutla (jalr)
      if (funct3 !== 0) return illegal();
      base.imm = sext(instr >>> 20, 12);
      base.ctrl.jump = true; base.ctrl.jalr = true;
      base.ctrl.regWrite = true; base.ctrl.wbSel = 'PC4';
      base.ctrl.usesRs1 = true; base.ctrl.usesRs2 = false;
      break;
    default: return illegal();
  }
  // Opcode-aware source use is also used by load-use detection.
  if (base.ctrl.usesRs1 === undefined) base.ctrl.usesRs1 = !base.ctrl.jump;
  if (base.ctrl.usesRs2 === undefined) {
    base.ctrl.usesRs2 = opcode === 0x33 || opcode === 0x23;
  }
  return base;
}

function writebackValue(slot) {
  if (slot.ctrl.wbSel === 'MEM') return i32(slot.memData);
  if (slot.ctrl.wbSel === 'PC4') return i32(slot.pcPlus4);
  return i32(slot.aluResult);
}

function forwardedValue(reg, original, exmem, memwb, memValue) {
  if (reg === 0) return 0;
  if (exmem.valid && exmem.ctrl.regWrite && exmem.rd === reg && exmem.rd !== 0 && !exmem.ctrl.memRead) {
    return i32(exmem.ctrl.wbSel === 'PC4' ? exmem.pcPlus4 : exmem.aluResult);
  }
  if (memwb.valid && memwb.ctrl.regWrite && memwb.rd === reg && memwb.rd !== 0) return memValue;
  return i32(original);
}

function needsSource(slot, reg, which) {
  if (!slot?.valid || reg === 0) return false;
  return which === 'rs1' ? slot.ctrl.usesRs1 && slot.rs1 === reg : slot.ctrl.usesRs2 && slot.rs2 === reg;
}

function validTarget(target) {
  return Number.isInteger(target) && target >= 0 && target <= 4092 && (target & 3) === 0;
}

function slotLabel(slot) {
  return slot.valid ? `0x${u32(slot.pc).toString(16).padStart(8, '0')}` : 'bubble';
}

// One call is one rising edge: every stage reads the old state and commits together.
export function step(state) {
  if (state.halted || state.error) return state;

  const cycle = state.cycle + 1;
  const regs = state.regs.slice();
  const dmem = state.dmem.slice();
  const narration = [];
  const memwb = state.memwb;
  const wbValue = memwb.valid && memwb.ctrl.regWrite ? writebackValue(memwb) : 0;
  let instructionCount = state.instructionCount;
  let halted = false;
  let error = null;

  // WB and MEM commit from the prior state. p0 is physically constant.
  if (memwb.valid) {
    instructionCount++;
    if (memwb.ctrl.regWrite && memwb.rd !== 0) regs[memwb.rd] = wbValue;
    if (memwb.haltCandidate) halted = true;
  }
  regs[0] = 0;
  const nextMEMWB = bubbleMEMWB();
  const oldEXMEM = state.exmem;
  if (oldEXMEM.valid) {
    Object.assign(nextMEMWB, {
      valid: true, pc: oldEXMEM.pc, instr: oldEXMEM.instr, pcPlus4: oldEXMEM.pcPlus4,
      rd: oldEXMEM.rd, aluResult: oldEXMEM.aluResult, ctrl: { ...oldEXMEM.ctrl },
      haltCandidate: oldEXMEM.haltCandidate,
    });
    if (oldEXMEM.ctrl.memRead || oldEXMEM.ctrl.memWrite) {
      const address = u32(oldEXMEM.aluResult);
      if ((address & 3) !== 0) error = `load/store at 0x${address.toString(16).padStart(8, '0')} is not word-aligned`;
      else if (address > 0xffc) error = `load/store address 0x${address.toString(16).padStart(8, '0')} is outside data memory`;
      else if (oldEXMEM.ctrl.memRead) nextMEMWB.memData = dmem[address >>> 2];
      else dmem[address >>> 2] = i32(oldEXMEM.storeData);
      narration.push(oldEXMEM.ctrl.memRead
        ? `MEM: read MEM[0x${address.toString(16).padStart(3, '0')}] = ${nextMEMWB.memData}.`
        : `MEM: write MEM[0x${address.toString(16).padStart(3, '0')}] = ${oldEXMEM.storeData}.`);
    }
  }

  const nextEXMEM = bubbleEXMEM();
  let redirect = null;
  const oldIDEX = state.idex;
  if (oldIDEX.valid && !error) {
    const a = forwardedValue(oldIDEX.rs1, oldIDEX.rs1Val, oldEXMEM, memwb, wbValue);
    const b = forwardedValue(oldIDEX.rs2, oldIDEX.rs2Val, oldEXMEM, memwb, wbValue);
    const operandB = oldIDEX.ctrl.aluSrc ? oldIDEX.imm : b;
    let aluResult;
    switch (oldIDEX.ctrl.aluOp) {
      case 'ADD': aluResult = i32(a + operandB); break;
      case 'SUB': aluResult = i32(a - operandB); break;
      case 'AND': aluResult = i32(a & operandB); break;
      case 'OR': aluResult = i32(a | operandB); break;
      case 'SLL': aluResult = i32(a << (operandB & 31)); break;
      case 'SLT': aluResult = a < b ? 1 : 0; break;
      default: aluResult = 0;
    }
    const kind = oldIDEX.ctrl.branchKind;
    const branchTaken = oldIDEX.ctrl.branch && (kind === 'EQ' ? a === b : kind === 'NE' ? a !== b : a < b);
    if (branchTaken || oldIDEX.ctrl.jump) {
      const target = oldIDEX.ctrl.jalr ? u32(a + oldIDEX.imm) & ~1 : u32(oldIDEX.pc + oldIDEX.imm);
      if (!validTarget(target)) error = `control target 0x${target.toString(16).padStart(8, '0')} is unaligned or outside instruction memory`;
      else redirect = { target, haltCandidate: oldIDEX.ctrl.branch && target === oldIDEX.pc };
    }
    Object.assign(nextEXMEM, {
      valid: true, pc: oldIDEX.pc, instr: oldIDEX.instr, pcPlus4: oldIDEX.pcPlus4,
      rs1: oldIDEX.rs1, rs2: oldIDEX.rs2, rd: oldIDEX.rd,
      aluResult: oldIDEX.ctrl.jump ? oldIDEX.pcPlus4 : aluResult,
      storeData: b, imm: oldIDEX.imm, ctrl: { ...oldIDEX.ctrl },
      haltCandidate: Boolean(redirect?.haltCandidate),
    });
    narration.push(`EX: ${slotLabel(oldIDEX)} A=${a}, B=${operandB}, result=${oldIDEX.ctrl.jump ? oldIDEX.pcPlus4 : aluResult}${redirect ? `; redirect 0x${redirect.target.toString(16).padStart(8, '0')}` : ''}.`);
  }

  const nextIDEX = bubbleIDEX();
  const nextIFID = bubbleIFID();
  let pc = state.pc;
  let stalls = state.stalls;
  let flushed = state.flushed;
  if (halted) {
    narration.push('WB: self-branch halt committed; pipeline stopped.');
  } else if (error) {
    narration.push(`Stopped at cycle ${cycle}: ${error}.`);
  } else if (redirect) {
    pc = redirect.target;
    if (!redirect.haltCandidate) flushed += 2;
    narration.push(`Control hazard: flushed IF and ID; next PC=0x${pc.toString(16).padStart(8, '0')}.`);
  } else {
    let decoded = null;
    if (state.ifid.valid) {
      try { decoded = decode(state.ifid.instr, state.ifid.pc, regs); }
      catch (cause) { error = `instruction at 0x${u32(state.ifid.pc).toString(16).padStart(8, '0')}: ${cause.message}`; }
    }
    if (error) {
      narration.push(`Stopped: ${error}.`);
    }
    if (state.ifid.valid && oldIDEX.valid && oldIDEX.ctrl.memRead && oldIDEX.rd !== 0
      && (needsSource(decoded, oldIDEX.rd, 'rs1') || needsSource(decoded, oldIDEX.rd, 'rs2'))) {
      // Hold the fetch address and IF/ID; insert one empty ID/EX slot.
      Object.assign(nextIFID, state.ifid);
      stalls++;
      narration.push(`Load-use stall: held ${slotLabel(state.ifid)} for one cycle.`);
    } else if (decoded) {
      Object.assign(nextIDEX, decoded);
      narration.push(`ID: decoded ${slotLabel(decoded)} (${decoded.ctrl.aluOp}${decoded.ctrl.memRead ? ', load' : ''}${decoded.ctrl.memWrite ? ', store' : ''}${decoded.ctrl.branch ? ', branch' : ''}${decoded.ctrl.jump ? ', jump' : ''}).`);
    }

    const held = stalls > state.stalls;
    if (error) {
      // Stop before fetching younger work; older stages already committed this edge.
    } else if (held) {
      pc = state.pc;
      Object.assign(nextIFID, state.ifid);
    } else {
      const fetchAddress = state.pc;
      if ((fetchAddress & 3) !== 0 || fetchAddress > 4092) {
        error = `fetch address 0x${u32(fetchAddress).toString(16).padStart(8, '0')} is outside instruction memory or unaligned`;
      } else {
        const word = state.imem[fetchAddress >>> 2] ?? 0;
        Object.assign(nextIFID, { valid: true, pc: fetchAddress, instr: u32(word), pcPlus4: u32(fetchAddress + 4) });
        pc = u32(fetchAddress + 4);
        narration.push(`IF: fetched 0x${u32(word).toString(16).padStart(8, '0')} from 0x${fetchAddress.toString(16).padStart(8, '0')}.`);
      }
    }
    if (state.ifid.valid) narration.push(`ID input: ${slotLabel(state.ifid)}.`);
  }

  // p0 is invariant even if callers supplied a malformed starting register array.
  regs[0] = 0;
  return {
    ...state, cycle, pc, halted: halted || Boolean(error), error,
    instructionCount, stalls, flushed, regs, dmem,
    ifid: nextIFID, idex: nextIDEX, exmem: nextEXMEM, memwb: nextMEMWB,
    trace: makeTrace(cycle, narration),
  };
}
