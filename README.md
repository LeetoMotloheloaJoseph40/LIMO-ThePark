# LIMO – The Park

A Sesotho-mnemonic, RV32I-derived instruction set (**LIMO**) and a browser-based
five-stage pipeline simulator. CS3520 Computer Organisation and Architecture,
National University of Lesotho, AY 2026/2027.

**Live simulator:** <https://leetomotloheloajoseph40.github.io/LIMO-ThePark/> *(live once GitHub Pages is enabled)*
**Demo video:** (add unlisted YouTube link for M5)

## Team and roles

Roles rotate weekly. Current week: **M?**

| Member | GitHub | Role this week |
|---|---|---|
| L. Motloheloa | @LeetoMotloheloaJoseph40 | Team Leader, Pipeline and Implementation Lead |
| T. Liphoto | @thaboliphoto | Interface Lead |
| R. Moseme | @Moseme | ISA Architect |
| K. Ramaili | @amira2K5 | Design and Test Lead |
| K. Khobotle | @KhobotleHelen | Assembler Lead |
| S. Senekane | @Charity6-dev | Scrum and Release Lead |

## Repository layout

| Path | Contents |
|---|---|
| `src/` | The simulator (static site, published from here) |
| `tests/` | Unit tests and LIMO test programs |
| `examples/` | Sample `.limo` programs |
| `docs/` | ISA specification, design, test report, team charter, sprint notes |
| `AI_USE.md` | AI usage declaration |

## Run locally

```bash
npm test                      # unit tests (Node 20+)
npx serve src                 # / open src/index.html in a browser
```

## How we work

Feature branch -> pull request -> review by another member -> merge. `main` is protected.
Each milestone is a tagged release (`m1`–`m4`, `v1.0`). See `docs/team-charter.md`.

## Licence

MIT, see `LICENSE`.
