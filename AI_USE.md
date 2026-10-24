Tool: Claude (Anthropic)
Corrected and completed our draft ISA tables and format diagrams proposed khutla, nyane and tlola for (jalr, blt, jal) respectively.

## M2 – Leeto Motloheloa (Pipeline and Implementation Lead)

| Tool | Used for | What Claude suggested | What I did |
|---|---|---|---|
| Claude (Anthropic) | Design help for the pipeline-register data model, block diagram, wireframes and interface contracts (#22–#25); drafting of the unit tests; oral-defence practice questions | Field layout for IF/ID, ID/EX, EX/MEM and MEM/WB; a `valid` flag for bubbles; `wbSel` ('ALU', 'MEM', 'PC4') instead of a boolean MemtoReg; both write-back candidates in MEM/WB; a pure next-state `step`; six tests; a Mermaid diagram; four wireframe screens; a proposed assembler output shape | Ran the tests myself (`node --test`: 6 pass, 0 fail); created the branches and commits under my own account. Field names are provisional until I check them against the frozen ISA v1.1 (Moseme, branch isa-architect/20-m2-frozen-isa). `docs/interfaces.md` is a proposal awaiting agreement from Kabelo and Thabo. |

Declaration: I can explain the pipeline-register model, the clock-cycle semantics and the block diagram.
