# LIMO: The Park — M3 Sprint Note
**CS3520 · Team The Park**

---

## 1. Summary
M3 delivered the execution core. The pipeline now implements all five stages (IF, ID, EX, MEM, WB) with four pipeline registers, decodes and executes all 13 LIMO instructions, writes back registers, accesses word-addressed data memory, redirects in EX with two-instruction flushes, and resets cleanly with p0 hard-wired and p2 = 0x00001000. The assembler now includes a decoder/disassembler and an instruction-memory builder with a test-only reference model. The interface controls (Step, Run/Pause, Reset) are wired to the core state contract on a feature branch but not yet merged. On the branch, `npm test` reports 81 tests, 81 passing; the wider suite is reported at [232/232] once the decoder branch is integrated. Hazard-free programs execute correctly; forwarding and load-use stalls are M4. The `m3` tag must be cut only after the open PRs (#59 control table, decoder branch, interface branch) merge.

---

## 2. Status by Member

| Member | M3 Role | Deliverable | Status |
| :--- | :--- | :--- | :--- |
| **Rorisang Moseme** | Assembler Lead | `src/decode.js`, `src/program.js`, `src/isa.js` aliases, `tests/decode.test.js`, `docs/assembler.md` | Implemented and pushed; connected assembled words/labels to core |
| **Kabelo Khobotle** | Test Lead + Hazard Co-Lead | `tests/helpers/refmodel.js`, property tests, reference model execution checks | Verified hazard-free M3 programs; reproducible test trace provided |
| **Katleho Ramaili** | Scrum and Release Lead | Sprint note | Classroom Submission
| **Thabo Liphoto** | Pipeline + Hazard Co-Lead | Pipeline state contract, interstage registers, stepping & hazard handling setup | Published state shape and stepping contract for UI/tests |
| **Leeto Motloheloa** | Simulator UI Integration (Interface Lead) | Simulator UI: Step/Run/Pause/Reset, live stage view, pipeline & architectural registers, memory view | UI implemented and pushed on branch `interface/m3-pipeline-controls` (commit `3623a52`) |
| **Sello Senekane** | ISA Architect (ISA & Control Alignment) | `docs/isa-control-table.md` (13 instructions: regWrite, aluSrc, aluOp, memRead, memWrite, wbSel, branch, jump, jarl) | Control table in PR #59; reviewed instruction behavior |

---

## 3. Member Reports

### Rorisang Moseme — Assembler Lead
* Rotated from M2 ISA Architect to M3 Assembler lead.
* Connected assembled words and labels to the core; validated input program strings and rejected programs over 1024 words.
* Handed over hazard-free assembly programs and documented unsupported syntax in `docs/assembler.md`.

### Kabelo Khobotle — Test Lead + Hazard Co-Lead
* Rotated from M2 Assembler to M3 Test Lead (sharing Hazard Unit Lead with Thabo for M4).
* Implemented reference model checks (`tests/helpers/refmodel.js`) to verify pipeline execution per spec Section 6.
* Built property test suites (5,000-word test) that identified and resolved decoder edge cases; delivered reproducible test trace for Defence 2.

### Katleho Ramaili — Pipeline and Implementation Lead
* Rotated to M3 Pipeline Lead (swapped role with Leeto).
* Implemented core 5-stage execution logic (IF → ID → EX → MEM → WB) and four interstage registers.
* Built EX-stage redirect, two-instruction flush logic, hard-wired p0 = 0, and reset p2 = 0x00001000; owned core execution handoff (issue #54).

### Thabo Liphoto — Pipeline + Hazard Co-Lead
* Rotated from M2 Interface Lead to M3 Pipeline Co-Lead (sharing Hazard Unit Lead with Kabelo for M4).
* Defined state shape and stepping contract for UI and tests; verified pipeline stage transitions.
* Prepared cycle trace framework for Defence 2 demonstration.

### Leeto Motloheloa — Simulator UI Integration (Interface Lead)
* Rotated to M3 Interface Lead (swapped role with Katleho).
* Wired Step, Run/Pause, and Reset simulator controls to the core state contract.
* Rendered live five pipeline stages, interstage registers, 32 general-purpose registers, and data memory view on feature branch `interface/m3-pipeline-controls`.

### Sello Senekane — ISA Architect (ISA & Control Alignment)
* Rotated from M2 Scrum/Release to M3 ISA Architect.
* Authored `docs/isa-control-table.md` (PR #59) covering all 13 frozen ISA v1.1 instructions and expected control signals.
* Established review checklist for core PRs and prepared defence answers on per-cycle control signal state.

---

## 4. Sprint Board

* **Done**: Core pipeline (13 instructions, five stages, four registers, EX redirect, flushes, reset, traces); decoder/disassembler; instruction-memory builder; reference model; interface controls on feature branch; control table drafted.
* **Not Done / Open**: Forwarding and load-use stalls (M4); reset p2 = 0x1000 in scaffold (issue #54); UI end-to-end verification (issue #55); interface PR not opened; full suite not run on the combined tree; `m3` tag not moved.
* **Next**: Merge #59, decoder branch and interface branch; run full tests and a hazard-free program cycle by cycle; move `m3` tag to final main; Classroom submission.
* **Who**: Pipeline lead Katleho (#54), Interface lead Leeto + verifier (#55), ISA Architect Sello (control reviews), scrum/release lead (tag and submission).
