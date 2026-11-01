# LIMO ISA v1.1: expected instruction behaviour and control signals (M3)

Owner: S. Senekane (ISA Architect, M3). Source: `docs/ISA-spec-v1.1-frozen.md` (sections 4, 6 and 7) and the control field names in `docs/pipeline-registers.md`.
Status: DRAFT for review. Signal values are derived from the frozen spec; Thabo (core) and Kabelo (tests) should check them against the control unit.

## 1. Behaviour per instruction

| # | Mnemonic | Format | Register write | Memory action | PC choice |
|---|---|---|---|---|---|
| 1 | `kopanya rd, rs1, rs2` | R | rd = rs1 + rs2 | none | PC+4 |
| 2 | `tlosa rd, rs1, rs2` | R | rd = rs1 - rs2 | none | PC+4 |
| 3 | `kopanyah rd, rs1, imm` | I | rd = rs1 + sext(imm) | none | PC+4 |
| 4 | `le rd, rs1, rs2` | R | rd = rs1 AND rs2 | none | PC+4 |
| 5 | `kapa rd, rs1, rs2` | R | rd = rs1 OR rs2 | none | PC+4 |
| 6 | `chetse rd, rs1, shamt` | I-shift | rd = rs1 << shamt (zero fill) | none | PC+4 |
| 7 | `tshela rd, imm(rs1)` | I | rd = MEM[rs1 + sext(imm)] | read word | PC+4 |
| 8 | `boloka rs2, imm(rs1)` | S | none | write rs2 to MEM[rs1 + sext(imm)] | PC+4 |
| 9 | `lekana rs1, rs2, target` | B | none | none | if rs1 = rs2: PC + off, else PC+4 |
| 10 | `haelekane rs1, rs2, target` | B | none | none | if rs1 != rs2: PC + off, else PC+4 |
| 11 | `nyane rs1, rs2, target` | B | none | none | if rs1 < rs2 (signed): PC + off, else PC+4 |
| 12 | `tlola rd, target` | J | rd = PC+4 | none | PC + off (always) |
| 13 | `khutla rd, imm(rs1)` | I | rd = PC+4 | none | (rs1 + sext(imm)) & ~1 (always) |

## 2. Control signals (generated in ID)

`aluOp` values are PROVISIONAL in `pipelineState.mjs`; the compare ops for branches are EQ, NE and LT.

| Mnemonic | regWrite | aluSrc | aluOp | memRead | memWrite | wbSel | branch | jump | jalr |
|---|---|---|---|---|---|---|---|---|---|
| `kopanya` | 1 | 0 (rs2) | ADD | 0 | 0 | ALU | 0 | 0 | 0 |
| `tlosa` | 1 | 0 | SUB | 0 | 0 | ALU | 0 | 0 | 0 |
| `kopanyah` | 1 | 1 (imm) | ADD | 0 | 0 | ALU | 0 | 0 | 0 |
| `le` | 1 | 0 | AND | 0 | 0 | ALU | 0 | 0 | 0 |
| `kapa` | 1 | 0 | OR | 0 | 0 | ALU | 0 | 0 | 0 |
| `chetse` | 1 | 1 (shamt) | SLL | 0 | 0 | ALU | 0 | 0 | 0 |
| `tshela` | 1 | 1 | ADD (address) | 1 | 0 | MEM | 0 | 0 | 0 |
| `boloka` | 0 | 1 | ADD (address) | 0 | 1 | n/a | 0 | 0 | 0 |
| `lekana` | 0 | 0 | EQ | 0 | 0 | n/a | 1 | 0 | 0 |
| `haelekane` | 0 | 0 | NE | 0 | 0 | n/a | 1 | 0 | 0 |
| `nyane` | 0 | 0 | LT | 0 | 0 | n/a | 1 | 0 | 0 |
| `tlola` | 1 | n/a | n/a | 0 | 0 | PC4 | 0 | 1 | 0 |
| `khutla` | 1 | 1 | ADD (target) | 0 | 0 | PC4 | 0 | 0 | 1 |

Notes:
- MemtoReg is derived: MemtoReg = (wbSel == MEM).
- PCSrc is a combinational output of EX (taken branch, `tlola` or `khutla`); it is not stored in a pipeline register.
- For `boloka`, the store data is the rs2 value even though aluSrc selects the immediate.

## 3. Rules the core must obey

1. `p0` always reads 0, and a write to `p0` is discarded. That includes the link value of `tlola noto, ...` and `khutla noto, ...`.
2. Arithmetic is 32-bit two's complement and wraps, with no overflow detection.
3. `khutla` reads rs1 before rd is written, so `khutla hae, 0(hae)` is valid.
4. The register file writes in the first half of a cycle and reads in the second.
5. Branches and jumps resolve in EX with predict-not-taken; a taken one flushes 2 instructions.
6. Halt is `lekana noto, noto, <own label>` (`0x00000063`). The run stops when its first execution completes WB.
7. Undefined cases stop the run with a plain-language message: misaligned load/store, misaligned or out-of-range jump target, and a word that is not one of the 13 instructions.

## 4. Review checklist (for core and control PRs)

- [ ] Each of the 13 rows in section 2 matches what the control unit outputs.
- [ ] Every register write goes to the right rd and takes the right wbSel source.
- [ ] Only `tshela` reads memory and only `boloka` writes it.
- [ ] Branch compares use EQ, NE and signed LT, over all 32 bits.
- [ ] A write to `p0` never changes `p0`.
- [ ] The expected final state of each example program matches `docs/ISA-spec-v1.1-frozen.md` section 9.
