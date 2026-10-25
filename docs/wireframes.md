# LIMO simulator wireframes (M2)

Status: M2 layout contract. Thabo (interface lead) owns the UI skeleton; this document defines names and data contracts and does not replace his code. Data comes from `docs/pipeline-registers.md` (`state`) and the assembler output (`assembly`, defined in `docs/interfaces.md`, issue #25).

## Global rules
- Colour is never the only cue: every status also has a text label or icon (for example "Valid", "Bubble", "Changed").
- Every control is reachable by keyboard in a logical order and has a visible focus outline.
- Layout: single column under 700 px, two columns above. Wide content (memory, pipeline registers) scrolls inside its own container; the page never scrolls sideways.
- English and Sesotho appear together wherever the narration panel is used.

## Screen 1: Assembly workspace
~~~
+--------------------------------------------------------------+
| LIMO simulator      [Examples v] [Open .limo] [Assemble]     |
+------------------------------+-------------------------------+
| EDITOR                       | MACHINE CODE                  |
|  1  kopanyah t0, noto, 5     | Addr  Hex        Binary fields|
|  2  kopanyah t1, noto, 0     | 0x00  0x00500513 [imm|rs1|..] |
|  3  loop:                    | 0x04  0x00000593 [imm|rs1|..] |
|  ...                         | (fields coloured AND labelled)|
+------------------------------+-------------------------------+
| STATUS: "Assembled 8 instructions" or                        |
| "Line 4: unknown instruction 'kopanyaa'"                     |
+--------------------------------------------------------------+
~~~
Components: `Toolbar`, `ExamplePicker`, `SourceEditor`, `MachineCodeTable`, `FieldLegend`, `StatusBar`.
Inputs: `assembly = { ok, errors:[{line,message,suggestion}], lines:[{line,source,address,mnemonic,format,rv32i,word,hex,binary,fields}], labels, words }`.
Outputs: `onAssemble(sourceText)`, `onLoadExample(name)`; on success the program is loaded into `state.imem` and the machine is reset.
Keyboard: Tab order is toolbar, editor, table, status; Ctrl+Enter assembles; errors are announced in the status bar (aria-live).
Colour rule: each field in the table has a text label under it (opcode, rd, rs1, rs2, imm), not only a colour.
M2: layout and data contract. M3+: live wiring to the pipeline.

## Screen 2: Pipeline datapath
~~~
 PC: 0x0000   Cycle: 0   [Step] [Run] [Pause] [Reset]
+------+  IF/ID  +------+  ID/EX  +------+  EX/MEM  +------+  MEM/WB  +------+
|  IF  |=[valid]=|  ID  |=[valid]=|  EX  |==[valid]=|  MEM |==[valid]=|  WB  |
|instr |         |regs  |         | ALU  |          | dmem |          | mux  |
+------+         +------+         +------+          +------+          +------+
 Each box shows: stage name, the instruction in it (or "Bubble"), active marker.
~~~
Components: `ControlBar`, `StageBox` (x5), `PipelineRegisterBox` (x4), `WireLabel`.
Inputs: `state` (`pc`, `cycle`, `ifid`, `idex`, `exmem`, `memwb`) and, from M3, a per-cycle `trace` (ALU inputs and result, branch target, memory address and data, write-back value).
Outputs: `onStep()`, `onRun()`, `onPause()`, `onReset()`.
Empty slots: a register with `valid === false` shows the text "Bubble" with a dashed outline, not only a grey fill.
Active stage: the stage holding a valid instruction shows a "▶" marker and bold text.
Keyboard: Step = S, Run/Pause = Space, Reset = R, all also reachable by Tab.
Responsive: stages stack vertically under 700 px.
M2: static layout with a bubble-only state. M3: live values. M4: forwarding and hazard highlights.

## Screen 3: State inspector
~~~
+------------------------+-----------------------------+
| REGISTERS              | DATA MEMORY (word view)     |
| Num  Name    Alias Val | Addr   Hex         Dec      |
| p0   noto    zero  0   | 0x000  0x00000019  25       |
| p1   hae     ra    0   | 0x004  0x00000011  17       |
| ...                    | (changed rows: "*" + bold)  |
| PC   sebali      0x0   |                             |
+------------------------+-----------------------------+
 ARCHITECTURAL state only. Pipeline registers live on Screen 4.
~~~
Components: `RegisterTable` (32 rows, names from the M1 table), `PcRow`, `MemoryTable`, `ChangedMarker`.
Inputs: `state.regs`, `state.pc`, `state.dmem`, and `previous` (the prior state, used only to mark changes).
Outputs: none in M2 (read-only).
Changed values: a "*" and bold text, plus an `aria-label="changed"`; colour may be added but is never the only cue.
Keyboard: tables are scrollable with the arrow keys once focused; memory range jump field is a labelled input.
Responsive: the two tables stack under 700 px.
M2: layout with all-zero values. M3: live values.

## Screen 4: Control and narration
~~~
+-----------------------------+--------------------------+
| CONTROL SIGNALS (per stage) | NARRATION                |
| ID: RegWrite=1 ALUSrc=1 ... | English: "IF fetched ..."|
| EX: ...                     | Sesotho: "..."           |
| (each with 1-line meaning)  |                          |
+-----------------------------+--------------------------+
| PIPELINE REGISTERS (internal state, not architectural)  |
| IF/ID  : Valid  pc=0x00 instr=0x00500513                |
| ID/EX  : Bubble                                         |
+---------------------------------------------------------+
~~~
Components: `ControlSignalPanel`, `SignalRow` (name, value, one-line meaning), `NarrationPanel` (English, Sesotho), `PipelineRegisterTable`, `Tooltip`.
Inputs: `state.ifid/idex/exmem/memwb` (each with `valid` and `ctrl`), and a `narration = { en:[...5 lines], st:[...5 lines] }` produced by the core from M3.
Outputs: none.
Accessibility: signal values show "1"/"0" as text; status words "Valid" and "Bubble" accompany any colour; the narration panel has `aria-live="polite"`; tooltips open on focus as well as on hover.
Internal state is clearly labelled "Internal (microarchitectural)" so it is not confused with Screen 3.
M2: layout with placeholder text. M3: live signals. M4: hazard messages.

## Open points for Thabo and the team
- Does the skeleton already use these component names? If not, rename here or in the code, not both.
- Sesotho narration text is owned by whoever consulted Sesotho sources (M1 references).
