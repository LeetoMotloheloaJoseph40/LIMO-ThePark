# AI use declaration

Per the LIMO handout: for each use, record the tool, the purpose, and what we changed.
Code we cannot explain at a defence is not ours. Add a row every time.

| Date | Member | Tool | Purpose | What we changed / checked |
|---|---|---|---|---|
| (M1) | L. Motloheloa | Claude (Anthropic) | Corrected and completed draft ISA tables and format diagrams; proposed `khutla`, `nyane`, `tlola` for jalr, blt, jal | The team reviewed and incorporated the accepted ISA table and mnemonic proposals. |
| 2026-10-24 | T. Liphoto | ChatGPT (OpenAI) | Reviewed the M2 interface assignment and existing project files; helped plan and resolve the interface shell changes. | Added the editor and state/narration panel layout, retained the current Pages deployment from `src/`, and checked the generated page destination against the deployment workflow. |
| 2026-10-24 | L. Motloheloa | Claude (Anthropic) | Design help for the pipeline register model, block diagram, wireframes and interface contracts; drafted unit tests; oral defence practice | Ran the tests myself with node --test, made the branches and commits under my own account, and aligned my interface docs with the real assembler output. |
| 2026-10-25 | R. Moseme | Claude (Anthropic) | ISA Architect work for M2: helped draft and check the v1.1 frozen spec, example programs and architect notes; explained how to resolve the PR #28 merge conflicts in Git; drafted the README roles table, my work report and the M2 sprint note | I ran every Git command myself from my own account, kept the frozen versions of compare_2_int.limo and count_even.limo when resolving the conflicts, and checked the sprint note and report against the repo. |
| 2026-11-01 | R. Moseme | Claude (Anthropic) | Assembler lead work for M3: wrote `src/decode.js` (decode, disassemble), `src/program.js`, `tests/decode.test.js` and the test-only `tests/helpers/refmodel.js`; found and fixed the missing `n7`/`n8` aliases in `src/isa.js`; updated `build.js` and `docs/assembler.md` | Claude ran the full suite (232 passing) and checked that two deliberately broken versions of the decoder make the tests fail. R. Moseme: [WRITE HERE, before the PR, what you read and re-derived yourself, e.g. which instructions you decoded by hand] |
