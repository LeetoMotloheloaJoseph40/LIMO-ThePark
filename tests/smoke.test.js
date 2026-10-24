import { test } from 'node:test';
import assert from 'node:assert/strict';

// Placeholder so `npm test` and CI run from day one.
// Replace with real assembler tests as soon as src/js/assembler.js exists.
test('test runner works', () => {
  assert.equal(1 + 1, 2);
});

test.todo('assembler: encodes each instruction format correctly (hand-encoded examples from the ISA spec)');
test.todo('assembler: reports unknown mnemonic with a line number');
test.todo('assembler: resolves forward and backward labels');
test.todo('assembler: handles decimal and hex immediates and range errors');
