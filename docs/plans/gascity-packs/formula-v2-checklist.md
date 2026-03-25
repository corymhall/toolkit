# Formula V2 Migration Checklist

This checklist is the exhaustive audit surface for the retained canonical
`gascity/formulas/` set.

Audit bar:
- use `mol-scoped-work` as the reference shape
- every runtime step should have explicit `gc.*` metadata
- multi-step units should have an explicit scope body
- setup/member/teardown roles should be declared explicitly
- fanout/control/finalize behavior should come from real graph.v2 mechanics,
  not only prose

Reference:
- [mol-scoped-work.formula.toml](/Users/chall/github/gascity/cmd/gc/formulas/mol-scoped-work.formula.toml)

## Cross-Cutting Checklist

- [x] Convert every retained canonical formula to `version = 2`.
- [x] Add explicit `gc.*` metadata to every runtime step, not just wrapper latches.
- [x] Add an explicit body scope to every expansion that represents a multi-step unit of work.
- [x] Give every entry step explicit continuation metadata following the `mol-scoped-work` pattern.
- [ ] Mark every cleanup step as `gc.kind = "cleanup"` with `gc.scope_role = "teardown"`.
  Current decision: pre-commit temp-file cleanup remains mainline `member` work when it must happen before commit/push; only true post-body cleanup should use `gc.kind = "cleanup"`.
- [x] Stop relying on wrapper placeholder stages for metadata propagation; put metadata on the actual expansion steps that survive compilation.

## Canonical Files

- [x] [bootstrap-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/bootstrap-expansion.formula.toml): converted to `version = 2` with explicit scope/setup metadata.
- [x] [draft-spec-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/draft-spec-expansion.formula.toml): converted to `version = 2` with explicit scope/setup/member metadata.
- [x] [enrich-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/enrich-expansion.formula.toml): converted to `version = 2` with explicit scope/setup/member metadata and bead-native review fanout.
- [x] [plan-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/plan-expansion.formula.toml): converted to `version = 2` with explicit scope/setup/member metadata and bead-native review fanout.
- [x] [execution-beads-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/execution-beads-expansion.formula.toml): converted to `version = 2` with explicit scope/setup/member metadata.
- [x] [review-lane-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/review-lane-expansion.formula.toml): converted to bead-native reporting and shared reviewer routing.
- [x] [verify-finalize-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/verify-finalize-expansion.formula.toml): converted to `version = 2` with explicit scope/member metadata.
- [x] [delivery-workflow-planned.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-planned.formula.toml): wrapper updated to explicit scoped setup/member semantics around the converted expansions.
- [x] [delivery-workflow-quick.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-quick.formula.toml): wrapper updated to explicit scoped execution plus graph-native review checkpoint.

## Bootstrap Expansion

File:
- [bootstrap-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/bootstrap-expansion.formula.toml)

Current steps:
- `{target}.body`
- `{target}.execute`

Checklist:
- [x] Convert file to `version = 2`.
- [x] Add `{target}.body` as a real scope latch with `gc.kind = "scope"` and `gc.scope_role = "body"`.
- [x] `{target}.execute`: assign explicit scoped metadata.
- [x] Decide whether `{target}.execute` should be `gc.scope_role = "setup"` or `member`.
- [x] Add `gc.scope_ref = "{target}.body"` to `{target}.execute`.
- [x] Add `gc.on_fail = "abort_scope"` to `{target}.execute`.
- [x] Decide whether bootstrap needs a separate teardown step or whether no teardown is appropriate.

## Draft Spec Expansion

File:
- [draft-spec-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/draft-spec-expansion.formula.toml)

Current steps:
- `{target}.kickoff`
- `{target}.body`
- `{target}.explore`
- `{target}.draft`
- `{target}.cleanup-temp`
- `{target}.commit-push`

Checklist:
- [x] Convert file to `version = 2`.
- [x] Add `{target}.body` as a real scope latch.
- [x] `{target}.kickoff`: add explicit continuation metadata.
- [x] `{target}.explore`: make it a scoped `setup` step.
- [x] Add `gc.scope_ref = "{target}.body"` to `{target}.explore`.
- [x] Add `gc.scope_role = "setup"` to `{target}.explore`.
- [x] Add `gc.on_fail = "abort_scope"` to `{target}.explore`.
- [x] `{target}.draft`: make it a scoped `member` step.
- [x] Add `gc.scope_ref = "{target}.body"` to `{target}.draft`.
- [x] Add `gc.scope_role = "member"` to `{target}.draft`.
- [x] Add `gc.on_fail = "abort_scope"` to `{target}.draft`.
- [x] Split `{target}.commit` if needed into cleanup vs commit/push responsibilities.
- [x] If `{target}.commit` remains one step, still annotate it explicitly.
- [x] Decide whether temp-file cleanup should become a dedicated teardown step with `gc.kind = "cleanup"`.

## Enrich Expansion

File:
- [enrich-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/enrich-expansion.formula.toml)

