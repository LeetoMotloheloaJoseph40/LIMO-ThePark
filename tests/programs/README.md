# Sample Program Tests

The manifest records reference outcomes from the M2 planning notes for:
- `examples/CountFirstN.limo`
- `examples/compare_2_int.limo`
- `examples/count_even.limo`

The current harness verifies that these files exist and that the manifest is structurally valid. It does not execute `.limo` files. Once the simulator command and output format are documented, add assertions for registers, memory, instruction count, stalls, flushes and cycles.

Confirm expected values against the frozen specification and current simulator before reporting them as verified.
