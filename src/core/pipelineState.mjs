// PROVISIONAL: field names and aluOp values to be confirmed against the frozen ISA.
export const bubbleCtrl = () => ({
  regWrite: false, aluSrc: false, aluOp: 'ADD', memRead: false,
  memWrite: false, wbSel: 'ALU', branch: false, jump: false, jalr: false,
});

export const bubbleIFID  = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0 });
export const bubbleIDEX  = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0,
  rs1: 0, rs2: 0, rd: 0, rs1Val: 0, rs2Val: 0, imm: 0, ctrl: bubbleCtrl() });
export const bubbleEXMEM = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0,
  rd: 0, aluResult: 0, storeData: 0, ctrl: bubbleCtrl() });
export const bubbleMEMWB = () => ({ valid: false, pc: 0, instr: 0, pcPlus4: 0,
  rd: 0, aluResult: 0, memData: 0, ctrl: bubbleCtrl() });

export function createState({ imem = new Uint32Array(1024), dmem = new Uint32Array(1024) } = {}) {
  return {
    cycle: 0, pc: 0, halted: false,
    regs: new Int32Array(32), imem, dmem,
    ifid: bubbleIFID(), idex: bubbleIDEX(), exmem: bubbleEXMEM(), memwb: bubbleMEMWB(),
  };
}

// Reset keeps the loaded program, clears everything else.
export const reset = (s) => createState({ imem: s.imem });

// SCAFFOLD ONLY (replaced in M3): moves metadata one stage per cycle.
// Every stage reads the OLD state `s`; nothing in `s` is mutated.
const carry = (prev, bubble) =>
  prev.valid ? { ...bubble, valid: true, pc: prev.pc, instr: prev.instr, pcPlus4: prev.pcPlus4 } : bubble;

export function step(s) {
  const instr = s.imem[s.pc >>> 2] ?? 0;
  return {
    ...s,
    cycle: s.cycle + 1,
    pc: s.pc + 4,
    ifid:  { valid: true, pc: s.pc, instr, pcPlus4: s.pc + 4 },
    idex:  carry(s.ifid,  bubbleIDEX()),
    exmem: carry(s.idex,  bubbleEXMEM()),
    memwb: carry(s.exmem, bubbleMEMWB()),
  };
}
