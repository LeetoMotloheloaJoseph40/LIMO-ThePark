import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/assembler.js';
import { createState, reset, step } from '../src/core/pipelineState.mjs';

const NOP = 0x00000013;

function stateFor(source, initialRegisters = {}) {
  const assembly = assemble(source);
  assert.equal(assembly.ok, true, JSON.stringify(assembly.errors));
  const imem = new Uint32Array(1024);
  imem.fill(NOP);
  imem.set(assembly.words);
  const state = createState({ imem });
  for (const [register, value] of Object.entries(initialRegisters)) {
    state.regs[Number(register)] = value;
  }
  return state;
}

function runToHalt(state, maxCycles = 100) {
  let cycles = 0;
  while (!state.halted && cycles < maxCycles) {
    state = step(state);
    cycles += 1;
  }
  assert.equal(state.halted, true, `program did not stop within ${maxCycles} cycles`);
  return state;
}

test('initial state follows the frozen ISA reset values', () => {
  const state = createState();
  assert.equal(state.pc, 0);
  assert.equal(state.cycle, 0);
  assert.equal(state.halted, false);
  assert.equal(state.regs[0], 0);
  assert.equal(state.regs[2], 0x1000);
  assert.equal(state.dmem.every((word) => word === 0), true);
  for (const name of ['ifid', 'idex', 'exmem', 'memwb']) assert.equal(state[name].valid, false);
});

test('step advances one instruction through IF, ID, EX, MEM, WB', () => {
  const imem = new Uint32Array(1024);
  imem.fill(NOP);
  let state = createState({ imem });

  state = step(state);
  assert.equal(state.ifid.valid, true);
  assert.equal(state.ifid.instr, NOP);
  assert.equal(state.idex.valid, false);

  state = step(state);
  assert.equal(state.idex.valid, true);
  assert.equal(state.idex.instr, NOP);
  assert.equal(state.exmem.valid, false);

  state = step(state);
  assert.equal(state.exmem.valid, true);
  assert.equal(state.exmem.instr, NOP);
  assert.equal(state.memwb.valid, false);

  state = step(state);
  assert.equal(state.memwb.valid, true);
  assert.equal(state.memwb.instr, NOP);
});

test('step returns a new state and does not mutate prior registers or memory', () => {
  const state = stateFor('kopanyah p3, noto, 5');
  const before = {
    pc: state.pc,
    cycle: state.cycle,
    regs: state.regs.slice(),
    dmem: state.dmem.slice(),
    ifid: { ...state.ifid },
  };
  const next = step(state);

  assert.notEqual(next, state);
  assert.equal(state.pc, before.pc);
  assert.equal(state.cycle, before.cycle);
  assert.deepEqual(state.regs, before.regs);
  assert.deepEqual(state.dmem, before.dmem);
  assert.deepEqual(state.ifid, before.ifid);
});

test('PC and cycle advance once per normal step', () => {
  const imem = new Uint32Array(1024);
  imem.fill(NOP);
  const state = step(step(createState({ imem })));
  assert.equal(state.pc, 8);
  assert.equal(state.cycle, 2);
});

test('ALU writeback updates the destination and p0 remains zero', () => {
  const state = runToHalt(stateFor(`
    kopanyah p3, noto, 5
    kopanyah noto, noto, 1
    lekana noto, noto, done
  done: lekana noto, noto, done
  `));

  assert.equal(state.regs[3], 5);
  assert.equal(state.regs[0], 0);
  assert.equal(state.error, null);
});

test('R-type, shift, and immediate ALU operations use their ISA semantics', () => {
  let state = stateFor(`
    kopanya p3, p1, p2
    tlosa p4, p1, p2
    le p5, p1, p2
    kapa p6, p1, p2
    chetse p7, p1, 2
    kopanyah p8, p1, -2
  `, { 1: 7, 2: 3 });

  for (let i = 0; i < 10; i += 1) state = step(state);
  assert.deepEqual(
    [state.regs[3], state.regs[4], state.regs[5], state.regs[6], state.regs[7], state.regs[8]],
    [10, 4, 3, 7, 28, 5],
  );
  assert.equal(state.error, null);
});

test('store and load update data memory and the load destination', () => {
  let state = stateFor(`
    boloka p6, 0(p5)
    tshela p7, 0(p5)
  `, { 5: 64, 6: 1234 });

  for (let i = 0; i < 6; i += 1) state = step(state);
  assert.equal(state.dmem[16], 1234);
  assert.equal(state.regs[7], 1234);
  assert.equal(state.error, null);
});

test('taken branch redirects and flushes the two younger instructions', () => {
  let state = stateFor(`
    nyane p1, p2, target
    kopanyah p3, noto, 99
  target: kopanyah p4, noto, 7
    lekana noto, noto, done
  done: lekana noto, noto, done
  `, { 1: 1, 2: 2 });

  let branchTrace;
  for (let i = 0; i < 30 && !state.halted; i += 1) {
    state = step(state);
    if (state.trace?.redirect === 8) branchTrace = state.trace;
  }

  assert.equal(state.halted, true);
  assert.equal(state.error, null);
  assert.equal(state.regs[3], 0);
  assert.equal(state.regs[4], 7);
  assert.equal(branchTrace.stages.ID.flushed, true);
  assert.equal(branchTrace.stages.IF.flushed, true);
});

