import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/assembler.js';
import { createState, reset, step } from '../src/core/pipelineState.mjs';

const examples = [
  { file: 'alu_mix.limo', cycles: 12, count: 8, stalls: 0, flushed: 0,
    regs: { t2: 2, t3: 14, t4: 8, t5: 96, t6: -2 } },
  { file: 'CountFirstN.limo', cycles: 41, count: 25, stalls: 0, flushed: 12,
    regs: { t0: 5, t1: 15, t2: 6 } },
  { file: 'compare_2_int.limo', cycles: 18, count: 11, stalls: 1, flushed: 2,
    regs: { t0: 17, n0: 25, n1: 17, n2: 25 }, mem: { 0: 25, 4: 17, 16: 25 } },
  { file: 'count_even.limo', cycles: 166, count: 111, stalls: 5, flushed: 46,
    regs: { t1: 3, t2: 5, t5: 16, t6: 0, t7: 1 } },
  { file: 'habeli_call.limo', cycles: 14, count: 6, stalls: 0, flushed: 4,
    regs: { t1: 42, hae: 8 }, mem: { 0: 42 } },
];
const registerNumber = { hae: 1, lesupa: 2, n0: 5, n1: 6, n2: 7, t0: 10, t1: 11, t2: 12,
  t3: 13, t4: 14, t5: 15, t6: 16, t7: 17 };

function runProgram(words) {
  let state = createState({ imem: Uint32Array.from(words) });
  for (let i = 0; i < 1000 && !state.halted; i++) state = step(state);
  return state;
}

test('reset initializes the frozen architectural state and preserves imem', () => {
  const imem = new Uint32Array(1024); imem[0] = 0x00500513;
  const dmem = new Uint32Array(1024); dmem[0] = 77;
  const state = createState({ imem, dmem });
  assert.equal(state.regs[0], 0);
  assert.equal(state.regs[2], 0x1000);
  assert.equal(state.dmem[0], 77);
  const resetState = reset(state);
  assert.equal(resetState.imem[0], imem[0]);
  assert.equal(resetState.dmem[0], 0);
  assert.equal(resetState.regs[2], 0x1000);
});

test('one step returns new architectural arrays without mutating prior state', () => {
  const state = createState();
  const next = step(state);
  assert.notEqual(next.regs, state.regs);
  assert.notEqual(next.dmem, state.dmem);
  assert.equal(state.pc, 0);
  assert.equal(state.cycle, 0);
  assert.equal(state.ifid.valid, false);
  assert.equal(next.ifid.valid, true);
  assert.deepEqual(next.trace.cycle, next.cycle);
});

for (const example of examples) {
  test(`executes ${example.file} to the frozen result and cycle count`, () => {
    const source = fs.readFileSync(new URL(`../examples/${example.file}`, import.meta.url), 'utf8');
    const assembled = assemble(source);
    assert.equal(assembled.ok, true, JSON.stringify(assembled.errors));
    const state = runProgram(assembled.words);
    assert.equal(state.halted, true);
    assert.equal(state.error, null);
    assert.equal(state.cycle, example.cycles);
    assert.equal(state.instructionCount, example.count);
    assert.equal(state.stalls, example.stalls);
    assert.equal(state.flushed, example.flushed);
    for (const [name, value] of Object.entries(example.regs)) {
      assert.equal(state.regs[registerNumber[name]], value, name);
    }
    for (const [address, value] of Object.entries(example.mem ?? {})) {
      assert.equal(state.dmem[Number(address) >>> 2], value, `MEM[${address}]`);
    }
    assert.equal(state.regs[0], 0);
  });
}
