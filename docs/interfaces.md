# Interface contracts: assembler -> core -> UI (M2)

Status: PROPOSAL for issue #25. Needs a comment "agreed" from Kabelo (assembler) and Thabo (UI). Field names for pipeline state are defined in `docs/pipeline-registers.md`.

## 1. Layers and who owns them
| Layer | Owner | Responsibility | Must not |
|---|---|---|---|
| Assembler | Kabelo | parse, resolve labels, encode, report errors | touch the DOM or the pipeline |
| Core | Leeto | machine state, `step`, `reset` | parse text or draw anything |
| UI | Thabo | render `assembly` and `state`, call `step`/`reset` | keep its own copy of the machine state |

Single source of truth: the core's `state` object. The UI reads it and never edits it.

## 2. Assembler output
`assemble(sourceText)` is a pure function (same text gives the same result).

~~~js
{
  ok: boolean,
  errors: [ { line: number, message: string } ],   // plain language, 1-based line
  lines: [ {
    lineNo: number,        // source line, 1-based
    addr: number,          // byte address of the instruction (multiple of 4)
    source: string,        // original text of the line
    word: number,          // 32-bit machine word (unsigned)
    hex: string,           // "0x00500513"
    bin: string,           // 32 chars
    fields: [ { name: string, bits: string, value: number } ]  // e.g. opcode, rd, rs1, imm
  } ],
  labels: { [name: string]: number },              // label -> byte address
  imem: Uint32Array        // 1024 words (4 KiB), program at index addr/4, rest 0
}
~~~
Rules:
- If `ok` is false, `lines` and `imem` may be empty; the UI shows `errors` only.
- Label resolution, encoding and display strings are separate steps inside the assembler; the browser code only formats what is returned.
- A label may be the last thing in a file. Labels and mnemonics are case-insensitive; the apostrophe is a letter (M1 lexical rules).
- Registers are accepted by number, alias or Sesotho name (M1 section 2.2).

## 3. Assembler -> core
The core consumes only `imem`: `createState({ imem })` or `reset(state)` after loading a new program. The core never reads `lines`, `labels` or `errors`.

## 4. Core -> UI
Module: `src/core/pipelineState.mjs`. Exports: `createState`, `reset`, `step`.
~~~js
state = {
  cycle: number, pc: number, halted: boolean,
  regs: Int32Array(32), imem: Uint32Array(1024), dmem: Uint32Array(1024),
  ifid, idex, exmem, memwb      // each has valid: boolean plus its fields
}
~~~
- UI keeps `previous` (the state before the last step) only to mark changed values.
- From M3 the core also returns a per-cycle `trace` (ALU inputs and result, branch target, memory address and data, write-back value, narration lines).
- Reset: the UI calls `reset(state)`, then re-renders. Cycle counter and all four registers go back to the reset values.
- Step: the UI replaces its state with `step(state)` and re-renders. It never calls `step` twice for one click.

## 5. Display formatting (UI side)
| Value | Format |
|---|---|
| Address, word, PC | hex, 8 digits, `0x` prefix (`0x00000004`) |
| Register value, immediate | signed decimal; hex on hover or toggle |
| Register name | number, Sesotho name and alias (`p5 nakoana n0`) |
| Bubble (`valid === false`) | text "Bubble" with a dashed outline; fields hidden |
| Valid slot | the instruction text (from `assembly.lines` by pc) plus its hex word |
| Changed value | `*` marker and bold, never colour alone |

Mapping a `pc` to source text is done in the UI by looking up `assembly.lines` with `addr === pc`; the core stays unaware of source text.

## 6. Placeholders at M2
- `step` is a scaffold: it fetches and moves instruction metadata only.
- Decoded fields, control signals, datapath values and narration are empty until M3.
- The UI may render those areas as labelled placeholders ("Available in M3").

## 7. Open questions for sign-off
- Kabelo: does your output match section 2? Please comment differences here.
- Thabo: do you already own a state object? If yes, it must be this one.
- Both: which test command do we use? Proposal: `node --test`.
