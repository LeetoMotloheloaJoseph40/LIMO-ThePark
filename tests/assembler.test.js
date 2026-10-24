import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/assembler.js';

// Assemble one line and return its hex; fails the test if there were errors.
const hex = (src) => {
  const r = assemble(src);
  assert.deepEqual(r.errors, [], 'unexpected errors: ' + JSON.stringify(r.errors));
  return r.lines[0].hex;
};
const firstError = (src) => {
  const r = assemble(src);
  assert.equal(r.ok, false, 'expected an error');
  return r.errors[0];
};
const example = (name) => readFileSync(new URL(`../examples/${name}.limo`, import.meta.url), 'utf8');

describe('one test per instruction (hand-encoded values from the M1 spec)', () => {
  test('kopanya (add)',     () => assert.equal(hex('kopanya p3, p1, p2'), '0x002081B3'));
  test('tlosa (sub)',       () => assert.equal(hex('tlosa p3, p1, p2'), '0x402081B3'));
  test('kopanyah (addi)',   () => assert.equal(hex('kopanyah p3, p1, 10'), '0x00A08193'));
  test('le (and)',          () => assert.equal(hex('le t6, t6, t7'), '0x01187833'));
  test('kapa (or)',         () => assert.equal(hex('kapa p3, p1, p2'), '0x0020E1B3'));
  test('chetse (slli)',     () => assert.equal(hex('chetse p3, p1, 3'), '0x00309193'));
  test('tshela (lw)',       () => assert.equal(hex('tshela p3, 8(p1)'), '0x0080A183'));
  test('tshela t6, 0(t5)',  () => assert.equal(hex('tshela t6, 0(t5)'), '0x0007A803'));
  test('boloka (sw)',       () => assert.equal(hex('boloka p2, 4(p1)'), '0x0020A223'));
  test('lekana (beq)',      () => assert.equal(hex('lekana p1, p2, 8'), '0x00208463'));
  test('haelekane (bne)',   () => assert.equal(hex('haelekane t6, noto, 8'), '0x00081463'));
  test('nyane (blt)',       () => assert.equal(hex('nyane t0, t2, 16'), '0x00C54863'));
  test('tlola (jal)',       () => assert.equal(hex('tlola p1, 8'), '0x008000EF'));
  test('khutla (jalr)',     () => assert.equal(hex('khutla p0, 0(p1)'), '0x00008067'));
});

describe('registers and lexical rules', () => {
  test('number, alias and Sesotho name give the same code', () => {
    const a = hex('kopanya p2, p1, p0');
    assert.equal(hex('kopanya lesupa, hae, noto'), a);
    assert.equal(hex('kopanya sp, ra, zero'), a);
  });
  test('register groups map to the right numbers', () => {
    assert.equal(hex('kopanyah n0, noto, 0'), hex('kopanyah p5, p0, 0'));
    assert.equal(hex('kopanyah b0, noto, 0'), hex('kopanyah p8, p0, 0'));
    assert.equal(hex('kopanyah t7, noto, 0'), hex('kopanyah p17, p0, 0'));
    assert.equal(hex('kopanyah b11, noto, 0'), hex('kopanyah p27, p0, 0'));
    assert.equal(hex('kopanyah n6, noto, 0'), hex('kopanyah p31, p0, 0'));
  });
  test('case-insensitive', () => assert.equal(hex('KOPANYA P3, P1, P2'), '0x002081B3'));
  test('hex immediates', () => assert.equal(hex('kopanyah p3, p1, 0x0A'), '0x00A08193'));
  test('negative immediate', () => assert.equal(hex('kopanyah p1, p0, -1'), '0xFFF00093'));
  test('both comment styles and blank lines', () => {
    const r = assemble('# a comment\n\nkopanya p3, p1, p2 ; trailing\nkopanya p3, p1, p2 # trailing\n');
    assert.equal(r.words.length, 2);
  });
  test('(p1) means offset 0', () => assert.equal(hex('tshela p3, (p1)'), hex('tshela p3, 0(p1)')));
  test('apostrophe is a letter, curly apostrophe normalised, not a comment', () => {
    const a = assemble("ts'ela: kopanya p3, p1, p2\nlekana p0, p0, ts'ela");
    const b = assemble("ts\u2019ela: kopanya p3, p1, p2\nlekana p0, p0, ts'ela");
    assert.equal(a.ok, true);
    assert.deepEqual(a.words, b.words);
    assert.equal(a.labels["ts'ela"], 0);
  });
});

