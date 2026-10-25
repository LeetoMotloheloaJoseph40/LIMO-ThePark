# LIMO Instruction Set Architecture: Specification v1.1 (frozen for M2)

Team The Park · CS3520 AY 2026/2027 · supersedes §2 of the M1 submission (tag `m1`) · 24 Oct 2026

**Status.** Frozen. Every instruction encoding is identical to M1, so every M1 program assembles to the same machine code. v1.1 corrects errors found in M1, states behaviour the simulator must implement (M1 was silent or said "undefined"), completes the opcode/funct table (A5) and adds two example programs. All changes are listed in §10.

## 1 Overview

| Property | Decision |
|---|---|
| Style | 32-bit load–store; only `tshela` and `boloka` touch memory; fixed 32-bit instructions |
| Registers | 32 × 32-bit (`p0`–`p31`), 5-bit specifiers; the PC is separate and not numbered |
| Memory | Byte-addressed, little-endian, word access only (word-aligned); separate instruction and data memories, 4 KiB each, addresses `0x000`–`0xFFF` |
| Formats | R, I (with a shift variant), S, B, J at RV32I field positions; no U |
| Instructions | 13 (handout: 10–20), all with RV32I encodings |
| Language | Sesotho mnemonics, plain ASCII, case-insensitive |

## 2 Architectural state

**Reset state.** PC = 0. `p0` = 0 (always). `p2` (`lesupa`, the stack pointer) = `0x00001000`, one word above the top of data memory, so the first push stores at `0xFFC`. All other registers = 0. Data memory = all zero. Instruction memory holds the assembled program from address 0.

| Number | Sesotho name | Aliases | Type | Convention | RV32I equivalent |
|---|---|---|---|---|---|
| p0 | Noto | `noto`, `zero` | SPR | Hard-wired 0; writes are discarded | x0 |
| p1 | Hae | `hae`, `ra` | SPR | Return address; written with PC+4 by `tlola` and `khutla` | x1 |
| p2 | Lesupa | `lesupa`, `sp` | SPR | Stack pointer; grows downward; word-aligned; callee-preserved | x2 |
| p3–p4 | Nakoana | `n7`–`n8` | GPR | Temporaries (v1.1; were "reserved" in M1) | x3–x4 (gp, tp) |
| p5–p7 | Nakoana | `n0`–`n2` | GPR | Temporaries; a called procedure may destroy them | x5–x7 (t0–t2) |
| p8–p9 | Bolokuoe | `b0`–`b1` | GPR | Saved; a called procedure must preserve them | x8–x9 (s0–s1) |
| p10–p17 | Taba le pusetso | `t0`–`t7` | GPR | Arguments and return values (`t0`, `t1` return); caller-saved | x10–x17 (a0–a7) |
| p18–p27 | Bolokuoe | `b2`–`b11` | GPR | Saved; a called procedure must preserve them | x18–x27 (s2–s11) |
| p28–p31 | Nakoana | `n3`–`n6` | GPR | Temporaries; a called procedure may destroy them | x28–x31 (t3–t6) |
| PC | Sebali | n/a | SPR | Address of the current instruction; 32 bits, word-aligned | n/a |

Only `p0` is special in hardware; everything else is software convention. Registers are accepted by number (`p5`), alias, or Sesotho name (`noto`, `hae`, `lesupa`). **Translating to RV32I for Ripes: map by register number** (`p10` is `x10`), not by alias, because LIMO `t0` is `x10` (RV32I `a0`) while RV32I `t0` is `x5`.

Register-file size and field widths: 32 registers keep the RV32I 5-bit specifiers, so no field moves. A 16-register file would free 3 bits per R-type instruction and an 8-register file 6; LIMO keeps the RV32I positions, so the saving goes unused (A6-a).

## 3 Instruction formats and immediates

```
        31      25 24   20 19   15 14  12 11       7 6      0
R       funct7     rs2     rs1     funct3 rd         opcode
I       imm[11:0]          rs1     funct3 rd         opcode
I-shift 0000000    shamt   rs1     001    rd         opcode
S       imm[11:5]  rs2     rs1     funct3 imm[4:0]   opcode
B       imm[12|10:5] rs2   rs1     funct3 imm[4:1|11] opcode
J       imm[20|10:1|11|19:12]              rd         opcode
```

| Field | Encodable range | LIMO rule |
|---|---|---|
| I immediate (`kopanyah`, `tshela`, `khutla`) | −2048…2047 | none |
| shift amount (`chetse`) | 0…31 | none |
| S immediate (`boloka`) | −2048…2047 | none |
| B offset (bytes, bit 0 implicit) | −4096…+4094 | multiple of 4, so −4096…+4092 |
| J offset (bytes, bit 0 implicit) | −1 048 576…+1 048 574 | multiple of 4 |

