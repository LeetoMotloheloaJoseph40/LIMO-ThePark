// Checks the independent reference model against the frozen spec's section 9 table.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../../src/assembler.js';
import { runISA, timing } from './limo_ref.mjs';

const load = (f, edit = (s) => s) => runISA(assemble(edit(fs.readFileSync(new URL('../../examples/' + f, import.meta.url), 'utf8'))).words);
const cases = [ // file, N, stalls, flushed, cycles  (spec section 9)
  ['CountFirstN.limo', 25, 0, 12, 41], ['compare_2_int.limo', 11, 1, 2, 18],
  ['count_even.limo', 111, 5, 46, 166], ['habeli_call.limo', 6, 0, 4, 14], ['alu_mix.limo', 8, 0, 0, 12],
];
for (const [f, N, stalls, flushed, cycles] of cases) {
  test(`ref model matches spec: ${f}`, () => {
    const r = load(f); assert.equal(r.stop.reason, 'halt');
    const T = timing(r.trace);
    assert.deepEqual([T.N, T.stalls, T.flushed, T.cycles], [N, stalls, flushed, cycles]);
  });
}
test('ref model matches spec: compare_2_int variant B = 40', () => {
  const r = load('compare_2_int.limo', (s) => s.replace(/^kopanyah t0, noto, 17/m, 'kopanyah t0, noto, 40'));
  const T = timing(r.trace);
  assert.deepEqual([T.N, T.stalls, T.flushed, T.cycles], [10, 1, 2, 17]);
  assert.equal(r.mem[1], 40); assert.equal(r.mem[4], 40);
});
test('ref model final registers (CountFirstN, habeli_call)', () => {
  let r = load('CountFirstN.limo'); assert.deepEqual([r.regs[10], r.regs[11], r.regs[12]], [5, 15, 6]);
  r = load('habeli_call.limo'); assert.deepEqual([r.regs[10], r.regs[11], r.regs[1], r.mem[0]], [21, 42, 8, 42]);
});
