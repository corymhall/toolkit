# Gas City Packs Milestone Plan

## Planning Intent

This plan is optimizing for early policy-shape validation so we do not build the
wrong pack boundary or accidentally reintroduce unsafe work-repo automation.

- Primary optimization: reduce rework by validating pack boundaries and policy
  enforcement before deeper workflow wiring
- Planning assumptions: this is the follow-on implementation plan for the
  validated v1 design, the work lands locally in this repo, and the `gascity`
  repo is reference material rather than the implementation target

## Milestones

Default target: 3-7 milestones.

### M1. Pack Shape and Storage Contract Validation

Goal:
- Prove the v1 `base` / `work` / `personal` split fits the existing shareable
  pack model and can be wired into a sample city without ambiguity, while also
  validating the first supported storage/routing topology up front.

Planned changes:
- Define the new pack layout and ownership boundaries using the existing pack
  model from `~/github/gascity/docs/guides/shareable-packs.md` as reference
- Add or sketch local pack roots in this repo, using current pack surfaces such
  as `~/github/gascity/examples/gastown/packs/gastown/pack.toml` only as
  reference material
- Add the shared policy/config substrate needed for pack includes, rig
  suspension, pool limits, and overrideable direct-push posture
- Add a minimal sample city config showing one `personal` rig and one `work`
  rig with different includes/overrides on that real policy surface
- Validate one supported redirected/shared-store topology plus contributor /
  maintainer routing behavior for that topology
- Confirm local-ignore/runtime-artifact hygiene for `.beads/` and `.gc/`
- Add minimum automated pack/config resolution coverage for the supported
  topology and trust split

Acceptance criteria:
- The pack family has a concrete filesystem layout and clear ownership of
  prompts, formulas, scripts, and policy-free shared assets
- A sample city config can express the intended split without needing prompt
  prose to encode trust policy
- Work-pack and personal-pack differences are explicit enough to review before
  workflow logic is implemented
- Redirected bead-store compatibility and contributor override behavior are
  proven for one supported local topology before later workflow work builds on
  them

Validation commands / proof:
- Expected artifacts: local pack tree in this repo, sample city fixture,
  supported-topology notes, and contributor/maintainer routing notes
- Expected walkthrough: trace one `personal` and one `work` rig through the
  local pack/config layout and the supported topology
- Expected assertion: runtime artifacts remain untracked under the supported
  local ignore/exclude strategy

Review stop:
- yes

Human stop:
- Before leaving M1, pause for human review of the contributor/maintainer
  routing model and do not proceed until it is fully understood.

### M2. Base Pack Owner Session and Controller Policy

Goal:
- Deliver the `base` pack surfaces for the long-lived owner session and the
  initial controller/order policy that both trust classes depend on.

Planned changes:
- Add `base` pack prompts, formulas, and shared assets for the large-work owner
  session model
- Extend the shared policy/config substrate with the minimum
  controller/daemon/order posture needed for v1, keeping risky work-rig
  mutation orders manual or disabled by default
- Make the intended non-role of deacon/refinery explicit for this v1 pack family

Acceptance criteria:
- The `base` pack clearly owns the long-lived owner-session path for larger work
- Default order/controller behavior is explicit and safe for work rigs
- The plan proves that helper-role omissions in v1 are intentional, not missing
  design work

Validation commands / proof:
- Expected artifacts: local `base` pack prompt/formula inventory, controller
  posture notes, and sample owner-session configuration in this repo
- Expected walkthrough: inspect the owner-session path and the disabled/manual
  order posture for work rigs in detail
- Expected assertion: the selected prompts, formulas, and shared assets are
  intentional and understandable before implementation continues

Review stop:
- yes

Human stop:
- Before leaving M2, pause for human review of prompt, formula, and shared asset
  choices so the intended local pack surfaces are fully understood.

### M3. Work Pack Safe Branch Flow and Worker Lifecycle

Goal:
- Implement the default `work`-rig worker flow so it prepares or resumes a
  feature branch, records durable bead metadata, drains cleanly, and stops
  before any merge-to-main action.

Planned changes:
- Fork only the reusable worktree/branch/resume semantics patterned after
  `examples/gastown/packs/gastown/formulas/mol-polecat-work.formula.toml`
- Add work-pack prompts/scripts/formulas for worktree setup, branch reuse,
  resumable review follow-up, and explicit worker cleanup
- Wire config/formula defaults so work rigs cannot route into direct-to-main,
  refinery-style submit behavior, or PR-handler assumptions
- Run the worker flow on the supported redirected/shared-store topology rather
  than on a simpler local-only setup
- Add minimum automated safety coverage for branch-only flow, lifecycle cleanup,
  resumability, and forbidden submit paths before later milestones proceed

Acceptance criteria:
- Work-pack workers create or reuse worktree/branch state idempotently
- Required metadata includes `work_dir`, `branch`, `target`, `push_remote`,
  `base_branch`, and follow-up state needed for later continuation
- The default work-pack flow can push a feature branch when policy allows, but
  cannot push or merge to `main`