`khutla` uses the I layout. `tlola` has no `rs1` or `funct3`, so its 20 immediate bits fill bits 31–12.

## 4 Instruction set and complete encoding table

| Mnemonic | Meaning | Syntax | Operation | Fmt | opcode | funct3 | funct7 | RV32I |
|---|---|---|---|---|---|---|---|---|
| `kopanya` | join: add | `kopanya rd, rs1, rs2` | R[rd] ← R[rs1] + R[rs2] | R | `0110011` | `000` | `0000000` | add |
| `tlosa` | take away: subtract | `tlosa rd, rs1, rs2` | R[rd] ← R[rs1] − R[rs2] | R | `0110011` | `000` | `0100000` | sub |
| `kopanyah` | kopanya + h: add immediate | `kopanyah rd, rs1, imm` | R[rd] ← R[rs1] + sext(imm) | I | `0010011` | `000` | n/a | addi |
| `le` | "and": bitwise AND | `le rd, rs1, rs2` | R[rd] ← R[rs1] & R[rs2] | R | `0110011` | `111` | `0000000` | and |
| `kapa` | "or": bitwise OR | `kapa rd, rs1, rs2` | R[rd] ← R[rs1] \| R[rs2] | R | `0110011` | `110` | `0000000` | or |
| `chetse` | shift left | `chetse rd, rs1, shamt` | R[rd] ← R[rs1] << shamt | I-shift | `0010011` | `001` | `0000000` | slli |
| `tshela` | put into a register: load word | `tshela rd, imm(rs1)` | R[rd] ← M[R[rs1] + sext(imm)] | I | `0000011` | `010` | n/a | lw |
| `boloka` | keep: store word | `boloka rs2, imm(rs1)` | M[R[rs1] + sext(imm)] ← R[rs2] | S | `0100011` | `010` | n/a | sw |
| `lekana` | be equal: branch if equal | `lekana rs1, rs2, target` | if R[rs1] = R[rs2], PC ← PC + off | B | `1100011` | `000` | n/a | beq |
| `haelekane` | not equal: branch if not equal | `haelekane rs1, rs2, target` | if R[rs1] ≠ R[rs2], PC ← PC + off | B | `1100011` | `001` | n/a | bne |
| `nyane` | small: branch if less (signed) | `nyane rs1, rs2, target` | if R[rs1] < R[rs2], PC ← PC + off | B | `1100011` | `100` | n/a | blt |
| `tlola` | jump: jump and link | `tlola rd, target` | R[rd] ← PC+4; PC ← PC + off | J | `1101111` | n/a | n/a | jal |
| `khutla` | return: jump and link register | `khutla rd, imm(rs1)` | t ← (R[rs1] + sext(imm)) & ~1; R[rd] ← PC+4; PC ← t | I | `1100111` | `000` | n/a | jalr |

Any 32-bit word that is not one of these 13 encodings is not an instruction (see §6).

## 5 Assembly language

- One instruction per line. An optional label (`name:`) may precede it on the same line or stand alone on the line before it.
- Comments start with `#` or `;` and run to the end of the line. Mnemonics, register names and labels are case-insensitive.
- Operands are comma-separated. Memory operands are `imm(reg)`; the immediate is required (`0(p1)`, not `(p1)`).
- Immediates are decimal or hex (`0x1F`), with an optional leading minus, and are range-checked (§3).
- A branch or jump target is a label, or a signed byte offset relative to the instruction's own address. Offsets must be multiples of 4.
- There are **no assembler directives and no pseudo-instructions.** Data memory is zero at reset; programs initialise it with `boloka`.
- Labels: letters, digits, `_` and `'`, not starting with a digit; unique; may not equal a mnemonic or register name.
- **Apostrophes (ts', ch').** The apostrophe is a letter, never punctuation: legal in mnemonics and labels; the curly `’` is normalised to `'`; it is not a comment or quote character, so it cannot be confused with anything else. An apostrophe-free spelling is accepted as an alias only if it does not collide with another mnemonic (`ts'ela` and `tsela` are different words); otherwise the assembler reports an error. No current mnemonic contains an apostrophe; the rule is fixed now so the ISA can grow without breaking programs.
- The assembler reports, with the line number and in plain language: unknown mnemonic, unknown register, wrong operand count or shape, immediate out of range (stating the range), shift amount not 0–31, undefined or duplicate label, branch/jump offset not a multiple of 4 or out of range, program longer than 1024 instructions.

