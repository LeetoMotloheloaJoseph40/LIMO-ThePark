# LIMO assembler (docs/assembler.md)

Author: assembler lead. Status: working; `npm test` runs the whole suite (232 tests passing: 63 assembler tests in `tests/assembler.test.js`, 162 decoder, loader and reference-model tests in `tests/decode.test.js`, and the core and harness tests).

## Files
| File | What it is |
|---|---|
| `src/isa.js` | The ISA as tables: instructions (opcode/funct/format), registers, immediate ranges. Single source of truth. |
| `src/assembler.js` | `assemble(text)` -> `{ ok, lines, errors, warnings, labels, words }`. Written step by step, with comments linking each part to the M1 spec. |
| `src/decode.js` | The assembler run backwards (M3): `decode(word)`, `disassemble(word)`, `registerName(n)`. Used by the core's ID stage and the interface. |
| `src/program.js` | `buildInstructionMemory(assembly)`: checks the assembly and returns the 1024-word instruction memory (M3). |
| `tests/helpers/refmodel.js` | A one-instruction-at-a-time reference machine that follows spec section 6. Used only by tests (M3). |
| `tests/assembler.test.js` | Assembler unit tests: one per instruction, lexical rules, immediate/branch limits, errors, warnings, example programs |
| `examples/*.limo` | The five example programs of spec v1.1 section 9 (CountFirstN, compare_2_int, count_even, habeli_call, alu_mix) |

## Design
- **Two passes.** Pass 1 records label addresses (4 bytes per instruction). Pass 2 encodes.
- **Fields to word.** Each format is a list of fields (name, width, value); the word is built by joining them,
  so the colour-coded field list can never disagree with the machine code.
- **Branch/jump operand:** a label (offset = label address - instruction address) or a number (byte offset).
  Offsets must be a multiple of 4 (spec v1.1 sections 3 and 5); reach is -4096..+4092 (B) and -1048576..+1048572 (J).
- **Errors:** `{ line, message, suggestion }`; all errors are reported at once; no machine code if any error.
- **Registers:** p0-p31, aliases (zero, ra, sp, n0-n8, b0-b11, t0-t7) or Sesotho names (noto, hae, lesupa).
- **Apostrophe:** a letter; curly becomes straight; not a comment character; apostrophe-free alias only if no collision.
- **No browser code:** testable with Node; the interface only calls `assemble()`.

## Output of `assemble` for the interface
`lines[i]` = `{ line, source, address, mnemonic, format, rv32i, word, hex, binary, fields[] }`
with `fields[j]` = `{ name, bits, value, binary }`, most significant first.

## Found while testing
M1 Program 2, line 12: the halt branch said `qetiled` but the label is `qetile`. Fixed in `examples/compare_2_int.limo`;
a test checks that the assembler reports it with a "Did you mean" hint.

## Rules checked against spec v1.1 (M5 review)
- Branch/jump offsets must be a multiple of 4 (earlier code only checked "even", so `lekana p1, p2, 6` assembled).
- A memory operand needs an explicit offset: `0(p1)`, not `(p1)` (spec section 5).
- `warnings` holds non-fatal notes. Today there is one: the program has no halt (`lekana noto, noto, <own label>`, word `0x00000063`). The interface should show it; it does not stop the program assembling.
- All 13 worked encodings in spec section 8 are tested and match.

## M3 additions (assembler lead)

### Fixed: `n7` and `n8` were missing
Spec v1.1 section 2 names `p3` and `p4` as `n7` and `n8`, but `src/isa.js` did not list them, so `kopanya n7, n8, noto` was rejected as "not a LIMO register". They are now in the register table (the only file that needed editing), and `tests/decode.test.js` checks every alias of the spec table.

### `decode(word)` - the pipeline core's ID stage can use it
Returns, for any 32-bit word:
`{ valid, word, hex, mnemonic, format, class, rd, rs1, rs2, imm, readsRs1, readsRs2, writesRd, isHalt, reason }`
- `class` is `alu`, `load`, `store`, `branch` or `jump` (`khutla` is a jump).
- `imm` is signed; for branches and jumps it is the byte offset (bit 0 is always 0 and not stored).
- Register fields an instruction does not have are returned as 0, and `readsRs1`/`readsRs2` say which registers it really reads. This is the opcode-aware rule of spec section 7: `kopanyah t1, noto, 10` has the number 10 in the bits where `rs2` would be, but it does not read `rs2`, so it must not cause a load-use stall. The hazard unit (M4) should test `readsRs1`/`readsRs2`, not raw bit fields.
- `writesRd` is the class rule only. A write to `p0` is discarded (spec section 6), so the hazard unit still has to check `rd !== 0`.
- If the word is not one of the 13 instructions (including `0x00000000`), `valid` is false and `reason` is a plain-language message the simulator can show when it stops (spec section 6, table). A word matches an instruction only if its opcode and every funct field the table gives for it agree, so `srli`, `mul`, `lb` and `lui` are rejected.
- `isHalt` is true for `0x00000063`, the branch to itself.

### `disassemble(word, style)`
Writes the instruction as text the assembler reads back: `disassemble(0x00C54863)` is `nyane t0, t2, 16`. A word has no labels, so branch and jump targets appear as byte offsets. `style` is `'alias'` (default: `noto`, `hae`, `n0`, `t0`) or `'number'` (`p0`, `p1`, ...). For an invalid word it returns `(not an instruction) 0x...`.

### `buildInstructionMemory(assembly)`
Replaces the bare `imem.set(result.words)` of docs/interfaces.md section 3. It throws a plain message if the program has errors ("Fix the assembler errors before loading the program.") or is longer than 1024 instructions, instead of silently running an empty program or throwing a RangeError. The rest of instruction memory is `0x00000000`, so running off the end of a program is detected as an invalid word.

### Tests added (`tests/decode.test.js`)
- All 13 worked encodings of spec section 8 decode to the right fields, plus the backward jump `0xFF5FF06F` (-12).
- Round trip `assemble -> decode -> disassemble -> assemble` for every instruction at its smallest and largest immediates, and on every example program.
- 5000 pseudo-random words: `decode` never fails, and every valid word disassembles to text that assembles back to the same word.
- Eleven kinds of word that are not instructions (`0x00000000`, `srli`, `mul`, `lb`, `bge`, `lui`, ...).
- The reference machine (`tests/helpers/refmodel.js`) runs the five example programs and reproduces every final register, memory word and cycle count promised in their headers (41, 18 or 17, 166, 14 and 12 cycles), using cycles = N + 4 + stalls + flushed. This is an independent check that the assembled words mean what the spec says. When the pipeline core (M3) runs the same programs it must end in the same state.
- Spec section 6 rules: `p2` starts at `0x1000`, writes to `p0` are discarded, `khutla` reads `rs1` before writing `rd`, wrap-around and signed `nyane`, and the stop conditions (unaligned or out-of-range access, running off the end).

### Not done / limits
- The reference machine is not the pipeline: it does not model stages or forwarding. It only counts stalls and flushed instructions by the spec's rules.
- The page does not call `decode` yet; the bundle exports `decode`, `disassemble`, `registerName` and `buildInstructionMemory` for the core and the interface.
