# LIMO assembler (docs/assembler.md)

Author: assembler lead. Status: working, 57 unit tests passing (`npm test`).

## Files
| File | What it is |
|---|---|
| `src/isa.js` | The ISA as tables: instructions (opcode/funct/format), registers, immediate ranges. Single source of truth. |
| `src/assembler.js` | `assemble(text)` -> `{ ok, lines, errors, labels, words }`. Written step by step, with comments linking each part to the M1 spec. |
| `tests/assembler.test.js` | 57 unit tests |
| `examples/*.limo` | The three M1 sample programs |
| `DEFENCE_GUIDE.md` | How to explain and defend the assembler |

## Design
- **Two passes.** Pass 1 records label addresses (4 bytes per instruction). Pass 2 encodes.
- **Fields to word.** Each format is a list of fields (name, width, value); the word is built by joining them,
  so the colour-coded field list can never disagree with the machine code.
- **Branch/jump operand:** a label (offset = label address - instruction address) or a number (byte offset).
  Offsets must be even; reach is -4096..4094 (B) and -1048576..1048574 (J).
- **Errors:** `{ line, message, suggestion }`; all errors are reported at once; no machine code if any error.
- **Registers:** p0-p31, aliases (zero, ra, sp, n0-n6, b0-b11, t0-t7) or Sesotho names (noto, hae, lesupa).
- **Apostrophe:** a letter; curly becomes straight; not a comment character; apostrophe-free alias only if no collision.
- **No browser code:** testable with Node; the interface only calls `assemble()`.

## Output of `assemble` for the interface
`lines[i]` = `{ line, source, address, mnemonic, format, rv32i, word, hex, binary, fields[] }`
with `fields[j]` = `{ name, bits, value, binary }`, most significant first.

## Found while testing
M1 Program 2, line 12: the halt branch said `qetiled` but the label is `qetile`. Fixed in `examples/compare_2_int.limo`;
a test checks that the assembler reports it with a "Did you mean" hint.