## 6 Execution rules

1. Instructions execute in program order. PC advances by 4 unless a branch or jump is taken.
2. `p0` reads as 0. A write to `p0` is discarded, including the link value of `tlola noto, …` and `khutla noto, …`.
3. Arithmetic is 32-bit two's complement and wraps; there is no overflow detection. `chetse` shifts left, filling with zeros. `nyane` compares signed; `lekana` and `haelekane` compare all 32 bits.
4. `khutla` computes its target from `R[rs1]` **before** `R[rd]` is written, so `khutla hae, 0(hae)` is valid.
5. `tshela` and `boloka` use address R[rs1] + sext(imm).

**Undefined behaviour.** LIMO has no exceptions. The ISA leaves these cases undefined; the simulator must stop, show the PC, and say what happened in plain language (for example "Run stopped at 0x0014: load from 0x1002 is not word-aligned").

| Condition | Simulator behaviour |
|---|---|
| Load or store address not a multiple of 4 | stop with message |
| Load or store address outside `0x000`–`0xFFC` | stop with message |
| Branch, jump or `khutla` target not a multiple of 4, or outside instruction memory | stop with message |
| Fetched word is not one of the 13 instructions (including `0x00000000`, which is what running off the end of a program fetches) | stop with message |

**Halt.** There is no halt instruction. A program ends with `lekana noto, noto, <its own label>` (`0x00000063`, a branch to itself). The simulator stops when the first execution of that instruction completes WB.

