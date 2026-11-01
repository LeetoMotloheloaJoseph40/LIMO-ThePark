import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { assemble } from '../src/assembler.js';
import { decode, disassemble, registerName } from '../src/decode.js';
import { buildInstructionMemory } from '../src/program.js';
import { INSTRUCTIONS, REGISTER_LOOKUP } from '../src/isa.js';
import { runReference } from './helpers/refmodel.js';

// Assemble a program that must be correct; return its words.
const words = (src) => {
  const r = assemble(src);
  assert.deepEqual(r.errors, [], 'unexpected errors: ' + JSON.stringify(r.errors));
  return r.words;
};
const example = (name) => readFileSync(new URL(`../examples/${name}.limo`, import.meta.url), 'utf8');
const exampleNames = readdirSync(new URL('../examples/', import.meta.url))
  .filter((f) => f.endsWith('.limo')).map((f) => f.replace('.limo', '')).sort();

describe('decode: the 13 worked encodings of spec v1.1 section 8', () => {
  // [word, mnemonic, rd, rs1, rs2, imm]
  const cases = [
    [0x002081B3, 'kopanya',   3, 1, 2, 0],
    [0x402081B3, 'tlosa',     3, 1, 2, 0],
    [0x00A08193, 'kopanyah',  3, 1, 0, 10],
    [0x0020F1B3, 'le',        3, 1, 2, 0],
    [0x0020E1B3, 'kapa',      3, 1, 2, 0],
    [0x00309193, 'chetse',    3, 1, 0, 3],
    [0x0080A183, 'tshela',    3, 1, 0, 8],
    [0x0020A223, 'boloka',    0, 1, 2, 4],     // boloka has no rd: rs2 is the data, rs1 the base
    [0x00208463, 'lekana',    0, 1, 2, 8],
    [0x00209463, 'haelekane', 0, 1, 2, 8],
    [0x0020C463, 'nyane',     0, 1, 2, 8],
    [0x008000EF, 'tlola',     1, 0, 0, 8],
    [0x00008067, 'khutla',    0, 1, 0, 0],
  ];
  for (const [word, mnemonic, rd, rs1, rs2, imm] of cases) {
    test(`${mnemonic} 0x${word.toString(16).toUpperCase().padStart(8, '0')}`, () => {
      const d = decode(word);
      assert.equal(d.valid, true);
      assert.equal(d.mnemonic, mnemonic);
      assert.deepEqual([d.rd, d.rs1, d.rs2, d.imm], [rd, rs1, rs2, imm]);
    });
  }

  test('a backward jump has a negative offset: tlola noto, loop = 0xFF5FF06F (-12)', () => {
    const d = decode(0xFF5FF06F);
    assert.equal(d.mnemonic, 'tlola');
    assert.equal(d.rd, 0);
    assert.equal(d.imm, -12);
  });

  test('0x00C54863 is nyane t0, t2, +16 (the CountFirstN branch)', () => {
    const d = decode(0x00C54863);
    assert.equal(d.mnemonic, 'nyane');
    assert.deepEqual([d.rs1, d.rs2, d.imm], [REGISTER_LOOKUP.t0, REGISTER_LOOKUP.t2, 16]);
  });

  test('a word with bit 31 set is treated as unsigned (no negative word)', () => {
    assert.equal(decode(0xFF5FF06F).word, 0xFF5FF06F);
    assert.equal(decode(0xFF5FF06F | 0).word, 0xFF5FF06F);   // a signed JavaScript number gives the same answer
  });
});