- Completed workers drain/reclaim cleanly and are no longer left in active
  routing by accident
- Review follow-up reuses the same pool template on recorded branch/worktree
  state rather than depending on a surviving worker session

Validation commands / proof:
- Expected artifacts: local work-pack flow contract, bead metadata contract,
  cleanup/resume walkthrough, and supported-topology branch-only flow notes
- Expected assertion: adversarial attempts to push or merge to `main` on a
  `work` rig fail at config/formula wiring rather than prompt text alone

Review stop:
- yes

Human stop:
- Before leaving M3, pause for human review of practical limitations, edge
  cases, and real-world workflow behavior so the branch-only worker model is
  fully understood.

### M4. Personal Pack Variants on the Shared Policy Surface

Goal:
- Add the `personal`-rig variants on top of the already-validated shared
  policy/config substrate instead of rebuilding trust logic inside prompts.

Planned changes:
- Add personal-pack variants for more autonomous local behavior where allowed
- Add city/rig examples that show `personal` behavior as a config choice on the
  shared substrate already validated in M1/M2
- Ensure the same reusable `base` assets can be shared while policy stays in
  city and rig config

Acceptance criteria:
- A city can opt a rig into `personal` behavior without changing the shared
  `base` pack
- A work rig remains conservative by config even if prompts try to steer toward
  unsafe submit behavior
- The policy surface for `personal` versus `work` is reviewable from config and
  examples alone

Validation commands / proof:
- Expected artifacts: local personal/work config diff, example pack overlays,
  and explicit notes on which behaviors remain work-only versus personal-only
- Expected walkthrough: compare `personal` and `work` behavior on the same local
  shared substrate and confirm the boundary is easy to explain

Review stop:
- yes

### M5. Supported Shared-Store and Routing Hardening

Goal:
- Lock in the first supported redirected/shared-store topology and
  contributor/maintainer routing behavior without expanding into a broad
  cross-repo topology project.

Planned changes:
- Harden the already-adopted workflow/config handling for one supported
  redirected/shared bead-store pattern instead of a private per-clone store
- Add routing-safe examples or tests covering that topology and contributor
  posture
- Document the supported v1 topology and explicitly defer broader storage
  patterns

Acceptance criteria:
- The pack/workflow design is explicitly compatible with one supported
  redirected/shared bead-store topology
- Contributor/maintainer routing is correct and overrideable for work-repo use
  in that topology
- Broader cross-repo topology work remains explicitly deferred

Validation commands / proof:
- Expected artifacts: supported-topology hardening notes, contributor-override
  scenarios, and explicit deferred edge cases
- Expected walkthrough: trace the supported topology and contributor posture in
  detail and confirm the limitations are documented rather than hidden

Review stop:
- yes

### M6. Minimum Docs, Examples, and Safety Coverage

Goal:
- Add the minimum docs/examples/coverage needed to preserve the validated safety
  invariants and make the pack family usable without pulling broad release work
  forward.

Planned changes:
- Add or update usage docs for pack creation/consumption, work-rig safety, and
  worker resumability
- Add acceptance coverage for sample city composition and work-rig safety
  invariants
- Add example assets that demonstrate the intended personal/work split and the
  supported storage topology

Acceptance criteria:
- The repo contains a clear usage path from pack definitions to sample city
  configuration
- Acceptance coverage exercises the critical safety boundaries from the spec
- Remaining risks and deferred follow-ons are documented rather than left
  implicit

Validation commands / proof:
- Expected artifact: documented sample configuration that matches the supported
  topology and passes the earlier safety tests unchanged
- Expected walkthrough: confirm the docs/examples in this repo still match the
  agreed local implementation model and do not quietly drift back toward a
  `gascity`-repo build plan

Review stop:
- optional

## Drift Risks

- R-1: The current pack/config model may expose an unexpected limitation that
  forces a different boundary between reusable pack capability and per-rig
  policy.
- R-2: Redirected bead storage or contributor routing may reveal edge cases even
  within the first supported topology and force narrower implementation scope.
- R-3: Reusing `mol-polecat-work` patterns may pull in refinery-era assumptions
  that need a deeper fork than expected.

## Stop Conditions

- S-1: If the proposed `base` / `work` / `personal` split cannot be expressed
  cleanly through existing pack/include mechanisms, revise `plans.md` before
  continuing.
- S-2: If work-pack safety still depends on prompt discipline rather than
  config/formula wiring, stop and re-plan before building more automation.
- S-3: If worker lifecycle cleanup or resumability cannot be proven with durable
  metadata and drain/reclaim semantics, revise `plans.md` before continuing.
- S-4: If shared-store or routing validation shows that the first supported
  topology is unsafe or too operator-fragile, revise the milestone sequence
  before proceeding.
- S-5: If a milestone can only be signed off by manual interpretation rather
  than executable tests plus named fixture/artifact checks, stop and strengthen
  validation before continuing.
- S-6: If a work-rig milestone lacks an adversarial negative test for forbidden
  push/merge behavior, stop before moving to the next milestone.
