# Pipeline registers and machine state

Status: M2 state design, implemented for M3 in `src/core/pipelineState.mjs`. Control fields and ALU operations follow frozen ISA v1.1. Tests: `tests/pipelineState.test.mjs` (`node --test`).

## 1. Architectural vs microarchitectural state
| Kind | Items | Why |
|---|---|---|
| Architectural | `pc`, `regs[0..31]` (p0 hard-wired 0), `imem` (4 KiB), `dmem` (4 KiB) | A program can name or observe them; every LIMO implementation must have them. |
| Microarchitectural | `ifid`, `idex`, `exmem`, `memwb`, `ctrl` bits, `cycle`, `halted`, `haltPending`, `error`, `trace` | Implementation choices; a single-cycle or superscalar LIMO must run the same binaries, so the ISA must not specify them. |

## 2. Why four registers for five stages
Registers sit on the boundaries between stages: IF|ID, ID|EX, EX|MEM, MEM|WB. Five stages have four boundaries. The PC is architectural state in front of IF; the register file is written at the end of WB. Each register holds one instruction's data and control for one cycle, so five instructions can be in five stages at once.

## 3. Bubble and validity rule
Every pipeline register has `valid: boolean`. `valid = false` is an empty slot (bubble); its other fields are zeroed and ignored, and its control signals are all false, so it cannot write registers or memory. A bubble is NEVER recognised by `instr === 0`: a fetched all-zero word is a valid slot. A NOP (`kopanyah noto, noto, 0`, 0x00000013) is a real instruction and counts in N; a bubble counts as a stall or a flush.

## 4. Data dictionary
Types: `bool`; `u32` unsigned 32-bit; `i32` signed 32-bit; `reg` 0..31; `ctrl` control record (section 5). “Implemented” marks fields currently populated by the M3 `step()`.

### IF/ID (IF -> ID)
| Field | Type | Kind | Meaning | Reset | Implemented |
|---|---|---|---|---|---|
| valid | bool | control | slot holds a fetched instruction | false | Y |
| pc | u32 | data | address of the fetched instruction | 0 | Y |
| instr | u32 | data | raw instruction word | 0 | Y |
| pcPlus4 | u32 | data | pc + 4 (sequential PC, link value) | 0 | Y |

### ID/EX (ID -> EX)
| Field | Type | Kind | Meaning | Reset | Implemented |
|---|---|---|---|---|---|
| valid | bool | control | slot holds an instruction | false | Y |
| pc, instr, pcPlus4 | u32 | data | carried from IF/ID | 0 | Y |
| rs1, rs2 | reg | data | source register numbers (for M4 forwarding comparators) | 0 | Y |
| usesRs1, usesRs2 | bool | control | whether this opcode consumes each encoded source field (for opcode-aware M4 hazard detection) | false | Y |
| rd | reg | data | destination register number | 0 | Y |
| rs1Val, rs2Val | i32 | data | values read from the register file | 0 | Y |
| imm | i32 | data | sign-extended immediate | 0 | Y |
| ctrl | ctrl | control | control signals decoded in ID | all false | Y |

### EX/MEM (EX -> MEM)
| Field | Type | Kind | Meaning | Reset | Implemented |
|---|---|---|---|---|---|
| valid | bool | control | slot holds an instruction | false | Y |
| pc, instr, pcPlus4 | u32 | data | carried forward | 0 | Y |
| rd | reg | data | destination register number | 0 | Y |
| aluResult | i32 | data | ALU output; memory address for load/store | 0 | Y |
| storeData | i32 | data | value to store (rs2 value) | 0 | Y |
| halt | bool | control | self-branch halt marker carried to WB | false | Y |
| ctrl | ctrl | control | carried control record | all false | Y |

### MEM/WB (MEM -> WB)
| Field | Type | Kind | Meaning | Reset | Implemented |
|---|---|---|---|---|---|
| valid | bool | control | slot holds an instruction | false | Y |
| pc, instr, pcPlus4 | u32 | data | carried forward | 0 | Y |
| rd | reg | data | destination register number | 0 | Y |
| aluResult | i32 | data | candidate write-back value (ALU) | 0 | Y |
| memData | i32 | data | candidate write-back value (loaded word) | 0 | Y |
| halt | bool | control | self-branch halt marker checked at WB | false | Y |
| ctrl | ctrl | control | regWrite and wbSel used in WB | all false | Y |

