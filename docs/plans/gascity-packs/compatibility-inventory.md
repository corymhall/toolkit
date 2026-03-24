# Formula And Skill Compatibility Inventory

This note supports `tool-35r` and `tool-7tx`.

Goal:
- identify where the current local formulas and skills still encode Gastown
  mechanics directly
- separate simple command-surface swaps from deeper workflow assumptions
- compare those assumptions against the current Gas City surface before we
  decide what to rewrite, wrap, or retire

## Confirmed Gas City Surface

From `gc --help` and focused subcommand help:

- `gc sling` exists and routes beads or formula wisps to an agent/pool
- `gc mail` exists for inbox/read/send/reply/archive
- `gc handoff` exists for self-handoff and remote handoff
- `gc hook` exists, but it is a work-query check, not a `hook show` inspector
- `gc session peek` exists for non-attached session monitoring
- `gc session nudge` exists for sending text directly to a running session
- `gc convoy target` exists and sets target-branch metadata on a convoy
- `gc convoy land` exists for owned convoy termination
- `gc workflow` exists, but as graph-first workflow control rather than a
  `gt mq integration`-style branch workflow

Important negative finding:

- there is no visible `gc mq integration` command family in the CLI help
- the current Gas City help surfaces do not advertise an "integration branch"
  primitive as a first-class command

## Existing Local Gas City Direction

The local `work` pack already points away from the old Gastown landing model.

- [mol-work-branch-ready.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/packs/work/formulas/mol-work-branch-ready.formula.toml) explicitly says the worker stops at a branch-ready boundary, pushes only the feature branch, and never pushes or merges the target branch
- [worker-lifecycle.md](/Users/chall/gt/toolkit/crew/quick/gascity/packs/work/worker-lifecycle.md) says the local work-pack flow should not assume refinery-style merge handling or a surviving worker session

That means the current Gas City direction is already incompatible with any
formula that still assumes:

- integration-branch bootstrap via `gt mq integration`
- refinery handoff as the default landing path
- polecat-session monitoring through old GT-only inspection commands

## Inventory By Assumption Type

### 1. Direct `gt sling` entrypoints

Files:

- [README.md](/Users/chall/gt/toolkit/crew/quick/README.md)
- [draft-spec-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/draft-spec-expansion.formula.toml)
- [delivery-workflow.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow.formula.toml)
- [delivery-workflow-quick.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-quick.formula.toml)
- [delivery-workflow-epic.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-epic.formula.toml)
- [delivery-workflow-planned.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-planned.formula.toml)
- [beadify-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/beadify-expansion.formula.toml)
- [plan-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/plan-expansion.formula.toml)
- [enrich-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/enrich-expansion.formula.toml)
- [brainstorming/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gascity/skills/brainstorming/SKILL.md)

Assessment:

- low-risk command-surface mismatch
- most of these references are examples or router outputs
- these can likely move from `gt sling` to `gc sling` once we decide the new
  workflow names and targets

Open question:

- should we preserve the current formula names as compatibility aliases, or
  rename the user-facing workflow vocabulary at the same time?

### 2. Integration branch bootstrap and landing

Files:

- [bootstrap-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/bootstrap-expansion.formula.toml)
- [beadify-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/beadify-expansion.formula.toml)
- [delivery-workflow-epic.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-epic.formula.toml)
- [final-review-launch-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/final-review-launch-expansion.formula.toml)
- [epic-delivery/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gascity/skills/epic-delivery/SKILL.md)
- [epic-delivery/references/setup-dispatch.md](/Users/chall/gt/toolkit/crew/quick/gascity/skills/epic-delivery/references/setup-dispatch.md)
- [epic-delivery/references/validation-reporting.md](/Users/chall/gt/toolkit/crew/quick/gascity/skills/epic-delivery/references/validation-reporting.md)

Observed Gastown assumptions:

- explicit `gt mq integration create`
- explicit `gt mq integration status`
- "switch to the integration branch before writing files"
- explicit "never run `gt mq integration land <epic-id>` here"

Assessment:

- highest-risk incompatibility
- this is not a command rename problem, because Gas City does not expose the
  same integration-branch primitive in the current CLI
- the likely replacement is some combination of:
  - `gc convoy target` for branch-target metadata
  - branch-ready worker formulas
  - owned convoy lifecycle via `gc convoy land`
  - explicit PR/review/fixup beads instead of a hidden integration-branch path

Current recommendation:

- treat `tool-35r` as a workflow-design task, not a search-and-replace task
- define the Gas City abstraction first, then update every formula that still
  speaks in `gt mq integration` terms

### 3. Polecat monitoring and session introspection

Files:

- [monitor-synthesize-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/monitor-synthesize-expansion.formula.toml)
- [final-review-launch-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/final-review-launch-expansion.formula.toml)
- [plan-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/plan-expansion.formula.toml)
- [enrich-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/enrich-expansion.formula.toml)
- [mol-review-implementation.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/mol-review-implementation.formula.toml)
- [sling-work/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gastown/skills/sling-work/SKILL.md)
- [sling-work/references/monitoring.md](/Users/chall/gt/toolkit/crew/quick/gastown/skills/sling-work/references/monitoring.md)
- [sling-work/references/failure-handling.md](/Users/chall/gt/toolkit/crew/quick/gastown/skills/sling-work/references/failure-handling.md)

Observed Gastown assumptions:

- `gt peek <rig>/<polecat>`
- `gt polecat status <rig>/<polecat>`
- `gt hook show <rig>/<polecat>`
- `gt nudge <rig>/<polecat> ...`
- "review worker" language that assumes a polecat target and hook attachment

Assessment:

- medium/high-risk incompatibility
- Gas City has partial equivalents:
  - `gc session peek`
  - `gc session nudge`
  - `gc session list`
  - `gc hook`
- Gas City does not expose the same "show me this worker's current hooked bead"
  inspection surface in the help we checked

Current recommendation:

- rewrite monitoring docs/formulas around session aliases and session state,
  not around GT-specific polecat/hook inspection commands
- only keep explicit pool-worker terminology where the target city/pack really
  still defines those agents

### 4. `gt done` / refinery-centered lifecycle

Files:

- [mol-review-implementation.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/mol-review-implementation.formula.toml)
- [epic-delivery/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gascity/skills/epic-delivery/SKILL.md)
- [workflow-cheatsheet/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gastown/skills/workflow-cheatsheet/SKILL.md)

Observed Gastown assumptions:

- finish review worker lifecycle with `gt done --cleanup-status clean`
- merge/refinery-oriented ownership and queue handling
- polecat-only PR sling wording

Assessment:

- high-risk for any workflow we want to carry into Gas City
- the local work-pack direction already rejects refinery-style submit behavior
- the personal-side landing model is still open under `tool-cqu`

Current recommendation:

- do not port these behaviors mechanically
- split the compatibility work into:
  - branch-ready worker flow for work rigs
  - explicit personal landing/refinery decision for personal rigs
  - possible retirement of skills whose whole value depends on GT submit
    semantics

### 5. GT-only skills that may not belong in the Gas City path

Files:

- [epic-delivery/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gascity/skills/epic-delivery/SKILL.md)
- [workflow-cheatsheet/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gastown/skills/workflow-cheatsheet/SKILL.md)
- [gastown-upstream-sync/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gastown/skills/gastown-upstream-sync/SKILL.md)
- [sling-work/SKILL.md](/Users/chall/gt/toolkit/crew/quick/gastown/skills/sling-work/SKILL.md)

Assessment:

- `epic-delivery` and `workflow-cheatsheet` are intentionally Gastown-shaped
- `sling-work` may still have a future in Gas City, but only after rewriting it
  around `gc sling`, session aliases, and convoy/session primitives
- `gastown-upstream-sync` should remain clearly GT-specific unless we want an
  explicit sibling skill for Gas City

## What Still Looks Applicable In Gas City

These ideas still look structurally useful:

- `gc sling` as the main dispatch entrypoint
- `gc mail` and `gc handoff` for coordination
- session-level monitoring via `gc session peek` and `gc session nudge`
- convoy-backed tracking and branch-target metadata via `gc convoy`
- branch-ready worker lifecycle from the local `work` pack

## What No Longer Looks Safe To Assume

- that every workflow should bootstrap an integration branch
- that `gt mq integration` has a one-command Gas City equivalent
- that "polecat + hook show + gt done + refinery" is the default execution path
- that old GT-only skills can be renamed to `gc` without a design pass

## Recommended Next Slice

For `tool-35r`:

1. define the intended Gas City replacement for "integration branch"
2. decide whether that replacement is:
   - convoy target metadata plus branch-ready workers
   - a compatibility wrapper formula
   - or an explicitly deferred capability
3. update only the formulas that currently hard-code `gt mq integration`

For `tool-7tx`:

1. classify files into:
   - command-surface swaps
   - monitor/lifecycle rewrites
   - GT-only skills to retire or relabel
2. treat `delivery-workflow-planned` as the canonical v2 path
3. update docs/skills that still describe planned delivery as a molecule-only
   flow or point at prototype siblings
4. update README/examples only after the workflow vocabulary is settled

## Validation Update

The canonical planned workflow:

- [delivery-workflow-planned.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-planned.formula.toml)

now compiles successfully under `gc formula show` when
`gascity/formulas` is exposed via the parser's fallback
`.beads/formulas` search path.

Interpretation:

- the canonical planned-delivery formula is now graph.v2
- the prototype sibling files are no longer needed
- remaining migration work should focus on the other workflows/skills, not on
  maintaining a second planned-workflow branch

## Initial Priorities

- first: `bootstrap-expansion`, `beadify-expansion`, `delivery-workflow-epic`
- second: `monitor-synthesize`, `final-review-launch`, `plan-expansion`,
  `enrich-expansion`, `mol-review-implementation`
- third: README/examples and GT-only skills