describe('decode: words that are not instructions', () => {
  const bad = [
    [0x00000000, 'zero (what is fetched past the end of a program)'],
    [0xFFFFFFFF, 'all ones'],
    [0x00005013, 'srli: an RV32I instruction LIMO does not have'],
    [0x40309193, 'chetse with funct7 = 0100000 (that would be srai)'],
    [0x022081B3, 'R-type with funct7 = 0000001 (mul)'],
    [0x0020C1B3, 'R-type with funct3 = 100 (xor)'],
    [0x00008183, 'lb: load with funct3 = 000'],
    [0x0020D463, 'bge: branch with funct3 = 101'],
    [0x00209223, 'sh: store with funct3 = 001'],
    [0x000011B7, 'lui: opcode 0110111'],
    [0x00009067, 'jalr with funct3 = 001'],
  ];
  for (const [word, what] of bad) {
    test(what, () => {
      const d = decode(word);
      assert.equal(d.valid, false);
      assert.notEqual(d.reason, '');
      assert.match(disassemble(word), /^\(not an instruction\) 0x[0-9A-F]{8}$/);
    });
  }
  test('the reason for 0x00000000 tells the student to add a halt', () => {
    assert.match(decode(0).reason, /end of a program/);
  });
});

describe('decode: which registers an instruction really uses (spec section 7, load-use)', () => {
  // [source, readsRs1, readsRs2, writesRd, class]
  const cases = [
    ['kopanya p3, p1, p2',   true,  true,  true,  'alu'],
    ['kopanyah p3, p1, 10',  true,  false, true,  'alu'],
    ['chetse p3, p1, 3',     true,  false, true,  'alu'],
    ['tshela p3, 8(p1)',     true,  false, true,  'load'],
    ['boloka p2, 4(p1)',     true,  true,  false, 'store'],
    ['lekana p1, p2, 8',     true,  true,  false, 'branch'],
    ['tlola p1, 8',          false, false, true,  'jump'],
    ['khutla p0, 0(p1)',     true,  false, true,  'jump'],
  ];
  for (const [src, r1, r2, wr, cls] of cases) {
    test(src, () => {
      const d = decode(words(src)[0]);
      assert.deepEqual([d.readsRs1, d.readsRs2, d.writesRd, d.class], [r1, r2, wr, cls]);
    });
  }

  test('register fields an instruction does not use are reported as 0 (no false stalls)', () => {
    // kopanyah t1, noto, 10 : the immediate 10 sits in the bits where rs2 would be.
    // A decoder that read those bits as "rs2" would think the instruction uses register 10 (t0).
    const d = decode(words('kopanyah t1, noto, 10')[0]);
    assert.equal(d.rs2, 0);
    assert.equal(d.readsRs2, false);
  });
});

describe('halt detection', () => {
  test('lekana noto, noto, <itself> is 0x00000063 and isHalt', () => {
    const w = words('stop: lekana noto, noto, stop')[0];
    assert.equal(w, 0x00000063);
    assert.equal(decode(w).isHalt, true);
  });
  test('other branches are not halts', () => {
    assert.equal(decode(0x00208463).isHalt, false);
  });
});

describe('round trip: assemble -> decode -> disassemble -> assemble', () => {
  // Boundary values for every instruction: smallest and largest immediates, and registers 0, 1 and 31.
  const sources = [];
  for (const m of ['kopanya', 'tlosa', 'le', 'kapa']) {
    sources.push(`${m} p0, p0, p0`, `${m} p31, p1, p31`, `${m} p3, p4, p5`);
  }
  for (const imm of [-2048, -1, 0, 1, 2047]) {
    sources.push(`kopanyah p31, p1, ${imm}`, `tshela p31, ${imm}(p1)`, `boloka p31, ${imm}(p1)`, `khutla p0, ${imm}(p31)`);
  }
  for (const shamt of [0, 1, 31]) sources.push(`chetse p31, p1, ${shamt}`);
  for (const offset of [-4096, -4, 0, 4, 4092]) {
    for (const m of ['lekana', 'haelekane', 'nyane']) sources.push(`${m} p1, p31, ${offset}`);
  }
  for (const offset of [-1048576, -4, 0, 4, 1048572]) sources.push(`tlola p31, ${offset}`, `tlola noto, ${offset}`);

  for (const src of sources) {
    test(src, () => {
      const original = words(src)[0];
      const text = disassemble(original, 'number');
      assert.deepEqual(words(text), [original], `"${text}" did not assemble back to the same word`);
      const named = disassemble(original);            // names such as noto, hae, n0, t0
      assert.deepEqual(words(named), [original], `"${named}" did not assemble back to the same word`);
    });
  }

  test('every instruction in the table is covered above', () => {
    const covered = new Set(sources.map((s) => s.split(' ')[0]));
    for (const m of Object.keys(INSTRUCTIONS)) assert.ok(covered.has(m), `${m} is not in the round-trip list`);
  });
});

