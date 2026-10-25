import { test } from 'node:test';
import assert from 'node:assert/strict';

// Sanity check that `npm test` and CI run. Assembler tests live in tests/assembler.test.js.
test('test runner works', () => {
  assert.equal(1 + 1, 2);
});
