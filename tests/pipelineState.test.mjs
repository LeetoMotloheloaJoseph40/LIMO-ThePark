import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reset, step } from '../src/core/pipelineState.mjs';

test('initial state', () => {
  const s = createState();
  assert.equal(s.pc, 0); assert.equal(s.cycle, 0);
  for (const r of ['ifid', 'idex', 'exmem', 'memwb']) assert.equal(s[r].valid, false);
});

test('step does not mutate the previous state', () => {
  const s = createState();
  const before = JSON.stringify([s.pc, s.cycle, s.ifid, s.idex]);
  step(s);
  assert.equal(JSON.stringify([s.pc, s.cycle, s.ifid, s.idex]), before);
});

test('an instruction advances exactly one stage per cycle', () => {
  const imem = new Uint32Array(1024); imem[0] = 0x00500513;
  let s = createState({ imem });
  s = step(s); assert.equal(s.ifid.instr, 0x00500513); assert.equal(s.idex.valid, false);
  s = step(s); assert.equal(s.idex.instr, 0x00500513); assert.equal(s.exmem.valid, false);
  s = step(s); assert.equal(s.exmem.instr, 0x00500513); assert.equal(s.memwb.valid, false);
  s = step(s); assert.equal(s.memwb.instr, 0x00500513);
});

test('a fetched all-zero word is valid, not a bubble', () => {
  const s = step(createState());
  assert.equal(s.ifid.instr, 0); assert.equal(s.ifid.valid, true);
});

test('pc advances by 4 and cycle by 1', () => {
  const s = step(step(createState()));
  assert.equal(s.pc, 8); assert.equal(s.cycle, 2);
});

test('reset restores the initial state and keeps the program', () => {
  const imem = new Uint32Array(1024); imem[0] = 1;
  const s = reset(step(step(createState({ imem }))));
  assert.equal(s.pc, 0); assert.equal(s.cycle, 0); assert.equal(s.ifid.valid, false);
  assert.equal(s.imem[0], 1);
});
