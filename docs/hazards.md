 LIMO-ThePark: Hazard and Forwarding Design

 1. Purpose

This document describes how the five-stage pipeline handles data hazards and control hazards. It defines forwarding rules, stall conditions, and pipeline flushing behaviour to guide implementation and testing.

 2. Five-Stage Pipeline

The processor uses five stages:

1. IF – Instruction Fetch
2. ID – Instruction Decode
3. EX – Execute
4. MEM – Memory Access
5. WB – Write Back

A hazard occurs when an instruction depends on a result that is not yet available or when program execution changes direction.

 3. Data Hazards and Forwarding

 D1: Immediate ALU Dependency

Example:
- kopanya t0, t1, t2
- tlosa t3, t0, t4

The second instruction requires the result of the first instruction.

Expected behaviour: Forward the result from EX/MEM to the EX stage. No stall should be required.

 D2: Later ALU Dependency

Example:
- kopanya t0, t1, t2
- kopanya t5, t6, t7
- tlosa t3, t0, t4

Expected behaviour: Forward the result from MEM/WB to the EX stage if the register file does not yet contain the updated value. No stall should be required.

 D3: Load-Use Dependency

Example:
- tshela t0, 0(t1)
- kopanya t2, t0, t3

The load instruction obtains data from memory, which may not be available soon enough for the next instruction.

Expected behaviour: Insert one stall for an immediate load-use dependency, then forward the loaded value when available. Confirm this behaviour against the actual simulator implementation.

 D4: Store-Data Dependency

Example:
- kopanya t0, t1, t2
- boloka t0, 0(t3)

The store instruction must write the latest value of 't0' to memory.

Expected behaviour: Forward the updated value to the store-data path when required. Add a stall only if the implementation cannot resolve the dependency through forwarding.

 D5: Link-Register Dependency

The 'tlola' and 'khutla' instructions may write a return address, normally PC + 4, to a destination register.

Expected behaviour: Ensure dependent instructions receive the correct link value through forwarding or the required stall mechanism.

 4. Forwarding Priority

When multiple pipeline stages contain a matching destination register:

1. Prefer the newest available result from EX/MEM.
2. Otherwise, use the result from MEM/WB.
3. Otherwise, use the register-file value.

The zero register, 'p0', must always read as zero and must never receive a forwarded non-zero value.

 5. Control Hazards

 Conditional Branches

The instructions 'lekana', 'haelekane', and 'nyane' perform conditional branches.

If a branch is taken and resolved in EX, the processor redirects the PC and flushes the younger instructions that were fetched along the wrong path. If it is not taken, no branch flush is required.

Confirm the exact flush count using the implementation and sample-program tests.

 Jump Instructions

The 'tlola' instruction changes the control flow and may write PC + 4 to a destination register.

The 'khutla' instruction also changes control flow. Its resolution stage and flush behaviour must be confirmed with the team rather than assumed.

 Halt Behaviour

If the project uses a self-branch to halt execution, verify that the simulator stops or remains in the expected state without repeatedly counting unintended flushes.

 6. Testing Requirements

The test suite should cover:

- Immediate ALU forwarding
- MEM/WB forwarding
- Load-use stalls
- Zero-register protection
- Store-data forwarding
- Taken-branch flushing
- Not-taken branches
- Link-register forwarding
- Jump-register behaviour
- Full sample programs and their expected final states

 7. Open Questions

- Is 'khutla' resolved in ID or EX?
- What is the exact flush-counting convention?
- Are stalls counted per cycle or per affected instruction?
- Does the current test framework already contain hazard tests?

These questions will be resolved against the actual source code, project specification, and test results.