Current steps:
- `{target}.kickoff`
- `{target}.body`
- `{target}.validate-spec`
- `{target}.codebase-exploration`
- `{target}.analyze-survey`
- `{target}.analyze-synthesis`
- `{target}.auto-fix`
- `{target}.human-decisions`
- `{target}.fold-answers`
- `{target}.cleanup-temp`
- `{target}.commit-push`

Checklist:
- [x] Add `{target}.body` as a real scope latch.
- [x] `{target}.kickoff`: add continuation metadata.
- [x] `{target}.validate-spec`: annotate as scoped `setup`.
- [x] Add `gc.scope_ref = "{target}.body"` to `{target}.validate-spec`.
- [x] Add `gc.scope_role = "setup"` to `{target}.validate-spec`.
- [x] Add `gc.on_fail = "abort_scope"` to `{target}.validate-spec`.
- [x] `{target}.codebase-exploration`: annotate as scoped `setup` or `member`.
- [x] `{target}.analyze-survey`: annotate as scoped `member` in addition to its fanout behavior.
- [x] `{target}.analyze-synthesis`: annotate as scoped `member`.
- [x] `{target}.auto-fix`: annotate as scoped `member`.
- [x] `{target}.human-decisions`: annotate as scoped `member`.
- [x] `{target}.fold-answers`: annotate as scoped `member`.
- [x] `{target}.cleanup`: convert to real teardown with `gc.kind = "cleanup"` and `gc.scope_role = "teardown"`.
- [x] Decide whether the review manifest producer should also carry continuation metadata.

## Plan Expansion

File:
- [plan-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/plan-expansion.formula.toml)

Current steps:
- `{target}.kickoff`
- `{target}.body`
- `{target}.validate-spec`
- `{target}.draft-plan`
- `{target}.review-pass-1-survey`
- `{target}.review-pass-1-synthesize`
- `{target}.review-pass-2-survey`
- `{target}.review-pass-2-synthesize`
- `{target}.finalize-plan`

Checklist:
- [x] Add `{target}.body` as a real scope latch.
- [x] `{target}.kickoff`: add continuation metadata.
- [x] `{target}.validate-spec`: annotate as scoped `setup`.
- [x] `{target}.draft-plan`: annotate as scoped `member`.
- [x] `{target}.review-pass-1-survey`: annotate as scoped `member`.
- [x] `{target}.review-pass-1-synthesize`: annotate as scoped `member`.
- [x] `{target}.review-pass-2-survey`: annotate as scoped `member`.
- [x] `{target}.review-pass-2-synthesize`: annotate as scoped `member`.
- [x] `{target}.finalize-plan`: annotate as scoped `member`.
- [x] Decide whether a dedicated teardown/cleanup step is needed for temporary review artifacts.

## Execution Beads Expansion

File:
- [execution-beads-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/execution-beads-expansion.formula.toml)

Current steps:
- `{target}.body`
- `{target}.kickoff`
- `{target}.validate-inputs`
- `{target}.design-graph`
- `{target}.create-beads`

Checklist:
- [x] Convert file to `version = 2`.
- [x] Add `{target}.body` as a real scope latch.
- [x] `{target}.kickoff`: add continuation metadata.
- [x] `{target}.validate-inputs`: annotate as scoped `setup`.
- [x] `{target}.design-graph`: annotate as scoped `member`.
- [x] `{target}.create-beads`: annotate as scoped `member`.
- [ ] Decide whether graph-design output should be emitted as structured `gc.output_json`.
- [x] Decide whether a dedicated teardown step is needed.

## Review Lane Expansion

File:
- [review-lane-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/review-lane-expansion.formula.toml)

Current steps:
- `{target}.review`

Checklist:
- [ ] Decide whether to add `{target}.body` or keep this as a one-step fragment.
- [x] `{target}.review`: add explicit scoped metadata instead of relying only on runtime propagation.
- [x] Decide whether review-lane work should always use `gc.scope_role = "member"`.
- [x] Decide whether review-lane work should always use `gc.on_fail = "abort_scope"`.
- [x] Decide whether a one-step fragment also needs explicit continuation metadata.
- [x] Route review lanes through the shared `reviewer` pool by default.
- [x] Switch review reporting from repo-file output to bead-native notes.

## Verify + Finalize Expansion

File:
- [verify-finalize-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/verify-finalize-expansion.formula.toml)

Current steps:
- `{target}.body`
- `{target}.verify`
- `{target}.finalize`

Checklist:
- [x] Convert file to `version = 2`.
- [x] Decide whether this remains one step or should split into verify vs finalize.
- [x] If it remains one step, annotate `{target}.execute` explicitly as scoped work.
- [x] If it splits, add `{target}.body` as a real scope latch.
- [x] If it splits, determine which step is `setup`, which are `member`, and whether cleanup/teardown is needed.

## Planned Workflow

File:
- [delivery-workflow-planned.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-planned.formula.toml)

