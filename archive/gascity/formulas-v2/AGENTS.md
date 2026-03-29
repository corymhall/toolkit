# Agent Instructions For `gascity/formulas-v2/`

This directory holds the parked graph.v2 / workflow-control formula line that
we are **not** currently using in `malaz`.

## Why These Formulas Are Parked

The local `v13.4` Gas City runtime includes graph.v2 workflow control support,
but the end-to-end execution path is not reliable for our current rig-scoped
delivery workflows.

Observed failure mode:

- a graph.v2 workflow such as `delivery-workflow-quick` is slung to a rig agent
- normal user-facing work beads are routed correctly
- control beads such as `scope-check`, `fanout`, and `workflow-finalize` are
  created and labeled for `pool:workflow-control`
- those control beads do not auto-advance, so the next user-facing step never
  unlocks unless someone closes the control bead manually

Working hypothesis:

- the built-in `workflow-control` lane is city-scoped and assumes graph.v2
  control beads live in the city bead store
- our slung rig workflows produced control beads in the rig bead store instead
- therefore the deterministic control lane never saw them

Relevant runtime source in `~/github/gascity`:

- `internal/config/config.go`
  - `WorkflowControlAgentName`
  - `WorkflowControlPoolLabel`
- `cmd/gc/cmd_sling.go`
  - graph workflow decoration / routing
- `internal/workflow/runtime.go`
  - deterministic control-bead processing

Relevant upstream history:

- feature commit:
  - https://github.com/gastownhall/gascity/commit/85783a92
- revert commit:
  - https://github.com/gastownhall/gascity/commit/6450f886

That revert is the strongest signal that this line is not ready as the default
workflow path.

## Current Policy

- Do not point `malaz` at this directory.
- Do not move formulas back into `gascity/formulas/` unless the underlying
  workflow-control/store mismatch is fixed and validated.
- If you experiment here, treat it as a quarantine branch of the formula set,
  not the canonical one.

## Active Counterpart

The currently active, legacy-compatible formula set lives in:

- `gascity/formulas/`

Those formulas were restored from the older Gastown molecule-based workflow
line because they do not depend on the parked graph.v2 control-bead path.