describe('labels', () => {
  test('backward label (tlola noto, loop = -12)', () => {
    const r = assemble('loop: kopanya p1,p1,p1\nkopanya p1,p1,p1\nkopanya p1,p1,p1\ntlola noto, loop');
    assert.equal(r.lines[3].hex, '0xFF5FF06F');
  });
  test('forward label (nyane ... done = +16)', () => {
    const r = assemble('kopanya p0,p0,p0\nkopanya p0,p0,p0\nkopanya p0,p0,p0\nnyane t0, t2, done\nkopanya p0,p0,p0\nkopanya p0,p0,p0\nkopanya p0,p0,p0\ndone: kopanya p0,p0,p0');
    assert.equal(r.lines[3].hex, '0x00C54863');
  });
  test('label alone on a line points at the next instruction', () => {
    const r = assemble('start:\nkopanya p3, p1, p2');
    assert.equal(r.labels.start, 0);
  });
  test('label on its own line and on the same line behave the same', () => {
    assert.deepEqual(assemble('x:\nlekana p0,p0,x').words, assemble('x: lekana p0,p0,x').words);
  });
  test('halt (branch to itself) encodes offset 0', () => assert.equal(hex('done: lekana noto, noto, done'), '0x00000063'));
});

describe('immediate boundaries', () => {
  test('I-type: -2048 and 2047 accepted', () => { hex('kopanyah p1, p0, -2048'); hex('kopanyah p1, p0, 2047'); });
  test('I-type: -2049 and 2048 rejected', () => {
    assert.match(firstError('kopanyah p1, p0, -2049').message, /does not fit/);
    assert.match(firstError('kopanyah p1, p0, 2048').message, /does not fit/);
  });
  test('S-type: -2048 and 2047 accepted, 2048 rejected', () => {
    hex('boloka p1, -2048(p0)'); hex('boloka p1, 2047(p0)');
    assert.match(firstError('boloka p1, 2048(p0)').message, /does not fit/);
  });
  test('shift amount 0 and 31 accepted; -1 and 32 rejected', () => {
    hex('chetse p1, p1, 0'); hex('chetse p1, p1, 31');
    assert.match(firstError('chetse p1, p1, 32').message, /shift amount/);
    assert.match(firstError('chetse p1, p1, -1').message, /shift amount/);
  });
  test('branch reach: -4096 and +4094 accepted; -4098 and +4096 rejected', () => {
    hex('lekana p0, p0, -4096'); hex('lekana p0, p0, 4094');
    assert.match(firstError('lekana p0, p0, 4096').message, /reach/);
    assert.match(firstError('lekana p0, p0, -4098').message, /reach/);
  });
  test('jump reach: -1048576 and +1048574 accepted; +1048576 rejected', () => {
    hex('tlola p0, -1048576'); hex('tlola p0, 1048574');
    assert.match(firstError('tlola p0, 1048576').message, /reach/);
  });
});

describe('error messages (plain language, line numbers, suggestions)', () => {
  test('unknown mnemonic with suggestion', () => {
    const e = firstError('kopanya p1, p1, p1\nekesta p1, p1, p1\nkopanya p1, p1, p1');
    assert.equal(e.line, 2);
    assert.match(e.message, /^Line 2: "ekesta" is not a LIMO instruction/);
    const e2 = firstError('kopanyaa p1, p1, p1');
    assert.match(e2.suggestion, /kopanya/);
  });
  test('bad register', () => {
    assert.match(firstError('kopanya p32, p1, p2').message, /"p32" is not a LIMO register/);
    assert.match(firstError('kopanya hello, p1, p2').message, /not a LIMO register/);
  });
  test('immediate that is not a number', () => assert.match(firstError('kopanyah p1, p0, abc').message, /not a number/));
  test('wrong number of operands', () => {
    assert.match(firstError('kopanya p1, p2').message, /needs 3 operands but you wrote 2/);
    assert.match(firstError('tlola p1').message, /needs 2 operands/);
  });
  test('empty operand (double comma)', () => assert.match(firstError('kopanya p1,, p2').message, /empty operand/));
  test('undefined label, with did-you-mean', () => {
    const e = firstError('loop: lekana p0, p0, lopp');
    assert.match(e.message, /label "lopp" is not defined/);
    assert.match(e.suggestion, /loop/);
  });
  test('duplicate label', () => assert.match(firstError('a: kopanya p1,p1,p1\na: kopanya p1,p1,p1').message, /defined twice/));
  test('invalid label name', () => assert.match(firstError('1abc: kopanya p1,p1,p1').message, /not a valid label name/));
  test('label cannot be an instruction or register name', () => assert.match(firstError('noto: kopanya p1,p1,p1').message, /cannot be a label/));
  test('misaligned (odd) branch offset', () => assert.match(firstError('lekana p0, p0, 3').message, /odd/));
  test('bad memory operand', () => assert.match(firstError('tshela p1, 4').message, /not a memory operand/));
  test('several errors are all reported, in line order', () => {
    const r = assemble('foo p1\nkopanya p1, p2\nkopanyah p1, p0, 99999');
    assert.deepEqual(r.errors.map((e) => e.line), [1, 2, 3]);
  });
  test('no machine code is produced when there are errors', () => assert.deepEqual(assemble('foo p1').words, []));
});

