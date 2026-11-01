# M3 Pipeline Core: State and Stepping Contract

Status: implemented in `src/core/pipelineState.mjs`, aligned with frozen ISA v1.1.
The core is UI-independent and consumes only the 32-bit words in instruction memory.

## State returned by `createState`, `step`, and `reset`

```js
{
  cycle: number, pc: u32, halted: boolean, error: string | null,
  instructionCount: number, stalls: number, flushed: number,
  regs: Int32Array(32), imem: Uint32Array(1024), dmem: Uint32Array(1024),
  ifid: { valid, pc, instr, pcPlus4 },
  idex: { valid, pc, instr, pcPlus4, rs1, rs2, rd, rs1Val, rs2Val, imm, ctrl },
  exmem: { valid, pc, instr, pcPlus4, rs1, rs2, rd, aluResult, storeData, imm,
           haltCandidate, ctrl },
  memwb: { valid, pc, instr, pcPlus4, rd, aluResult, memData, haltCandidate, ctrl },
  trace: { cycle, narration: string[] }
}
```

All addresses are byte addresses. Instruction and data memories are separate, each 1024 words (4 KiB). `p0` always reads as zero and discards writes. Reset sets PC to zero, `p2` to `0x1000`, other registers and data memory to zero, empties the pipeline, and retains the loaded instruction memory. A fetched word of zero is valid until the decoder rejects it; bubbles are represented only by `valid: false`.

## One `step(state)` call

One call advances one clock cycle. It returns a new state and leaves the input state and its register/data-memory arrays unchanged.

1. WB commits the prior MEM/WB value (register-file write is visible to this cycle's ID).
2. MEM reads/writes the prior EX/MEM address and creates MEM/WB data.
3. EX executes the prior ID/EX instruction, applies EX/MEM then MEM/WB forwarding, and resolves branches and jumps.
4. ID decodes IF/ID. A load-use dependency on a source the instruction actually uses holds PC and IF/ID and inserts one ID/EX bubble.
5. IF fetches at PC. A taken transfer flushes the younger IF and ID work and redirects fetch to its target.

Every stage reads the old state; all next-stage registers commit together. A not-taken branch advances sequentially. `flushed` counts two younger slots for each taken control transfer, excluding the self-branch used as the halt sentinel. The simulator halts when that sentinel reaches WB. `instructionCount` counts instructions that reach WB, including the halt. `stalls` counts load-use stall cycles. For the frozen examples, `cycle = instructionCount + 4 + stalls + flushed`.

## Control and error reporting

`ctrl` carries `regWrite`, `aluSrc`, `aluOp`, `memRead`, `memWrite`, `wbSel`, `branch`, `jump`, and `jalr`; decoded source-use flags and branch kind are also present for opcode-aware hazards. EX/MEM has forwarding priority over MEM/WB. `wbSel` is `ALU`, `MEM`, or `PC4`.

Misaligned/out-of-range data access, invalid control-flow targets, out-of-range fetches, and unsupported instruction encodings stop execution with a plain-language `error` string and `halted: true`. The UI should show `error` as an error status, not report it as a normal program halt.

## API and ownership

- `createState({ imem, dmem })`: create a reset machine; `imem` is the assembled program as a 1024-word `Uint32Array`.
- `step(state)`: advance exactly one cycle.
- `reset(state)`: keep `imem`, clear architectural and pipeline state.
- UI and tests may read the returned state; neither should mutate it or maintain a second machine state.

M4 Hazard Unit co-lead handoff: Kabelo and the pipeline lead can extend/review hazard coverage against this contract. Keep hazard policy in the core and retain UI independence. Full regression command: `npm test`; example-program cycle/final-state checks are in `tests/pipelineExecution.test.mjs`.