describe('round trip on the example programs', () => {
  for (const name of exampleNames) {
    test(name, () => {
      const r = assemble(example(name));
      assert.equal(r.ok, true);
      for (const line of r.lines) {
        const d = decode(line.word);
        assert.equal(d.mnemonic, line.mnemonic, `line ${line.line}`);
        assert.deepEqual(words(disassemble(line.word)), [line.word], `line ${line.line}: ${disassemble(line.word)}`);
      }
    });
  }
});

describe('property: any 32-bit word (5000 pseudo-random words)', () => {
  // A small deterministic random generator, so a failure can be repeated.
  let seed = 12345;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };

  test('decode never throws; a valid word disassembles to text the assembler turns back into the same word', () => {
    let valid = 0;
    for (let i = 0; i < 5000; i++) {
      // Random words are almost never valid, so half of them get a real opcode/funct3 pattern.
      let w = next();
      if (i % 2 === 0) {
        const mnemonics = Object.keys(INSTRUCTIONS);
        const ins = INSTRUCTIONS[mnemonics[next() % mnemonics.length]];
        w = (w & ~0x7F) >>> 0;  w = (w | ins.opcode) >>> 0;
        if (ins.funct3 !== undefined) w = (((w & ~(7 << 12)) | (ins.funct3 << 12)) >>> 0);
        if (ins.funct7 !== undefined) w = ((((w << 7) >>> 7) | (ins.funct7 << 25)) >>> 0);
      }
      const d = decode(w);
      if (!d.valid) continue;
      valid++;
      const text = disassemble(w);
      const back = assemble(text);
      if ((d.class === 'branch' || d.mnemonic === 'tlola') && d.imm % 4 !== 0) {
        // The assembler (spec section 3) rejects offsets that are not a multiple of 4; the simulator stops at run time.
        assert.equal(back.ok, false, `${text}`);
      } else {
        assert.deepEqual(back.words, [w], `${text} from 0x${w.toString(16)}`);
      }
    }
    assert.ok(valid > 1000, 'the generator should produce many valid words, got ' + valid);
  });
});

describe('registerName', () => {
  test('special and named registers', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 10, 18, 28, 31].map((n) => registerName(n)),
      ['noto', 'hae', 'lesupa', 'n7', 'n8', 'n0', 't0', 'b2', 'n3', 'n6']);
  });
  test('number style', () => {
    assert.deepEqual([0, 1, 5, 31].map((n) => registerName(n, 'number')), ['p0', 'p1', 'p5', 'p31']);
  });
});

describe('register names of spec v1.1 section 2', () => {
  // The whole table of the spec, one entry per alias. n7 and n8 were missing from isa.js before M3.
  const spec = {
    noto: 0, zero: 0, hae: 1, ra: 1, lesupa: 2, sp: 2, n7: 3, n8: 4,
    n0: 5, n1: 6, n2: 7, b0: 8, b1: 9,
    t0: 10, t1: 11, t2: 12, t3: 13, t4: 14, t5: 15, t6: 16, t7: 17,
    b2: 18, b3: 19, b4: 20, b5: 21, b6: 22, b7: 23, b8: 24, b9: 25, b10: 26, b11: 27,
    n3: 28, n4: 29, n5: 30, n6: 31,
  };
  for (const name of Object.keys(spec)) {
    test(`${name} is p${spec[name]}`, () => {
      assert.deepEqual(words(`kopanya ${name}, noto, noto`), words(`kopanya p${spec[name]}, p0, p0`));
    });
  }
});

