# AI use declaration

Per the LIMO handout: for each use, record the tool, the purpose, and what we changed.
Code we cannot explain at a defence is not ours. Add a row every time.

| Date | Member | Tool | Purpose | What we changed / checked |
|---|---|---|---|---|
| (M1) | L. Motloheloa | Claude (Anthropic) | Corrected and completed draft ISA tables and format diagrams; proposed `khutla`, `nyane`, `tlola` for jalr, blt, jal | The team reviewed and incorporated the accepted ISA table and mnemonic proposals. |
| 2026-10-24 | T. Liphoto | ChatGPT (OpenAI) | Reviewed the M2 interface assignment and existing project files; helped plan and resolve the interface shell changes. | Added the editor and state/narration panel layout, retained the current Pages deployment from `src/`, and checked the generated page destination against the deployment workflow. |

cat >> AI_USE.md << 'EOF'

## M2: ISA freeze (ISA architect: Moseme), 24-25 Oct 2026

| Tool | Used for | What I checked or changed |
|---|---|---|
| Claude (Anthropic) | Audit of our M1 ISA specification against the project handout. It flagged a missing opcode/funct table, a halt-label typo in sample program 2, an arithmetic slip in A6-f, and invalid `x0` register names in the repo examples. | I compared each finding with the M1 PDF and the repo files, and confirmed each defect myself before accepting the fix. |
| Claude (Anthropic) | First draft of ISA Specification v1.0 (`docs/ISA_specification.md`), `src/isa.json`, `tests/golden_vectors.json`, the reference script `tests/make_golden.py`, and corrected example programs. | I hand-encoded [N] instructions and matched them to the file, ran `python3 tests/make_golden.py`, and confirmed the M1 cycle counts (41, 18, 17, 166). I edited the text so I can explain each table entry and every design decision. |
| Claude (Anthropic) | Guidance on our GitHub workflow (branching, PR, tags). | I ran the commands myself; the m1 tag points to the real deadline commit and was created late on 24 Oct. |

**Decisions made by the team, not the tool:** keeping the 32-register file and resolving branches in EX with predict-not-taken.The AI supplied the comparison figures, which we re-checked.

**Not AI-generated:** the original M1 ISA design, the Sesotho mnemonics and the three sample programs. These are our own work; the tool only audited them.
