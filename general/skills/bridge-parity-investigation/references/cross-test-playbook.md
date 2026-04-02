# Cross-Test Playbook

Use this reference to keep bridge parity work focused.

## Entry Gate

Only use this skill when:

- Pulumi behavior is established
- Terraform behavior is established
- the difference matters for routing or root-cause work

If any of those are missing, go back to repro staging first.

## Preserve

- the lifecycle transition that triggers the mismatch
- the smallest schema and state/dataflow needed to keep the mismatch alive
- the exact user-visible divergence

## Investigate Narrowly

Useful questions:

- Which lifecycle stage is the first point of divergence?
- Is the problem in request construction, state translation, or output
  projection?
- Does the synthetic test preserve the same raw-state or readback shape that
  matters in the real issue?

## Practical Moves

- Add minimal instrumentation around the failing boundary.
- Recover panics into assertable failures when needed.
- Prefer one precise cross-test over a large synthetic harness.

## Avoid

- falling back to non-cross-test harnesses once parity is established
- copying the real provider implementation wholesale
- claiming the final root cause before the test actually isolates it
