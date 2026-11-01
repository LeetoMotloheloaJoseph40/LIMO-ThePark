# Pipeline registers and machine state (M3)

Status: implemented. The normative field/API and cycle-stepping contract is in [`M3-core-state-contract.md`](M3-core-state-contract.md). Implementation: `src/core/pipelineState.mjs`; automated checks: `tests/pipelineState.test.mjs` and `tests/pipelineExecution.test.mjs` (`npm test`).

## Architectural and microarchitectural state

| Kind | State | Contract |
|---|---|---|
| Architectural | `pc`, `regs[0..31]`, `imem[0..1023]`, `dmem[0..1023]` | Separate 4 KiB word memories; p0 hard-wired to zero; reset p2 = 0x1000. |
| Microarchitectural | `ifid`, `idex`, `exmem`, `memwb`, `cycle`, `halted`, counters, trace | Four boundary registers for the five stages IF, ID, EX, MEM, WB. |

The UI consumes the core state directly. It may map a pipeline slot's byte `pc` to source text but must not duplicate execution state.

## Pipeline register fields

Every slot has `valid`. A bubble has `valid: false` and inert controls. A valid all-zero instruction word is not a bubble; it is decoded and rejected as an unsupported instruction. Values not used by a bubble must be ignored.

| Register | Fields | Meaning |
|---|---|---|
| IF/ID | `pc`, `instr`, `pcPlus4` | Fetched instruction and sequential/link address. |
| ID/EX | `pc`, `instr`, `pcPlus4`, `rs1`, `rs2`, `rd`, `rs1Val`, `rs2Val`, `imm`, `ctrl` | Decoded operands, immediate and controls. |
| EX/MEM | `pc`, `instr`, `pcPlus4`, `rs1`, `rs2`, `rd`, `aluResult`, `storeData`, `imm`, `haltCandidate`, `ctrl` | ALU/address result, forwarded store value and controls for MEM/WB. |
| MEM/WB | `pc`, `instr`, `pcPlus4`, `rd`, `aluResult`, `memData`, `haltCandidate`, `ctrl` | Candidate values and controls for architectural write-back. |

`ctrl` includes `regWrite`, `aluSrc`, `aluOp`, `memRead`, `memWrite`, `wbSel` (`ALU`, `MEM`, `PC4`), `branch`, `jump`, `jalr`, plus decoded source-use and branch-kind fields.

## Clock and hazards

`step(state)` is an immutable one-cycle transition: every stage reads the old state, then PC, pipeline registers, register file and data memory are returned together in the next state. WB writes are visible to ID in the same cycle. Forwarding selects EX/MEM before MEM/WB and ignores p0. An opcode-aware load-use dependency holds PC and IF/ID for one cycle and inserts a bubble. EX resolves taken branches/jumps; predict-not-taken control flow flushes the two younger slots and redirects PC. The halt sentinel is a self-branch and is recognized when it reaches WB.

`trace` exposes per-cycle narration. `instructionCount`, `stalls`, and `flushed` support cycle-by-cycle inspection and the frozen sample-program counts. Error stops provide `error` plus `halted: true`; the UI must display the error text instead of a normal-halt message.

See [`M3-core-state-contract.md`](M3-core-state-contract.md) for the complete state shape, reset and API details.