Current steps:
- `kickoff`
- `discovery-body`
- `stage-bootstrap`
- `stage-draft-spec`
- `stage-enrich`
- `checkpoint-handoff-ready`
- `planning-body`
- `stage-execution-setup`
- `stage-plan`
- `stage-create-execution-beads`
- `stage-stage-convoy`

Checklist:
- [x] `kickoff`: add explicit continuation metadata.
- [x] `discovery-body`: keep as scope body and verify any missing continuation metadata needs.
- [x] `stage-bootstrap`: treat as expansion anchor only; real metadata must live in bootstrap expansion.
- [x] `stage-draft-spec`: treat as expansion anchor only; real metadata must live in draft-spec expansion.
- [x] `stage-enrich`: treat as expansion anchor only; real metadata must live in enrich expansion.
- [x] `checkpoint-handoff-ready`: annotate as scoped `member` inside `discovery-body`.
- [x] Add `gc.scope_ref = "discovery-body"` to `checkpoint-handoff-ready`.
- [x] Add `gc.scope_role = "member"` to `checkpoint-handoff-ready`.
- [x] Add `gc.on_fail = "abort_scope"` to `checkpoint-handoff-ready`.
- [x] `planning-body`: keep as scope body.
- [x] `stage-execution-setup`: annotate as scoped work or move into an expansion with scoped steps.
- [x] `stage-plan`: treat as expansion anchor only; real metadata must live in plan expansion.
- [x] `stage-create-execution-beads`: treat as expansion anchor only; real metadata must live in execution-beads expansion.
- [x] `stage-stage-convoy`: annotate as scoped `member` inside `planning-body`.
- [x] Add `gc.scope_ref = "planning-body"` to `stage-stage-convoy`.
- [x] Add `gc.scope_role = "member"` to `stage-stage-convoy`.
- [x] Add `gc.on_fail = "abort_scope"` to `stage-stage-convoy`.

## Quick Workflow

File:
- [delivery-workflow-quick.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/delivery-workflow-quick.formula.toml)

Current steps:
- `kickoff`
- `stage-bootstrap`
- `stage-draft-spec`
- `stage-enrich`
- `stage-tracking-setup`
- `stage-implement`
- `stage-review-survey`
- `stage-review-synthesis`
- `stage-verify-finalize`
- `quick-body`

Checklist:
- [x] Add a real `body` scope to this workflow.
- [x] `kickoff`: add explicit continuation metadata.
- [x] `stage-bootstrap`: treat as expansion anchor only; real metadata must live in bootstrap expansion.
- [x] `stage-draft-spec`: treat as expansion anchor only; real metadata must live in draft-spec expansion.
- [x] `stage-enrich`: treat as expansion anchor only; real metadata must live in enrich expansion.
- [x] `stage-tracking-setup`: annotate as scoped `setup` or `member`.
- [x] `stage-implement`: annotate as scoped `member`.
- [x] Replace the old prose-only implementation review with a graph-native review/fanout/synthesis checkpoint.
- [x] `stage-verify-finalize`: treat as expansion anchor only if verify-finalize becomes fully v2; otherwise annotate directly.
- [x] Decide whether `complete` should be removed in favor of body/finalize mechanics.

## Workflow-Native Execute Workflow

This section tracks the proposed redesign where graph.v2 owns execution
directly instead of relying on external convoy child beads as the runnable
graph.

Reference:
- [workflow-native-execution-proposal.md](/Users/chall/gt/toolkit/crew/quick/docs/plans/gascity-packs/workflow-native-execution-proposal.md)

Checklist:
- [x] Decide the canonical name for the new execution workflow (`execute-delivery`, `delivery-execute`, etc.).
- [x] Define the attachment model: which source bead the execution workflow is slung onto.
- [ ] Decide whether the execution workflow is the new canonical path for both `quick` and `planned`.
- [x] Define the durable execution-state surface (`execution-state.json`, bead metadata, or hybrid).
- [x] Define the workflow-native unit of execution (`execution-wave-item-expansion` or similar).
- [ ] Define how `plans.md` maps to waves / execution units.
- [ ] Define how required review checkpoints are modeled structurally in the graph.
- [ ] Decide whether convoys remain as reporting mirrors or are removed from canonical execution.
- [ ] Decide whether external execution beads remain only as compatibility mirrors during migration.
- [x] Prototype the workflow-native execution path on a small sample `plans.md`.

## Wrapper-Step Insight

- [x] Wrapper stage steps like `stage-draft-spec` and `stage-plan` are not enough by themselves.
- [x] Because `compose.expand` replaces those anchors, the real v2 migration has to happen inside the expansion templates that survive compilation.
- [x] That is why the current planned workflow originally felt incomplete even though it had top-level latches.

## Recommended Walkthrough Order

1. Bootstrap expansion
2. Draft-spec expansion
3. Enrich expansion
4. Plan expansion
5. Execution-beads expansion
6. Verify-finalize expansion
7. Planned workflow wrapper
8. Quick workflow wrapper
9. Review-lane fragment