describe('buildInstructionMemory (the assembler -> core glue)', () => {
  test('puts the program at address 0 and leaves the rest 0', () => {
    const imem = buildInstructionMemory(assemble(example('CountFirstN')));
    assert.equal(imem.length, 1024);
    assert.equal(imem[0], assemble(example('CountFirstN')).words[0]);
    assert.equal(imem[1023], 0);
  });
  test('refuses a program with errors, with a plain message', () => {
    assert.throws(() => buildInstructionMemory(assemble('kopanya p1, p2')), /Fix the assembler errors/);
  });
  test('refuses a program longer than instruction memory', () => {
    assert.throws(() => buildInstructionMemory({ ok: true, words: new Array(1025).fill(0x63) }), /1025 instructions/);
  });
  test('accepts exactly 1024 instructions', () => {
    assert.equal(buildInstructionMemory({ ok: true, words: new Array(1024).fill(0x63) }).length, 1024);
  });
  test('refuses nothing at all', () => {
    assert.throws(() => buildInstructionMemory(undefined), /Fix the assembler errors/);
  });
});

describe('reference model: the example programs end in the state their headers promise', () => {
  const run = (name, text) => runReference(assemble(text || example(name)).words);
  const reg = (result, name) => result.regs[REGISTER_LOOKUP[name]];

  test('CountFirstN: t0 = 5, t1 = 15, t2 = 6; 25 instructions, 12 flushed, 41 cycles', () => {
    const r = run('CountFirstN');
    assert.equal(r.halted, true);
    assert.deepEqual([reg(r, 't0'), reg(r, 't1'), reg(r, 't2')], [5, 15, 6]);
    assert.deepEqual([r.instructions, r.stalls, r.flushed, r.cycles], [25, 0, 12, 41]);
  });

  test('compare_2_int (A = 25, B = 17): MEM[16] = 25; 11 instructions, 1 stall, 2 flushed, 18 cycles', () => {
    const r = run('compare_2_int');
    assert.equal(r.halted, true);
    assert.deepEqual([r.dmem[0], r.dmem[1], r.dmem[4]], [25, 17, 25]);
    assert.deepEqual([reg(r, 't0'), reg(r, 'n0'), reg(r, 'n1'), reg(r, 'n2')], [17, 25, 17, 25]);
    assert.deepEqual([r.instructions, r.stalls, r.flushed, r.cycles], [11, 1, 2, 18]);
  });

  test('compare_2_int variant (B = 40): the other branch is taken; 10 instructions, 17 cycles', () => {
    // The header comment quotes this line too, so match only a line that STARTS with the instruction.
    const variant = example('compare_2_int').replace(/^kopanyah t0, noto, 17/m, 'kopanyah t0, noto, 40');
    assert.notEqual(variant, example('compare_2_int'), 'the replacement must change the program');
    const r = run('compare_2_int', variant);
    assert.deepEqual([r.dmem[1], r.dmem[4]], [40, 40]);
    assert.deepEqual([reg(r, 't0'), reg(r, 'n0'), reg(r, 'n1'), reg(r, 'n2')], [40, 25, 40, 40]);
    assert.deepEqual([r.instructions, r.stalls, r.flushed, r.cycles], [10, 1, 2, 17]);
  });

  test('count_even: 3 even numbers; 111 instructions, 5 stalls, 46 flushed, 166 cycles', () => {
    const r = run('count_even');
    assert.equal(r.halted, true);
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => r.dmem[i]), [4, 7, 10, 3, 8]);
    assert.deepEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 'n0'].map((n) => reg(r, n)), [0, 3, 5, 5, 4, 16, 0, 1, 8]);
    assert.deepEqual([r.instructions, r.stalls, r.flushed, r.cycles], [111, 5, 46, 166]);
  });

  test('habeli_call: t1 = 42, hae = 8, MEM[0] = 42; 6 instructions, 4 flushed, 14 cycles', () => {
    const r = run('habeli_call');
    assert.equal(r.halted, true);
    assert.deepEqual([reg(r, 't0'), reg(r, 't1'), reg(r, 'hae'), r.dmem[0]], [21, 42, 8, 42]);
    assert.deepEqual([r.instructions, r.stalls, r.flushed, r.cycles], [6, 0, 4, 14]);
  });

  test('alu_mix: every arithmetic and logic instruction; 8 instructions, 12 cycles', () => {
    const r = run('alu_mix');
    assert.equal(r.halted, true);
    assert.deepEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6'].map((n) => reg(r, n)), [12, 10, 2, 14, 8, 96, -2]);
    assert.deepEqual([r.instructions, r.stalls, r.flushed, r.cycles], [8, 0, 0, 12]);
  });
});

