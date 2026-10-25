# Pipeline registers and machine state (M2)

Status: M2 design contract. Field names are PROVISIONAL until checked against the frozen ISA v1.1 (Moseme) and the ALU-control encoding (Katleho). Code: `src/core/pipelineState.mjs`. Tests: `tests/pipelineState.test.mjs` (`node --test`).

## 1. Architectural vs microarchitectural state
| Kind | Items | Why |
|---|---|---|
| Architectural | `pc`, `regs[0..31]` (p0 hard-wired 0), `imem` (4 KiB), `dmem` (4 KiB) | A program can name or observe them; every LIMO implementation must have them. |
| Microarchitectural | `ifid`, `idex`, `exmem`, `memwb`, `ctrl` bits, `cycle`, `halted` | Implementation choices; a single-cycle or superscalar LIMO must run the same binaries, so the ISA must not specify them. |

## 2. Why four registers for five stages
Registers sit on the boundaries between stages: IF|ID, ID|EX, EX|MEM, MEM|WB. Five stages have four boundaries. The PC is architectural state in front of IF; the register file is written at the end of WB. Each register holds one instruction's data and control for one cycle, so five instructions can be in five stages at once.

## 3. Bubble and validity rule
Every pipeline register has `valid: boolean`. `valid = false` is an empty slot (bubble); its other fields are zeroed and ignored, and its control signals are all false, so it cannot write registers or memory. A bubble is NEVER recognised by `instr === 0`: a fetched all-zero word is a valid slot. A NOP (`kopanyah noto, noto, 0`, 0x00000013) is a real instruction and counts in N; a bubble counts as a stall or a flush.

## 4. Data dictionary
Types: `bool`; `u32` unsigned 32-bit; `i32` signed 32-bit; `reg` 0..31; `ctrl` control record (section 5). "Scaffold" = populated by the current `step()` (Y) or only present with its reset value until M3 (N).

### IF/ID (IF -> ID)
| Field | Type | Kind | Meaning | Reset | Scaffold |
|---|---|---|---|---|---|
| valid | bool | control | slot holds a fetched instruction | false | Y |
| pc | u32 | data | address of the fetched instruction | 0 | Y |
| instr | u32 | data | raw instruction word | 0 | Y |
| pcPlus4 | u32 | data | pc + 4 (sequential PC, link value) | 0 | Y |

### ID/EX (ID -> EX)
| Field | Type | Kind | Meaning | Reset | Scaffold |
|---|---|---|---|---|---|
| valid | bool | control | slot holds an instruction | false | Y |
| pc, instr, pcPlus4 | u32 | data | carried from IF/ID | 0 | Y |
| rs1, rs2 | reg | data | source register numbers (for M4 forwarding comparators) | 0 | N |
| rd | reg | data | destination register number | 0 | N |
| rs1Val, rs2Val | i32 | data | values read from the register file | 0 | N |
| imm | i32 | data | sign-extended immediate | 0 | N |
| ctrl | ctrl | control | control signals decoded in ID | all false | N |

### EX/MEM (EX -> MEM)
| Field | Type | Kind | Meaning | Reset | Scaffold |
|---|---|---|---|---|---|
| valid | bool | control | slot holds an instruction | false | Y |
| pc, instr, pcPlus4 | u32 | data | carried forward | 0 | Y |
| rd | reg | data | destination register number | 0 | N |
| aluResult | i32 | data | ALU output; memory address for load/store | 0 | N |
| storeData | i32 | data | value to store (rs2 value) | 0 | N |
| ctrl | ctrl | control | carried control record | all false | N |

### MEM/WB (MEM -> WB)
| Field | Type | Kind | Meaning | Reset | Scaffold |
|---|---|---|---|---|---|
| valid | bool | control | slot holds an instruction | false | Y |
| pc, instr, pcPlus4 | u32 | data | carried forward | 0 | Y |
| rd | reg | data | destination register number | 0 | N |
| aluResult | i32 | data | candidate write-back value (ALU) | 0 | N |
| memData | i32 | data | candidate write-back value (loaded word) | 0 | N |
| ctrl | ctrl | control | regWrite and wbSel used in WB | all false | N |

Both write-back candidates are carried and the wbSel mux runs in WB, so the visualiser can show the mux.

## 5. Control record `ctrl`
| Signal | Meaning | Consumed in |
|---|---|---|
| regWrite | write a result into rd | WB |
| aluSrc | ALU second operand: immediate (true) or rs2 (false) | EX |
| aluOp | ALU operation (PROVISIONAL: ADD, SUB, AND, OR, SLL, SLT) | EX |
| memRead | read data memory (loads) | MEM |
| memWrite | write data memory (stores) | MEM |
| wbSel | write-back source: 'ALU', 'MEM' or 'PC4' (PC4 for tlola and khutla) | WB |
| branch | conditional branch; taken if the compare holds | EX |
| jump, jalr | unconditional jump; jalr target = rs1 + imm | EX |

The UI shows MemtoReg as derived (wbSel === 'MEM'). PCSrc is a combinational output of EX, not a pipeline field.

## 6. Clock-cycle semantics
`step(state)` returns a new state; the old state is never mutated.
1. Read the current PC and the four pipeline registers.
2. Compute every stage's output from the OLD state only (combinational).
3. Build the next values of the four registers and the PC.
4. Commit all of them together; cycle = cycle + 1.
So an instruction moves exactly one stage per cycle (test: "advances exactly one stage per cycle").
Branches and jumps resolve in EX with predict-not-taken: the new IF/ID and ID/EX become bubbles and the PC takes the target (pending team vote #26). Branch outcome and target are per-cycle `trace` values for the UI, not pipeline fields.
Register file (M1 timing): written in the first half-cycle, read in the second, so ID sees the value WB writes in the same cycle.

## 7. Reset and halt
`createState()`: pc = 0, cycle = 0, halted = false, regs and dmem all 0, all four pipeline registers are bubbles. `reset(state)` keeps the loaded `imem`.
Halt is the M1 convention: a branch to itself (`lekana noto, noto, <own label>`). Detection of `halted` is added in M3.

## 8. Known limitations and deferred work
- M2 `step()` only fetches and moves instruction metadata; decode, execute, memory and write-back arrive in M3.
- Forwarding, load-use stall and branch flush arrive in M4.
- `regs` and `dmem` are shared by reference between states in the scaffold; M3 must copy on write.
- `ctrl` is carried whole through every register for simplicity; M3 may trim it per stage.
