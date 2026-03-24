# Branch Target Workflow Sketch

This note is a concrete replacement sketch for the old "integration branch"
bootstrap flow. It supports `tool-35r` and `tool-7tx`.

## Core Change

Replace:

- "every larger workflow has a first-class integration branch"

With:

- "every piece of work targets a branch"
- "workers create feature branches from that target branch"
- "review, fixup, and landing are explicit workflow steps"

The important primitive is `target` / `base_branch`, not "integration branch".

## What Gas City Already Gives Us

Gas City already has the mechanics needed for a branch-target workflow:

- `gc sling` auto-populates `issue=<bead-id>` for attached work formulas
- if the target formula uses `base_branch`, Gas City auto-populates it
- the auto-populated `base_branch` comes from:
  1. `metadata.target` on the bead
  2. otherwise `metadata.target` on an ancestor convoy
  3. otherwise the rig repo's default branch
- `gc convoy target <convoy-id> <branch>` sets convoy-level target metadata

That means the platform already supports:

- normal work that targets `main`
- release work that targets `release/x`
- grouped work where many child beads should all inherit the same target branch

without needing a separate branch-lifecycle command family.

## Old Flow

The old Gastown-shaped flow assumed:

1. create or resolve feature epic
2. create integration branch with `gt mq integration`
3. switch the whole session to that integration branch
4. write planning artifacts there
5. eventually route toward integration landing / refinery semantics

This overloaded one concept:

- branch intent
- planning container
- implementation staging area
- merge policy

## New Flow

The replacement flow separates those concerns.

### A. Planning / coordination container

Use:

- convoy or existing tracked bead graph

This container answers:

- what work belongs together?
- who owns the batch?
- what is the target branch for this batch, if any?

### B. Branch intent

Use:

- `metadata.target` on the work bead or ancestor convoy

This answers:

- what branch should workers branch from and compare against?

Examples:

- no explicit target metadata: work defaults to repo default branch
- convoy target `main`: all child work aims at `main`
- convoy target `release/1.4`: all child work aims at `release/1.4`

### C. Worker execution

Use:

- branch-ready worker formula such as
  [mol-work-branch-ready.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/packs/work/formulas/mol-work-branch-ready.formula.toml)

This answers:

- how does implementation happen safely?

Worker behavior:

1. receive bead via `gc sling`
2. inherit `base_branch`
3. create or reuse bead-scoped worktree
4. create or reuse feature branch from `base_branch`
5. implement and verify
6. push feature branch
7. record durable metadata
8. stop at branch-ready handoff

### D. Review / fixup / landing

Use:

- explicit downstream workflow beads

This answers:

- how does work move after branch-ready handoff?

This is intentionally not hidden inside a special integration branch concept.

## Recommended Replacement For Old Bootstrap

### Old bootstrap

1. resolve or create epic
2. create integration branch
3. switch to integration branch
4. persist session context

### New bootstrap

1. resolve or create work container
   - convoy if this is truly a grouped initiative
   - otherwise existing bead / root task / root epic is enough
2. decide target branch
   - if omitted, inherit repo default branch
   - if non-default, record it explicitly
3. persist session context
   - record the root bead/convoy ID
   - record the chosen target branch value
   - stop talking about integration branches

For grouped work, the setup step becomes:

```text
Create or resolve convoy
Optionally set/update convoy target branch
Record target branch in session context
```

For single-feature planning work, the setup step becomes:

```text
Create or resolve root bead
Record target branch in session context
Default to repo default branch unless explicitly overridden
```

## When Convoy Target Matters

Convoy target metadata is useful when:

- many child work beads should all target the same non-default branch
- the target branch should be inherited automatically by workers
- we want one durable place to store branch intent for grouped work

It is not required when:

- work targets the repo default branch
- there is only one work bead and the owner can pass `base_branch` directly
- the workflow is still planning-only and no worker dispatch is happening yet

So convoy target is a useful tool, not the new center of the world.

## What Planning Artifacts Should Record

`session-context.md` and related workflow docs should record:

- root tracking bead or convoy ID
- target branch
- whether the target came from:
  - explicit override
  - convoy metadata
  - repo default branch

They should stop recording:

- "integration branch name"

Suggested wording:

```text
target_branch: main
target_branch_source: repo-default
```

or

```text
target_branch: release/1.4
target_branch_source: convoy-target
```

## Formula Rewrite Guidance

### `bootstrap-expansion`

Replace:

- "Bootstrap Epic + Integration Branch"
- `gt mq integration create/status`
- "switch to integration branch"

With:

- "Resolve root work container + target branch"
- optional convoy creation / target-branch setup
- session-context recording of `target_branch`

### `delivery-workflow-epic`

Replace:

- "Stage 1: Bootstrap Epic + Integration Branch"

With:

- "Stage 1: Resolve Work Container + Target Branch"

The stage should answer:

- what is the root tracked container?
- what branch does this initiative target?
- is that target explicit or inherited?

### `beadify-expansion`

Remove branch-safety wording that implicitly assumes an integration branch is
already active. The safer statement is:

- do not write planning artifacts on the repo default branch unless this
  workflow explicitly allows it

### Review-launch and monitoring formulas

These should compare feature branches against `base_branch` / `target_branch`,
not against an integration branch concept.

## Recommended Default Policy

1. Default target branch = repo default branch
2. Use convoy target only for grouped work that truly needs shared non-default
   branch intent
3. Workers always branch from `base_branch`
4. Workers stop at branch-ready handoff on work rigs
5. Review / PR / fixup / landing remain explicit later steps

## Why This Is Better

- it matches the current local Gas City work-pack direction
- it uses real existing Gas City primitives
- it avoids inventing a fake `gc mq integration` compatibility layer
- it keeps branch intent explicit without coupling it to merge mechanics
- it lets us support both default-branch and release-branch workflows with the
  same model

## Open Design Questions

- Do we want "root epic" to stay a planning concept, or should grouped work
  standardize on convoys earlier?
- Should planning workflows create convoys automatically, or only when execution
  starts?
- For single-feature workflows, do we want to record `target_branch` in session
  context even when it is just the repo default branch? My current answer is
  yes, because it makes branch intent explicit and reviewable.
