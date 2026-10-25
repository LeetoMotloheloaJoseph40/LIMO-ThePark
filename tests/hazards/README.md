# Hazard Tests — Implementation Plan

Executable tests belong in this directory. The simulator API/CLI was not available during scaffold preparation, so tests are not written against an invented interface.

| ID | Case | Expected behaviour to verify |
|---|---|---|
| D1 | Immediate ALU dependency | EX/MEM forwarding; no stall |
| D2 | Later ALU dependency | MEM/WB forwarding when needed; no stall |
| D3 | `tshela` immediately followed by consumer | One load-use stall, then correct value |
| D4 | Latest ALU value used by `boloka` | Store writes correct value |
| D5 | `tlola`/`khutla` link dependency | Correct PC+4 value |
| D6 | Zero register | `p0` remains zero |
| C1 | Taken branch | Correct target and agreed flush count |
| C2 | Not-taken branch | Fall-through; no redirect flush |
| C3 | `khutla` control flow | Confirm resolution stage and flush count |

Assert final state and performance counters when exposed by the simulator. Never mark an unexecuted test as passing.
