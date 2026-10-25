 Test Harness Contract 

No simulator source exists in this repo yet. This document defines the
interface the harness will assume once the simulator is available.

 Invocation
    <simulator> <program.limo> [--max-cycles N]

 Required output (stdout)
Final state, one item per line, in this exact order:
    REG <name> <value>
    MEM <addr> <value>
    CYCLES <n>

 Exit codes
    0  ran to completion
    1  simulator error
    2  exceeded --max-cycles

 Test file format (tests/hazards/, tests/programs/)
Each test is a '.test' file containing:
    program:  path to a .limo file (relative to repo root)
    expect:   REG/MEM/CYCLES lines, same format as simulator output
    status:   pass | xfail | skip
    note:     one-line description of the hazard exercised

 Status today
All tests are 'skip' or 'xfail'. Nothing runs until the simulator
binary and its invocation are confirmed by the team.