**Cycle counting.** cycles = N + 4 + stalls + flushed, where N counts executed instructions including the halt, stalls are load-use bubbles, and flushed is 2 × the number of taken branches and jumps (the halt's own branch is not counted). The 4 is the pipeline fill.

## 7 Micro-architecture contract (frozen with the ISA)

The ISA does not specify these (A6-b), but the cycle counts in §9 depend on them, so the simulator fixes them:

- Five stages IF, ID, EX, MEM, WB; registers IF/ID, ID/EX, EX/MEM, MEM/WB; separate instruction and data memories.
- The register file is written in the first half of a cycle and read in the second, so a value being written back is visible to the instruction in ID that cycle.
- **Forwarding** (Forwarding ON): EX/MEM→EX and MEM/WB→EX for both operands (ForwardA, ForwardB), EX/MEM taking priority. It applies to `rs2` even when `ALUSrc` selects the immediate, because for `boloka` that value is the data to store. A producer forwards only if it writes a register and its `rd` ≠ `p0`.
- **Load-use stall:** detected in ID. If the instruction in EX is a load and its `rd` ≠ `p0` equals a source register the instruction in ID actually uses, hold PC and IF/ID for one cycle and insert a bubble. "Actually uses" means opcode-aware: `kopanyah`, `chetse`, `tshela`, `khutla` do not use `rs2`, and `tlola` uses neither source. Comparing raw bit fields would stall falsely and break the cycle counts.
- **Control hazards:** branches and jumps resolve in EX with predict-not-taken; a taken transfer flushes the two younger instructions and the next fetch is the target. Resolving in ID (M1's traces gave 36 and 153 cycles for CountFirstN and count_even instead of 41 and 166) was **rejected**: it needs a comparator, forwarding into ID and extra stalls, and every expected count in this document assumes EX.
- **Forwarding OFF:** a consumer waits in ID until its producer has written back (two stalls for back-to-back dependence, one if one instruction sits between).

## 8 One worked encoding per instruction

| Instruction | Binary (bit 31 … 0) | Hex |
|---|---|---|
| `kopanya p3, p1, p2` | `0000000 00010 00001 000 00011 0110011` | `0x002081B3` |
| `tlosa p3, p1, p2` | `0100000 00010 00001 000 00011 0110011` | `0x402081B3` |
| `kopanyah p3, p1, 10` | `000000001010 00001 000 00011 0010011` | `0x00A08193` |
| `le p3, p1, p2` | `0000000 00010 00001 111 00011 0110011` | `0x0020F1B3` |
| `kapa p3, p1, p2` | `0000000 00010 00001 110 00011 0110011` | `0x0020E1B3` |
| `chetse p3, p1, 3` | `0000000 00011 00001 001 00011 0010011` | `0x00309193` |
| `tshela p3, 8(p1)` | `000000001000 00001 010 00011 0000011` | `0x0080A183` |
| `boloka p2, 4(p1)` | `0000000 00010 00001 010 00100 0100011` | `0x0020A223` |
| `lekana p1, p2, 8` | `0 000000 00010 00001 000 0100 0 1100011` | `0x00208463` |
| `haelekane p1, p2, 8` | `0 000000 00010 00001 001 0100 0 1100011` | `0x00209463` |
| `nyane p1, p2, 8` | `0 000000 00010 00001 100 0100 0 1100011` | `0x0020C463` |
| `tlola p1, 8` | `0 0000000100 0 00000000 00001 1101111` | `0x008000EF` |
| `khutla p0, 0(p1)` | `000000000000 00001 000 00000 1100111` | `0x00008067` |

A backward jump shows the sign-extended J immediate: `tlola noto, loop` at PC `0x18` with `loop` at `0x0C` (offset −12) encodes as `0xFF5FF06F`.

## 9 Example programs (in `/examples`)

| File | Exercises | N | Stalls | Flushed | Cycles | Final state |
|---|---|---|---|---|---|---|
| `CountFirstN.limo` | counted loop, `nyane` taken and not taken, backward `tlola` | 25 | 0 | 12 | 41 | t0 = 5, t1 = 15, t2 = 6 |
| `compare_2_int.limo` | store, load, load-use stall, `nyane`, forward `tlola` | 11 | 1 | 2 | 18 | MEM[0] = 25, MEM[4] = 17, MEM[16] = 25 |
| `compare_2_int.limo` (B = 40) | `nyane` taken | 10 | 1 | 2 | 17 | MEM[4] = MEM[16] = 40 |
| `count_even.limo` | nested loops, load-use stall per element, forwarding into a branch | 111 | 5 | 46 | 166 | t1 = 3, t2 = 5, t5 = 16 |
| `habeli_call.limo` | `tlola` with link, `khutla`, return address | 6 | 0 | 4 | 14 | t1 = 42, hae = 8, MEM[0] = 42 |
| `alu_mix.limo` | `tlosa`, `kapa`, `le`, `chetse`, no hazards | 8 | 0 | 0 | 12 | t2 = 2, t3 = 14, t4 = 8, t5 = 96, t6 = 0xFFFFFFFE |

Each row was assembled and run through an instruction-level model of §6 and §7 (a throwaway script, not part of the repo); machine code, final state, N, stalls, flushes and cycles match. Translating them to RV32I for Ripes (B8-iii) needs the care described in the architect notes.

## 10 Change log, M1 → v1.1

| # | M1 location | Change |
|---|---|---|
| F1 | Program 2, line 12 | `qetile: lekana noto, noto, qetiled` branched to an undefined label; target is now `qetile`. Results and cycles unchanged. |
| F2 | §3(f) | The 9999 example needs `kopanyah`, `chetse`, `kopanyah` (`kopanya` adds two registers and cannot add an immediate). E.g. `kopanyah t0, noto, 39` / `chetse t0, t0, 8` / `kopanyah t0, t0, 15`. |
| F3 | §3(f) | "nine registers (n0, t0–t7 and p0)" miscounted: that is nine registers besides `p0`, ten with it. |
| F4 | §2.2 | `p3`–`p4` were both "reserved" and "ordinary", and had no Sesotho name. Now temporaries `n7`–`n8` (Nakoana); no program used them and no encoding changes. |
| F5 | §2.4–2.5 | A5 asks for opcode/funct assignments; M1 listed them only through examples. Added the complete table (§4) and one worked encoding per instruction (§8). |
| F6 | §2.1 | Added reset state, including `lesupa` = `0x1000` (§2). |
| F7 | §2.1, §2.3 | "Misaligned access is undefined" now says what the simulator does (§6); added alignment rule for branch and jump targets. |
| F8 | §2.4 | Assembler rules made complete: no directives or pseudo-instructions, label syntax, numeric offsets, error list (§5). |
| F9 | §2.1, §3 | Halt and cycle counting defined precisely (§6). |
| F10 | §3(c) | M1 said the branch stage would be "revisited before the M2 freeze". Decision: **EX**, with the measured ID alternative recorded as rejected (§7). |
| F11 | §3 | Forwarding and load-use rules written down, including the `p0` exclusion, store-data forwarding and opcode-aware hazard detection (§7). |
| F12 | §4 | M1's samples never used `khutla`, `tlosa`, `kapa` or `chetse`, though B8 asks for a test per instruction class. Added `habeli_call.limo` and `alu_mix.limo`. |

**Not changed, on purpose.** All 13 mnemonics, every encoding, the register numbering, the memory map and the three M1 programs (apart from F1). Considered and not added: a right shift, an unsigned compare or `bge`-style branches. Each is expressible with the existing set, and each would reopen the decoder after the freeze.