test('not-taken branches fall through and nyane compares signed values', () => {
  const state = runToHalt(stateFor(`
    nyane p2, p1, skipped
    kopanyah p3, noto, 9
  skipped: haelekane p1, p1, done
    kopanyah p4, noto, 10
  done: lekana noto, noto, done
  `, { 1: -1, 2: 1 }));

  assert.equal(state.regs[3], 9);
  assert.equal(state.regs[4], 10);
  assert.equal(state.error, null);
});

test('tlola writes PC+4 and skips the two wrong-path instructions', () => {
  const state = runToHalt(stateFor(`
    tlola p3, target
    kopanyah p5, noto, 99
    kopanyah p5, noto, 98
  target: kopanyah p4, noto, 7
    lekana noto, noto, done
  done: lekana noto, noto, done
  `));

  assert.equal(state.regs[3], 4);
  assert.equal(state.regs[4], 7);
  assert.equal(state.regs[5], 0);
  assert.equal(state.error, null);
});

test('khutla uses the old base value when rd equals rs1 and writes PC+4', () => {
  const state = runToHalt(stateFor(`
    khutla hae, 0(hae)
    kopanyah p3, noto, 99
  target: lekana noto, noto, target
  `, { 1: 8 }));

  assert.equal(state.regs[1], 4);
  assert.equal(state.regs[3], 0);
  assert.equal(state.error, null);
});

test('self-branch halt stops after reaching WB and subsequent steps are unchanged', () => {
  let state = stateFor('lekana noto, noto, done\ndone: lekana noto, noto, done');
  state = runToHalt(state);
  const stopped = step(state);

  assert.equal(stopped, state);
  assert.equal(state.error, null);
  assert.equal(state.trace.narration.includes('WB: halt branch completed; execution stopped.'), true);
});

test('invalid fetched word and misaligned memory access stop with a PC and message', () => {
  let invalid = step(createState());
  invalid = step(invalid);
  assert.equal(invalid.halted, true);
  assert.equal(invalid.error.pc, 0);
  assert.match(invalid.error.message, /Invalid LIMO instruction/);

  let memoryFault = stateFor('tshela p3, 2(p1)');
  for (let i = 0; i < 5 && !memoryFault.halted; i += 1) memoryFault = step(memoryFault);
  assert.equal(memoryFault.halted, true);
  assert.equal(memoryFault.error.pc, 0);
  assert.match(memoryFault.error.message, /not word-aligned/);
  assert.equal(memoryFault.trace.stages.MEM.error !== undefined, true);
});

test('out-of-range memory access and control-transfer target stop with their faulting PC', () => {
  let memoryFault = stateFor('tshela p3, 0(p1)', { 1: 0x1000 });
  for (let i = 0; i < 5 && !memoryFault.halted; i += 1) memoryFault = step(memoryFault);
  assert.equal(memoryFault.halted, true);
  assert.equal(memoryFault.error.pc, 0);
  assert.match(memoryFault.error.message, /outside data memory/);

  let targetFault = stateFor('khutla noto, 0(p1)', { 1: 0x1000 });
  for (let i = 0; i < 5 && !targetFault.halted; i += 1) targetFault = step(targetFault);
  assert.equal(targetFault.halted, true);
  assert.equal(targetFault.error.pc, 0);
  assert.match(targetFault.error.message, /Control-transfer target/);
  assert.equal(targetFault.trace.stages.EX.error !== undefined, true);
});

test('reset restores architectural state, clears data memory, and keeps the program', () => {
  const imem = new Uint32Array(1024);
  imem[0] = NOP;
  const state = createState({ imem });
  state.regs[3] = 42;
  state.dmem[4] = 99;

  const resetState = reset(state);
  assert.equal(resetState.pc, 0);
  assert.equal(resetState.cycle, 0);
  assert.equal(resetState.regs[0], 0);
  assert.equal(resetState.regs[2], 0x1000);
  assert.equal(resetState.regs[3], 0);
  assert.equal(resetState.dmem[4], 0);
  assert.equal(resetState.ifid.valid, false);
  assert.equal(resetState.imem[0], NOP);
});

test('trace reports stage activity and WB values', () => {
  let state = stateFor('kopanyah p3, noto, 5');
  for (let i = 0; i < 5; i += 1) state = step(state);

  assert.equal(state.regs[3], 5);
  assert.equal(state.trace.stages.WB.valid, true);
  assert.equal(state.trace.stages.WB.rd, 3);
  assert.equal(state.trace.writeBackValue, 5);
  assert.equal(Array.isArray(state.trace.narration), true);
});