Both write-back candidates are carried and the wbSel mux runs in WB, so the visualiser can show the mux.

## 5. Control record `ctrl`
| Signal | Meaning | Consumed in |
|---|---|---|
| regWrite | write a result into rd | WB |
| aluSrc | `true` selects immediate, `false` selects rs2, `null` means no ALU operand is used | EX |
| aluOp | ALU operation: ADD, SUB, AND, OR, SLL, EQ, NE, LT; `ADD` forms load/store and `khutla` addresses; `null` means no ALU operation (`tlola`) | EX |
| memRead | read data memory (loads) | MEM |
| memWrite | write data memory (stores) | MEM |
| wbSel | write-back source: 'ALU', 'MEM' or 'PC4' (PC4 for tlola and khutla) | WB |
| branch | conditional branch; taken if the compare holds | EX |
| jump, jalr | unconditional jump; jalr target = rs1 + imm | EX |
| branchKind | string or null | branch condition: `lekana`, `haelekane`, or `nyane` | EX |

The UI shows MemtoReg as derived (wbSel === 'MEM'). PCSrc is a combinational output of EX, not a pipeline field.

## 6. Clock-cycle semantics
`step(state)` returns a new state; the old state is never mutated.
1. Read the current PC and the four pipeline registers.
2. Compute every stage's output from the OLD state only (combinational).
3. Build the next values of the four registers and the PC.
4. Commit all of them together; cycle = cycle + 1.
So an instruction moves exactly one stage per cycle (test: "advances exactly one stage per cycle").
Branches and jumps resolve in EX with predict-not-taken: for a taken transfer, the new IF/ID and ID/EX become bubbles and the PC takes the target. Branch outcome and target are per-cycle `trace` values for the UI, not pipeline fields. M4 adds forwarding, load-use stalls and hazard-focused visualization/accounting.
Register file (M1 timing): written in the first half-cycle, read in the second, so ID sees the value WB writes in the same cycle.

## 7. Reset and halt
`createState()`: pc = 0, cycle = 0, halted = false, p0 = 0, lesupa/p2 = 0x1000, dmem = 0, all other registers = 0, and all four pipeline registers are bubbles. `reset(state)` restores this state while preserving the loaded `imem`.
Halt is the M1 convention: a branch to itself (`lekana noto, noto, <own label>`). It redirects and flushes as a taken branch, prevents further fetches, then stops when its first execution completes WB. A fetched word that is not one of the 13 instructions stops execution with its PC and a plain-language error. An invalid instruction on a taken control-transfer path is flushed and is not executed or reported as a fault.

## 8. M3 implementation and deferred work
- `step()` decodes, executes, accesses word data memory, writes results back, handles EX control redirects, detects the self-branch halt, and returns a per-cycle `trace`.
- Forwarding and load-use stalls remain M4 work. Until the hazard unit is integrated, M3 programs must avoid read-after-write dependencies.
- Every `step()` copies the register file and data memory before applying writes; the previous state remains unchanged.
- `ctrl` is carried whole through every register for simplicity; later stages may trim it if the UI contract remains stable.

## 9. M3 step and trace contract
`step(state)` returns a new state with the same architectural and pipeline fields, `cycle + 1`, and `trace` for the cycle just completed. It does not mutate `state`, `regs`, or `dmem`.

The trace contains:
- `stages.IF`, `stages.ID`, `stages.EX`, `stages.MEM`, `stages.WB`: instruction or bubble seen at each stage, with decoded or computed values where relevant. Wrong-path IF/ID instructions cleared by a redirect carry `flushed: true` in the trace. A fault trace identifies the stage and instruction or address that caused the fault.
- `control.ID`, `control.EX`, `control.MEM`, `control.WB`: the control record at each pipeline boundary.
- `memoryAddress`, `memoryReadData`, `memoryWriteData`, and `writeBackValue` for active datapath values.
- `redirect` for an EX-stage branch or jump target and `narration` for human-readable stage events.

The core takes encoded instruction words only. The UI maps `pc` back to assembler source lines and owns DOM rendering. Invalid encodings, misaligned/out-of-range memory accesses, and misaligned/out-of-range control-transfer targets stop execution with `state.halted = true` and an `error` containing the faulting PC and a plain-language message. A call to `step()` after a halt returns the same state unchanged.
