# M2 ISA architect notes

Working notes for the ISA architect role. They are for study and handover and are not a graded deliverable. The graded artefact is `ISA-spec-v1.1-frozen.md`.

## 1 What still needs a human

1. **D1 feedback.** None had arrived when this was written. If the examiner commented on the ISA, add each comment and its resolution to §10 of the spec; the freeze is only "D1 feedback applied" once that is done.
2. **Decisions F4 and F10 are mine, not the team's.** F4 turns `p3`–`p4` into temporaries `n7`–`n8`; F10 keeps branch resolution in EX. Tell the team (stand-up or the PR description) and revert if they object. Neither changes an encoding.
3. **Sesotho words.** I invented none. `n7`/`n8` reuse "Nakoana". Check with your Sesotho consultants that "Nakoana" and "Bolokuoe" read well as register-group names.
4. **Placeholders in the M1 PDF.** The header still showed `[short SHA]`, `[A, B or C]`, `https://[n/a].github.io/limo-[The Park]/`, and the sprint note had `[]` and "[none, or list]" and "Nne found". M1 is submitted, but M2 must be clean, and the handout wants the GitHub Pages site live for M2.
5. **Which repository.** M1 names `LeetoMotloheloaJoseph40/LIMO-ThePark` as the team repo (protected `main`, coordinator as collaborator). You gave me `Moseme/LIMO-ThePark`. If yours is a fork, the pull request has to go to the team repo (§6 below).
6. **Ripes cross-check (B8-iii).** Ripes normally keeps program text at address 0 and data elsewhere, so a literal `sw x11, 0(x0)` (what `boloka t1, 0(noto)` becomes) may overwrite program text. Check this in Ripes. In your RV32I translations, load a data base register with `lui` and use offsets from it, then list those extra setup instructions when you compare cycle counts. Translate registers by number, not alias (spec §2).

## 2 Architect checklist for M2

- [ ] `docs/ISA-spec-v1.1-frozen.md` and `docs/M2-architect-notes.md` committed; `examples/*.limo` committed
- [ ] Branch named `<role>/<issue-no>-<topic>`, pull request reviewed and approved by a different member
- [ ] Assembler lead has read spec §5 and §6 and the five example files (they are free test inputs)
- [ ] Pipeline and hazard-unit leads have read spec §7 and the control table below
- [ ] `AI_USE.md` updated (§5 below)
- [ ] Your part appears in the sprint note: issue number, PR number, review you did
- [ ] Tag `m2` on the commit that Classroom links to; PDF and sprint note uploaded by Sun 25 Oct 23:59

## 3 Control signals by instruction (starting point for the pipeline lead)

Generated in ID (handout B4). `MemtoReg`: 0 = ALU result, 1 = memory data, 2 = PC+4 (link). `X` = don't care.

| Instruction | RegWrite | ALUSrc | ALU control | MemRead | MemWrite | MemtoReg | Branch | Jump |
|---|---|---|---|---|---|---|---|---|
| `kopanya` | 1 | 0 | add | 0 | 0 | 0 | 0 | 0 |
| `tlosa` | 1 | 0 | subtract | 0 | 0 | 0 | 0 | 0 |
| `le` | 1 | 0 | and | 0 | 0 | 0 | 0 | 0 |
| `kapa` | 1 | 0 | or | 0 | 0 | 0 | 0 | 0 |
| `kopanyah` | 1 | 1 | add | 0 | 0 | 0 | 0 | 0 |
| `chetse` | 1 | 1 | shift left | 0 | 0 | 0 | 0 | 0 |
| `tshela` | 1 | 1 | add | 1 | 0 | 1 | 0 | 0 |
| `boloka` | 0 | 1 | add | 0 | 1 | X | 0 | 0 |
| `lekana` / `haelekane` / `nyane` | 0 | 0 | compare (=, ≠, <) | 0 | 0 | X | 1 | 0 |
| `tlola` | 1 | X | n/a (separate PC+offset adder) | 0 | 0 | 2 | 0 | 1 |
| `khutla` | 1 | 1 | add (computes the target) | 0 | 0 | 2 | 0 | 1 |

PCSrc = Jump OR (Branch AND condition true), decided in EX. A bubble is all zeros.

## 4 Defence preparation

The handout says the examiner picks who answers and asks things like "encode this instruction", "which control signals are 1 in this cycle, and why" and "what happens without this forwarding path". Try each question yourself before reading the answer.

**1. Encode `tlosa p3, p1, p2`.** R-type, opcode `0110011`, rd = 3 = `00011`, funct3 `000`, rs1 = 1 = `00001`, rs2 = 2 = `00010`, funct7 `0100000`. The only difference from `kopanya` is bit 30. Result `0x402081B3`.

