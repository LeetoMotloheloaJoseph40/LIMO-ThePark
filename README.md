# LIMO-ThePark — Test Harness Deliverable (Scaffold)

## Purpose
This dependency-free scaffold checks that the agreed example programs exist and records the expected outcomes the team should verify against the simulator.

**Important limitation:** The project files inspected did not include a simulator/interpreter implementation or a documented command for executing `.limo` files. This scaffold does not claim to execute programs or prove pipeline behaviour. It validates the manifest and program-file presence only.

## Layout
- `run_tests.sh` — one-command entry point.
- `tests/harness/run_harness.py` — standard-library Python runner.
- `tests/harness/test_manifest.json` — programs and expected outcomes.
- `tests/hazards/README.md` — hazard cases to implement when the simulator API is known.
- `tests/programs/README.md` — sample-program verification checklist.

## Run
From the repository root:

```bash
chmod +x run_tests.sh
./run_tests.sh
```

The harness checks manifest structure and required example files. It reports that simulator execution is not configured until the team confirms a real simulator command and output format.

Do not set `LIMO_RUNNER` to a guessed command.

## Next integration work
Once the simulator/interpreter and documented CLI are available, update `tests/harness/run_harness.py` to execute programs and parse real output. Then assert registers, memory, stalls, flushes, and cycles against confirmed expected values.

## Open design questions
- Is `khutla` resolved in ID or EX?
- What exact rule counts flushed instructions/cycles?
- How are registers, memory, stalls, flushes and cycles reported by the simulator?
