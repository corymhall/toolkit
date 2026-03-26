# Parked Graph.v2 Formulas

This directory holds the parked graph.v2 / workflow-control formula line that
was previously the canonical `gascity/formulas/` set.

It is **not** the active formula directory for `malaz`.

## Why These Formulas Are Parked

In real city runs, graph.v2 workflows produced the expected work graph but the
deterministic `workflow-control` lane did not reliably advance rig-scoped
control beads such as:

- `scope-check`
- `fanout`
- `workflow-finalize`

The practical symptom was that normal user-facing steps closed successfully,
but the next stage stayed blocked until someone manually closed the control
bead.

See:

- [AGENTS.md](/Users/chall/gt/toolkit/crew/quick/gascity/formulas-v2/AGENTS.md)

## Upstream Context

These formulas correspond to the graph.v2 / workflow-control line associated
with:

- feature commit:
  - https://github.com/gastownhall/gascity/commit/85783a92
- revert commit:
  - https://github.com/gastownhall/gascity/commit/6450f886

That revert is why this directory is treated as a quarantine area rather than
the default path.

## Active Counterpart

The currently active, legacy-compatible formula set is:

- [gascity/formulas](/Users/chall/gt/toolkit/crew/quick/gascity/formulas)

Those formulas are the older molecule-driven workflow family restored from
`gastown/beads/formulas/`.