**2. Decode `0x00C54863`.** Low 7 bits `1100011` → B-type. funct3 `100` → `nyane`. rs1 = bits 19–15 = `01010` = p10 = `t0`; rs2 = bits 24–20 = `01100` = p12 = `t2`. Offset bits: imm[4:1] = `1000`, the rest 0, so +16. This is the `nyane t0, t2, done` of CountFirstN.

**3. Which signals are 1 for `boloka`?** `ALUSrc` (the immediate is the address offset) and `MemWrite`. ALU control is add. `RegWrite` is 0, so nothing is written in WB.

**4. Why does `tshela` followed by a user stall once, even with full forwarding?** The loaded value exists only at the end of MEM. The next instruction needs it at the start of its EX, which is the same cycle as the load's MEM. Forwarding moves values forward in time, never back, so one bubble is unavoidable. Draw the diagram in spec §3(d) of M1.

**5. Why does a taken branch flush exactly 2 instructions?** It resolves at the end of EX. By then the two younger instructions are in IF and ID. They are turned into bubbles. Cost in CountFirstN: 6 taken transfers × 2 = 12 of 41 cycles.

**6. What happens without EX/MEM→EX forwarding?** Back-to-back dependences wait for write-back: two stalls each. In CountFirstN only `kopanyah t2, noto, 1` followed by `nyane t0, t2, done` is back-to-back, so Forwarding OFF should give about 43 cycles instead of 41. This is hand-derived; check it with the simulator's OFF switch once it exists.

**7. Why must forwarding ignore `p0`?** `tlola noto, loop` computes a link value for `p0` and the write is discarded. If the forwarding unit only compared register numbers, the next instruction reading `noto` would receive that link value instead of 0.

**8. Why are B and J immediates scrambled?** So `rs1`, `rs2`, `funct3` and the sign bit (bit 31) sit in the same places in every format. The decoder reuses its wires and sign-extends from bit 31 always. The price is that immediate bits are spread out.

**9. What breaks first as programs grow?** The immediate range. With no `lui`, `kopanyah` reaches only −2048…2047, so 9999 takes `kopanyah t0, noto, 39`, `chetse t0, t0, 8`, `kopanyah t0, t0, 15` (39 × 256 + 15). Register count is second, branch reach last.

**10. Why 32 registers when the samples need about 10?** To keep the RV32I field positions so a LIMO binary runs on Ripes. A 16-register file would free 3 bits per R-type instruction, unused. `count_even` would fit in 16 and spill in 8.

**11. Why is the halt a branch to itself, and why cycles = N + 4 + stalls + flushed?** LIMO has no `ecall`. The branch-to-self is the same bits as RV32I `beq x0, x0, 0` (`0x00000063`). The 4 is the pipeline fill: the first instruction needs 5 cycles, then one instruction completes per cycle.

## 5 AI_USE.md entry (edit before committing)

The handout requires tool, purpose and what you changed. Fill the last column honestly after you have done it.

```
| Claude (Anthropic) | Reviewed the submitted M1 ISA for errors; drafted the v1.1 frozen spec, two extra example programs and the architect notes | I re-derived the hex for <list the instructions you re-encoded by hand>; I checked every change in §10 against the M1 PDF; I rewrote <what you rewrote> in my own words; I can explain every entry at the defence |
```

Suggested minimum before you submit: re-encode `tlosa`, `tlola` (backward) and `khutla` by hand, and trace `habeli_call.limo` through the pipeline on paper.

## 6 Git steps

The repo already has `docs/` and `examples/`. The old `examples/CountFirstN.limo`, `compare_2_int.limo` and `count_even.limo` are early drafts (they use `x0` and `kopanya` with an immediate, which are not in the submitted ISA), so the v1.1 files replace them under the same names.

```bash
cd LIMO-ThePark
git checkout main && git pull origin main
git checkout -b isa-architect/<issue-no>-m2-frozen-isa
unzip -o ~/Downloads/limo-m2-isa.zip        # run inside the repo folder; overwrites the three old examples
git status                                   # expect: 2 new docs, 2 new examples, 3 modified examples
# edit AI_USE.md: add the entry from section 5 (the file is plain text, one tool per block)
git add docs examples AI_USE.md
git commit -m "ISA v1.1 frozen spec, example programs and architect notes (M2)"
git push -u origin isa-architect/<issue-no>-m2-frozen-isa
```

Then open a pull request into `main` and ask a teammate to review it. If your repo is a fork of the team repo, open the pull request against the team repo instead.
