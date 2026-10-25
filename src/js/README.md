# src/js

Plain ES modules so the same code runs in the browser and under `npm test` (Node).

Suggested split (one owner per file, see the Projects board):

- `isa.js`        – opcode / funct / register tables (single source of truth, from docs/ISA_specification)
- `assembler.js`  – text -> machine code + error list (line numbers, plain language)
- `control.js`    – control-signal decoder
- `hazard.js`     – forwarding + load-use + branch-flush logic
- `pipeline.js`   – stages, pipeline registers, step()
- `ui/`           – editor, datapath view, control view, charts

Keep DOM code out of the first five files so they can be unit-tested.