describe('reference model: the execution rules of spec section 6', () => {
  const run = (src) => runReference(assemble(src).words);

  test('reset: p2 (lesupa) = 0x1000 and everything else 0', () => {
    const r = run('h: lekana noto, noto, h');
    assert.equal(r.regs[2], 0x1000);
    assert.equal(r.regs[3], 0);
  });
  test('a write to p0 is discarded', () => {
    const r = run('kopanyah noto, noto, 5\nh: lekana noto, noto, h');
    assert.equal(r.regs[0], 0);
  });
  test('khutla reads rs1 BEFORE it writes rd (khutla hae, 0(hae))', () => {
    const r = run('kopanyah hae, noto, 12\nkhutla hae, 0(hae)\nkopanyah t0, noto, 99\nh: lekana noto, noto, h');
    assert.equal(r.halted, true);
    assert.equal(r.regs[1], 8);           // the link value, PC + 4 of the khutla at address 4
    assert.equal(r.regs[REGISTER_LOOKUP.t0], 0);   // the instruction at address 8 was skipped
  });
  test('arithmetic wraps in 32 bits and nyane compares signed', () => {
    const r = run('kopanyah t0, noto, -1\nkopanyah t1, noto, 1\nnyane t0, t1, yes\nkopanyah t2, noto, 7\nyes: kopanyah t3, noto, 9\nh: lekana noto, noto, h');
    assert.equal(r.regs[REGISTER_LOOKUP.t2], 0);   // -1 < 1 is true: the branch skipped t2
    assert.equal(r.regs[REGISTER_LOOKUP.t3], 9);
  });
  test('a load from an address that is not a multiple of 4 stops the run with a message', () => {
    const r = run('tshela t0, 2(noto)\nh: lekana noto, noto, h');
    assert.equal(r.halted, false);
    assert.match(r.stopReason, /not word-aligned/);
  });
  test('a store outside data memory stops the run', () => {
    const r = run('kopanyah t0, noto, 2047\nchetse t0, t0, 2\nboloka noto, 0(t0)\nh: lekana noto, noto, h');
    assert.equal(r.halted, false);
    assert.match(r.stopReason, /outside data memory/);
  });
  test('running off the end of a program fetches 0x00000000 and stops', () => {
    const r = run('kopanyah t0, noto, 1');
    assert.equal(r.halted, false);
    assert.match(r.stopReason, /0x00000000/);
  });
  test('load-use stall: only when the next instruction really uses the loaded register', () => {
    assert.equal(run('tshela t0, 0(noto)\nkopanya t1, t0, t0\nh: lekana noto, noto, h').stalls, 1);
    assert.equal(run('tshela t0, 0(noto)\nkopanyah t1, t0, 1\nh: lekana noto, noto, h').stalls, 1);
    assert.equal(run('tshela t0, 0(noto)\nboloka t0, 4(noto)\nh: lekana noto, noto, h').stalls, 1);   // the data register of a store
    assert.equal(run('tshela t0, 0(noto)\nkopanyah t1, noto, 10\nh: lekana noto, noto, h').stalls, 0); // immediate 10 looks like t0 in the rs2 bits
    assert.equal(run('tshela t0, 0(noto)\nkopanya t1, t1, t1\nh: lekana noto, noto, h').stalls, 0);
    assert.equal(run('tshela noto, 0(noto)\nkopanya t1, noto, noto\nh: lekana noto, noto, h').stalls, 0); // a load into p0 never stalls
  });
});