describe('output for the interface', () => {
  test('line record has address, binary, hex and colour-codable fields', () => {
    const r = assemble('kopanya p3, p1, p2').lines[0];
    assert.equal(r.address, 0);
    assert.equal(r.binary, '00000000001000001000000110110011');
    assert.deepEqual(r.fields.map((x) => x.name), ['funct7', 'rs2', 'rs1', 'funct3', 'rd', 'opcode']);
    assert.equal(r.fields.reduce((n, x) => n + x.bits, 0), 32);
    assert.equal(r.fields[5].binary, '0110011');
  });
  test('every format has fields that add up to 32 bits', () => {
    const src = 'kopanya p1,p1,p1\nkopanyah p1,p1,1\nchetse p1,p1,1\ntshela p1,0(p1)\nboloka p1,0(p1)\nlekana p0,p0,0\ntlola p0,0\nkhutla p0,0(p1)';
    for (const l of assemble(src).lines) assert.equal(l.fields.reduce((n, x) => n + x.bits, 0), 32, l.mnemonic);
  });
  test('addresses go up by 4', () => {
    const r = assemble('kopanya p1,p1,p1\nkopanya p1,p1,p1\nkopanya p1,p1,p1');
    assert.deepEqual(r.lines.map((l) => l.address), [0, 4, 8]);
  });
});

describe('the three M1 sample programs', () => {
  test('CountFirstN matches the 8 words printed in the M1 spec', () => {
    const r = assemble(example('count_first_n'));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.words, [0x00500513, 0x00000593, 0x00100613, 0x00C54863, 0x00C585B3, 0x00160613, 0xFF5FF06F, 0x00000063]);
  });
  test('compare_2_int assembles (12 instructions) with labels at the right addresses', () => {
    const r = assemble(example('compare_2_int'));
    assert.deepEqual(r.errors, []);
    assert.equal(r.words.length, 12);
    assert.equal(r.labels.nka_b, 36);
    assert.equal(r.labels.qeta, 40);
  });
  test('compare_2_int: the M1 spec typo "qetiled" is caught with a helpful suggestion', () => {
    const e = firstError(example('compare_2_int').replace('noto, qetile  #', 'noto, qetiled  #'));
    assert.match(e.message, /"qetiled" is not defined/);
    assert.match(e.suggestion, /qetile/);
  });
  test('count_even assembles (30 instructions = 120 bytes)', () => {
    const r = assemble(example('count_even'));
    assert.deepEqual(r.errors, []);
    assert.equal(r.words.length, 30);
    assert.equal(r.words.length * 4, 120);
  });
  test('count_even spot checks from the M1 spec', () => {
    const r = assemble(example('count_even'));
    assert.equal(r.lines[25].hex, '0x01187833'); // le t6, t6, t7
    assert.equal(r.lines[24].hex, '0x0007A803'); // tshela t6, 0(t5)
    assert.equal(r.lines[26].hex, '0x00081463'); // haelekane t6, noto, skip (+8)
  });
});

describe('edge cases found while simplifying', () => {
  test('a mnemonic named like a built-in JavaScript word is just an unknown instruction', () => {
    assert.match(firstError('constructor p1, p1, p1').message, /not a LIMO instruction/);
  });
  test('a label named like a built-in JavaScript word works', () => {
    const r = assemble('constructor: lekana p0, p0, constructor');
    assert.deepEqual(r.errors, []);
    assert.equal(r.labels.constructor, 0);
  });
  test('Windows line endings (CRLF) are accepted', () => {
    assert.deepEqual(assemble('kopanya p3, p1, p2\r\nkopanya p3, p1, p2\r\n').words.length, 2);
  });
});
