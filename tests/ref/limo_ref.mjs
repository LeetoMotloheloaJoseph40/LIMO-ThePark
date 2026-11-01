//   runISA()  - instruction-level interpreter: final registers, memory, executed trace.
//   timing()  - cycles / stalls / flushed for that trace, with Forwarding ON or OFF.
//   hazards() - classifies every dependence in the trace (RAW distance, load-use, control)

const SP_RESET = 0x1000;           // spec section 2: p2 (lesupa) resets to 0x00001000
const MEM_BYTES = 4096;            // data memory 0x000-0xFFC, word access only

const sext = (v, bits) => (v << (32 - bits)) >> (32 - bits);

export function decode(w) {
  w = w >>> 0;
  const opc = w & 0x7f, rd = (w >>> 7) & 31, f3 = (w >>> 12) & 7;
  const rs1 = (w >>> 15) & 31, rs2 = (w >>> 20) & 31, f7 = w >>> 25;
  const immI = sext(w >>> 20, 12);
  const immS = sext(((w >>> 25) << 5) | ((w >>> 7) & 31), 12);
  const immB = sext(((w >>> 31) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 63) << 5) | (((w >>> 8) & 15) << 1), 13);
  const immJ = sext(((w >>> 31) << 20) | (((w >>> 12) & 255) << 12) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 1023) << 1), 21);
  const mk = (op, o) => ({ op, word: w, rd: 0, rs1: 0, rs2: 0, imm: 0, uses1: false, uses2: false,
                           writes: false, isLoad: false, isStore: false, isBranch: false, isJump: false, ...o });
  if (opc === 0x33) {
    const names = { '0,0': 'kopanya', '0,32': 'tlosa', '7,0': 'le', '6,0': 'kapa' };
    const op = names[f3 + ',' + f7];
    if (op) return mk(op, { rd, rs1, rs2, uses1: true, uses2: true, writes: true });
  } else if (opc === 0x13) {
    if (f3 === 0) return mk('kopanyah', { rd, rs1, imm: immI, uses1: true, writes: true });
    if (f3 === 1 && f7 === 0) return mk('chetse', { rd, rs1, imm: rs2, uses1: true, writes: true });
  } else if (opc === 0x03 && f3 === 2) {
    return mk('tshela', { rd, rs1, imm: immI, uses1: true, writes: true, isLoad: true });
  } else if (opc === 0x23 && f3 === 2) {
    return mk('boloka', { rs1, rs2, imm: immS, uses1: true, uses2: true, isStore: true });
  } else if (opc === 0x63) {
    const op = { 0: 'lekana', 1: 'haelekane', 4: 'nyane' }[f3];
    if (op) return mk(op, { rs1, rs2, imm: immB, uses1: true, uses2: true, isBranch: true });
  } else if (opc === 0x6f) {
    return mk('tlola', { rd, imm: immJ, writes: true, isJump: true });
  } else if (opc === 0x67 && f3 === 0) {
    return mk('khutla', { rd, rs1, imm: immI, uses1: true, writes: true, isJump: true });
  }
  return null;   // not one of the 13 instructions (spec section 6: stop with a message)
}

export function runISA(words, { maxInstr = 200000 } = {}) {
  const regs = new Int32Array(32); regs[2] = SP_RESET;
  const mem = new Int32Array(MEM_BYTES / 4);
  const trace = [];
  let pc = 0, stop = null;
  const fetch = (a) => (a >= 0 && a < words.length * 4 && a % 4 === 0) ? words[a / 4] : 0;
  while (trace.length < maxInstr) {
    const d = decode(fetch(pc));
    if (!d) { stop = { reason: 'invalid word', pc }; break; }
    const a = regs[d.rs1], b = regs[d.rs2];
    let next = pc + 4, taken = false, val = null;
    switch (d.op) {
      case 'kopanya':  val = (a + b) | 0; break;
      case 'tlosa':    val = (a - b) | 0; break;
      case 'kopanyah': val = (a + d.imm) | 0; break;
      case 'le':       val = a & b; break;
      case 'kapa':     val = a | b; break;
      case 'chetse':   val = a << d.imm; break;
      case 'tshela': case 'boloka': {
        const addr = (a + d.imm) | 0;
        if (addr % 4 !== 0 || addr < 0 || addr >= MEM_BYTES) { stop = { reason: 'bad address ' + addr, pc }; break; }
        if (d.op === 'tshela') val = mem[addr / 4]; else mem[addr / 4] = b;
        break;
      }
      case 'lekana': taken = a === b; break;
      case 'haelekane': taken = a !== b; break;
      case 'nyane': taken = a < b; break;
      case 'tlola': val = pc + 4; taken = true; break;
      case 'khutla': val = pc + 4; taken = true; break;
    }
    if (stop) break;
    if (d.isBranch && taken) next = pc + d.imm;
    if (d.op === 'tlola') next = pc + d.imm;
    if (d.op === 'khutla') next = (a + d.imm) | 0;
    if (taken && (next % 4 !== 0 || next < 0 || next >= words.length * 4)) { stop = { reason: 'bad target ' + next, pc }; break; }
    const halt = d.isBranch && taken && next === pc;           // lekana noto, noto, <self>
    if (d.writes && d.rd !== 0) regs[d.rd] = val;               // p0 writes are discarded
    trace.push({ idx: trace.length, pc, ...d, taken, halt });
    if (halt) { stop = { reason: 'halt', pc }; break; }
    pc = next;
  }
  if (!stop) stop = { reason: 'max instructions', pc };
  return { regs, mem, trace, stop };
}

// Cycle model derived from spec section 7. t[i] = the cycle in which instruction i makes its
// (final) ID cycle. Instruction 0 is fetched in cycle 1, so t[0] = 2; the last instruction
// finishes WB in cycle t[last] + 3.  Register file: written 1st half, read 2nd half of a cycle.
export function timing(trace, { forwarding = true } = {}) {
  const t = [], lastWriter = {}; let stalls = 0, flushed = 0;
  for (let i = 0; i < trace.length; i++) {
    const ins = trace[i], prev = trace[i - 1];
    let base = i === 0 ? 2 : t[i - 1] + 1;
    if (prev && prev.taken && !prev.halt) { base = t[i - 1] + 3; flushed += 2; }   // resolved in EX, 2 flushed
    let need = base;
    for (const [uses, reg] of [[ins.uses1, ins.rs1], [ins.uses2, ins.rs2]]) {
      if (!uses || reg === 0 || lastWriter[reg] === undefined) continue;
      const j = lastWriter[reg], p = trace[j];
      if (!forwarding) need = Math.max(need, t[j] + 3);                 // wait for write-back
      else if (p.isLoad) need = Math.max(need, t[j] + 2);               // load-use: 1 bubble then forward
    }
    stalls += need - base;
    t[i] = need;
    if (ins.writes && ins.rd !== 0) lastWriter[ins.rd] = i;
  }
  const N = trace.length;
  return { N, stalls, flushed, cycles: N ? t[N - 1] + 3 : 0, idCycle: t };
}

// Classify every register dependence in an executed trace (needed to decide whether a program
// is hazard-free for M3, where there is no forwarding yet).
export function hazards(trace) {
  const lastWriter = {}, raw = [], control = [];
  trace.forEach((ins, i) => {
    for (const [uses, reg] of [[ins.uses1, ins.rs1], [ins.uses2, ins.rs2]]) {
      if (!uses || reg === 0 || lastWriter[reg] === undefined) continue;
      const dist = i - lastWriter[reg];
      if (dist <= 2) raw.push({ at: ins.pc, op: ins.op, reg, distance: dist, loadUse: trace[lastWriter[reg]].isLoad && dist === 1 });
    }
    if (ins.taken && !ins.halt) control.push({ at: ins.pc, op: ins.op });
    if (ins.writes && ins.rd !== 0) lastWriter[ins.rd] = i;
  });
  return { raw, control, hazardFree: raw.length === 0 && control.length === 0 };
}
