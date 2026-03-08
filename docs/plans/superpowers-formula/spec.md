# Superpowers Formula

## Overview

Adapt the most useful review-loop ideas from `obra/superpowers` to a
Codex-native Gastown workflow.

This spec should be read alongside the standing evaluation guidance in
`gastown/docs/codex-evaluation-lens.md`. That lens defines how external
agent systems should be adapted for Gastown rather than copied directly.

The key insight from this investigation is that Codex behaves differently from
the Claude Code environment that shaped much of superpowers. Codex can carry a
much longer thread, does better when one session owns the whole build, and does
not benefit as much from hyper-detailed task plans or mandatory fresh subagents
for each tiny step. Because of that, the best adaptation is not a wholesale
superpowers clone.

Instead, this design keeps `single-session-tracking-workflow` as the primary
execution path, then adds an explicit, first-class implementation review stage
near the end of that workflow. The review stage should run through a new narrow
review formula that can be slung to different runtimes using `gt sling
--agent`, such as Codex and Claude, with the parent session synthesizing the
results and deciding whether to finalize or loop back into fixes.

This spec intentionally carries one important adaptation from the discussion:
testing discipline should be evidence-driven rather than copied directly from
superpowers' hardest universal TDD rules.

## Design

### Positioning

This work should extend the current single-session approach rather than replace
it with a brand new top-level “superpowers workflow.” The execution model
should remain:

- one main Codex session owns the implementation
- milestones provide lightweight structure
- external reviewers are used as sidecars, not as the default implementers

The main change is to make heavyweight review an explicit part of the workflow
instead of a manual habit run after the formula completes.

### Why This Differs From Superpowers

Superpowers makes strong use of:

- very explicit implementation plans
- tiny task granularity
- fresh subagent per task
- ordered reviews after each task

Those choices make sense for an environment with a smaller context window and a
higher chance that the main session will compact or restart before holding the
entire build cleanly in memory.

For Codex, those same patterns can become overhead. The Codex-native
adaptation is:

- keep one strong owner session
- externalize only durable artifacts and audit points
- run heavyweight review at meaningful workflow boundaries, not after each
  micro-task

### Primary Workflow Shape

The primary execution workflow should continue to be
`single-session-tracking-workflow`, with an updated final section that makes
review explicit.

At a high level, the sequence becomes:

1. Bootstrap context, epic, and integration branch.
2. Draft and enrich the spec.
3. Set up lightweight milestone tracking.
4. Implement in the main session.
5. Run explicit multi-agent implementation review.
6. Synthesize findings and decide whether to finalize or return to fixes.
7. Verify, summarize, and close out.

This preserves the Codex-friendly “one owner thread” model while still
bringing in one of the most valuable superpowers behaviors: ordered, explicit
review before claiming completion.

### New Review Worker Formula

Add a new narrow formula under `gastown/beads/formulas/` for autonomous
implementation review. A working name is:

- `mol-review-implementation.formula.toml`

This formula should represent one reviewer run, not the entire multi-model
review experience.

Its responsibilities should be limited to:

- load review scope
- inspect spec and implementation artifacts
- evaluate selected review categories
- apply an optional domain review profile
- write a structured report to a known output path

It should not:

- ask the human what to review
- choose models interactively
- create follow-up issues by default
- implement fixes
- run the full current `review-implementation` interaction model

That boundary keeps it deterministic, slingable, and easy to call from other
workflows.

### Review Worker Inputs

The review worker formula should accept a small set of explicit variables:

- `feature`
- `reviewer_label`
- `spec_scope`
- `impl_scope`
- `categories`
- `review_profile`
- `output_path`

Optional future variables, if needed:

- `base_ref`
- `head_ref`

The parent workflow should choose these values. The review worker should not
infer them through interactive prompting.

For the initial version, `categories` should default to `all`. Domain-specific
expertise should be modeled through `review_profile`, not by multiplying review
categories.

### Domain Profiles

The workflow should support a lightweight domain-profile concept that can be
used both before implementation and during review.

Examples include:

- `general`
- `go-development`
- `neovim-plugin-development`

The domain profile is a lens, not a replacement for the core review contract.
The categories still define what is being evaluated. The profile influences how
the reviewer thinks about those categories in a specific ecosystem.

In practice:

- `categories` answers: what dimensions are reviewed?
- `review_profile` answers: what domain heuristics and standards shape that
  review?

This means a Go reviewer still evaluates completeness, quality, scope, and
standards, but does so with Go-specific expectations in mind.

Domain profiles are expected to help most strongly with:

- quality
- standards

They are also useful, though usually less strongly, for:

- completeness
- scope

### Pre-Implementation Domain Selection

Near the start of implementation, the parent workflow should be able to select
zero or more relevant domain profiles based on the spec, repository, or files
being changed.

This selection should stay lightweight. The workflow should not blindly load a
large stack of skills. It should identify the small number of domain profiles
that materially improve implementation and review.

Examples:

- Go-heavy work selects `go-development`
- Neovim plugin work selects `neovim-plugin-development`

The selected profiles should be recorded in session context or ledger artifacts
so that implementation guidance and later review share the same domain lens.

Profile selection should follow a conservative hybrid model:

1. explicit selection wins
2. high-confidence heuristics may suggest a domain profile
3. otherwise the workflow defaults to `general`

The initial version should avoid opaque scoring or over-clever inference. The
workflow should only auto-select a specialist profile when the signal is strong
enough to be obvious and debuggable.

### Review Worker Output Contract

Each review run should write a single structured markdown report to a shared,
non-repo artifact location under the rig root `.runtime` directory, for
example:

- `<rig-root>/.runtime/reviews/<feature>/<run-id>/codex-review.md`
- `<rig-root>/.runtime/reviews/<feature>/<run-id>/claude-review.md`

The report should use a stable structure so the parent workflow can synthesize
results without guesswork:

- scope summary
- verdict
- blocking findings
- important findings
- minor findings
- completion matrix
- scope drift notes
- verification notes

This structure is closer in spirit to the built-in plan/PRD review formulas
than to the current interactive skill. The main value is machine- and
human-readable audit output.

The report should not be treated as feature work to commit on the review
worker's branch. It is a transient shared artifact for synthesis, not a code
change to land.

### Agent-Specific Slinging

The workflow should use the new `gt sling --agent` capability rather than
baking model selection into the formula itself.

The intended pattern is:

- sling one review run with `--agent codex`
- sling one review run with `--agent claude`

Both should target the same review formula, with different `reviewer_label`
and output paths.

That keeps runtime selection outside the formula definition and makes it easy
to add or remove reviewer models later without changing the formula contract.

The default final-review shape should use `categories=all`.

In addition to the two general reviewers, the workflow may optionally add one
specialist review run when a selected domain profile clearly matters to the
work. For example:

- general Codex review
- general Claude review
- optional Go-specialist review using `review_profile=go-development`

Specialist reviewers should be additive, not replacements for the general
reviewers. The workflow should not duplicate every general review with a
profiled version by default. The intended model is two general reviewers plus
at most one extra specialist lens when the domain fit is strong.

### Review Visibility Constraint

Fresh slung review workers do not automatically share the parent session's
dirty workspace state. In practice, this means a polecat review worker cannot
reliably audit:

- uncommitted code changes
- untracked plan/spec artifacts
- local-only verification notes that have not been materialized into shared
  state

Because of that, the explicit sling-based final review stage must only run once
the review inputs are visible to the review worker. In practice, that means the
workflow should ensure the reviewable state has been materialized first, for
example through committed artifacts and code on a pushed integration branch the
sidecars can read.

This makes the final review stage different from lightweight in-session
subagent checks. In-session subagents can reason over the current conversation
and local workspace. Fresh slung review workers cannot assume that visibility.

### Review Checkpoint Commit

Before the final sling-based review stage begins, the parent session should
create a reviewable checkpoint:

1. commit the current reviewable implementation state
2. push the integration branch
3. write any shared review inputs needed for sidecars into the rig root
   `.runtime/reviews/...` directory
4. then sling the external review workers

This review checkpoint is not the final completion point. It is a materialized
state for external review. The parent session may still make follow-up fixes
after synthesizing the review output.

### Parent-Side Synthesis

Synthesis should remain in the parent `single-session-tracking-workflow`
session, not inside the review worker formula.

The parent workflow should:

1. wait for both review outputs
2. compare Codex and Claude findings
3. deduplicate overlapping issues
4. classify blocking vs non-blocking concerns
5. decide whether to:
   - finalize
   - loop back into implementation for fixes
   - present ambiguous disagreements to the human

This is the right place for synthesis because the parent session owns the
overall delivery decision and already has the full execution context.

### Milestone-Boundary Review

The workflow should add a lighter milestone-boundary review model before the
final heavyweight multi-agent review stage.

This milestone review should have three levels:

1. a default parent-session self-check at the end of every milestone
2. an optional single-subagent drift review when the milestone appears risky
3. the final dual-agent review near completion

The parent-session self-check should be lightweight and structured. At minimum
it should capture:

- what changed in the milestone
- which spec section, decision, or milestone goal it satisfied
- what remains risky, unclear, or potentially drifting
- what verification has been run so far
- whether the next milestone still makes sense

This is not intended to be a full review. It is a cheap alignment checkpoint
that helps the main session notice drift without breaking flow.

When the milestone crosses a risk threshold, the workflow should escalate to a
single review subagent for separation and bias reduction. This review is meant
to answer “are we drifting?” rather than to act as the final completion gate.

Examples of escalation signals include:

- architectural changes
- spec ambiguity
- unexpectedly broad or surprising diffs
- implementation pivots
- repeated uncertainty or rework
- the parent session explicitly suspecting drift

The default policy should be adaptive:

- always perform the parent-session self-check
- only run the single-subagent milestone review when risk signals are present

This preserves Codex-native flow while still introducing a cleaner separation
when the main session may be too attached to its own implementation path.

### Testing and TDD Contract

The workflow should adopt an evidence-based TDD policy rather than either a
hard universal red/green/refactor mandate or a vague “test later” norm.

The default expectation should be:

- behavior changes and bug fixes use real red/green evidence
- the milestone records how correctness will be proven before implementation is
  considered complete
- the final review can inspect whether the claimed proof model was actually
  followed

For normal feature and bug work, the preferred shape is:

1. identify or write the test that should fail first
2. run it and observe the red state
3. implement the minimal change
4. rerun the relevant test or checks and observe green
5. record the evidence in milestone review notes or the session ledger

However, the workflow should not pretend that every kind of work fits classic
TDD equally well. For infrastructure, configuration, wiring, exploratory
changes, or other awkward cases, the workflow should allow an explicit
alternative proof model instead of fake TDD theater.

Acceptable alternative proof models may include:

- before/after reproduction commands
- integration checks
- snapshot or diff evidence
- targeted smoke tests
- build/lint/typecheck plus explicit runtime validation
- contract or fixture-based verification

The key rule is that the proof model must be declared explicitly before the
milestone is considered complete. “I will test later” is not sufficient.

This keeps the discipline that made superpowers valuable while adapting it to
Codex’s preferred execution style and to classes of work where strict
test-first sequencing is not the best literal fit.

### Integration Into Single-Session Tracking

The final stage of `single-session-tracking-workflow` should be expanded so
that review is explicit rather than manual.

The intended behavior is:

- implementation reaches a reviewable committed/materialized checkpoint
- the formula launches the review worker twice, once per runtime
- the parent session waits for both runs
- the parent session synthesizes the reports
- if blocking issues exist, the workflow returns to implementation/fix work
- if no blocking issues exist, the workflow proceeds to final verification and
  summary

This keeps review heavyweight and meaningful without turning the workflow into
task-by-task review churn.

### Relationship To Existing Review Assets

This design should reuse ideas from existing built-in formulas:

- `mol-plan-review.formula.toml`
- `mol-prd-review.formula.toml`
- `code-review.formula.toml`

The most useful pattern from those formulas is:

- narrow input contract
- parallel review execution
- structured report output
- explicit synthesis

The new review worker formula should not try to replace those formulas. It
should adapt the same pattern for the specific problem of implementation-vs-spec
review inside a single-session delivery flow.

The current `review-implementation` skill should remain useful for interactive,
human-driven review sessions. The formula should extract only its autonomous
core, not port the full interactive surface.

## Scope

In:
- Extend `single-session-tracking-workflow` with an explicit implementation
  review stage.
- Design a new autonomous review worker formula for one reviewer run.
- Use `gt sling --agent` to run that review worker across multiple runtimes.
- Synthesize reviewer outputs in the parent workflow.
- Preserve the “main session owns implementation” model.
- Add milestone-boundary review with parent self-checks and adaptive
  single-subagent escalation.
- Define an evidence-based TDD/proof policy for milestone and final review.
- Add optional domain profiles for implementation guidance and specialist
  review lenses while keeping core review categories fixed.
- Require the final sling-based review stage to operate on materialized review
  inputs rather than dirty local-only state.
- Use shared `.runtime` review artifacts rather than repo-relative committed
  review outputs from sidecar workers.

Out:
- Replacing `single-session-tracking-workflow` with a new top-level workflow.
- Porting superpowers’ full subagent-per-task execution model.
- Porting the full interactive `review-implementation` skill into formula form.

## Non-Negotiables

- [N-1] The design must stay selective and Codex-native rather than cloning the
  full superpowers operating model.
- [N-2] The main session must remain the default owner of implementation work.
- [N-3] Heavy implementation review must become an explicit workflow stage,
  not a manual post-work convention.
- [N-4] The review formula must be narrow, non-interactive, and suitable for
  repeated slinging with different `--agent` runtimes.
- [N-5] Multi-model synthesis must happen in the parent workflow session.
- [N-6] Every milestone must include a lightweight parent-session self-check.
- [N-7] Risky milestones must be able to escalate to a single review subagent
  before the final dual-agent review stage.
- [N-8] Every milestone must declare a proof model for correctness before it
  is considered complete.
- [N-9] Behavior changes and bug fixes should default to real red/green
  evidence unless an explicit alternative proof model is justified.
- [N-10] Final implementation review should default to `categories=all`.
- [N-11] Domain-specific expertise should be expressed through optional
  `review_profile` selection rather than by creating domain-specific review
  categories.
- [N-12] Sling-based final review must only run against state that is visible
  to fresh review workers.
- [N-13] Final sling-based review artifacts must be written to a shared,
  non-repo location under rig-root `.runtime`.
- [N-14] The parent session must materialize a pushed review checkpoint before
  launching sling-based final review.

## Forbidden Approaches

- [F-1] Replacing the single-session workflow with mandatory subagent-per-task
  execution — this would optimize for Claude-era constraints rather than
  Codex’s strengths.
- [F-2] Requiring giant, ultra-explicit task plans as the central execution
  artifact — that adds overhead without matching the preferred Codex workflow.
- [F-3] Translating the full interactive `review-implementation` skill directly
  into a formula — the review worker should be autonomous and deterministic.
- [F-4] Putting model-selection logic inside the review formula — runtime choice
  should stay at sling time via `--agent`.
- [F-5] Running heavyweight external review after every tiny task by default —
  review should happen at meaningful boundaries, not micro-task cadence.
- [F-6] Forcing a subagent review on every milestone by default — separation is
  valuable when risk is present, but constant escalation would reintroduce too
  much ceremony.
- [F-7] Allowing milestones to complete without an explicit proof model for
  correctness.
- [F-8] Treating vague post-hoc verification promises as a substitute for TDD
  or declared proof.
- [F-9] Forcing fake red/green theater for work where a better explicit proof
  model exists.
- [F-10] Replacing general reviewers with specialist reviewers entirely — domain
  specialists should extend, not replace, the baseline general review.
- [F-11] Encoding domain expertise by endlessly expanding the category list
  instead of using a separate profile concept.
- [F-12] Assuming fresh slung review workers can audit uncommitted or untracked
  parent-session state.
- [F-13] Having review workers commit shared review reports onto their own
  feature branches as if those artifacts were deliverable code changes.

## Decision Log

| Decision ID | Topic | Chosen Option | Rejected Alternatives | Rationale | Status |
|-------------|-------|---------------|------------------------|-----------|--------|
| D-1 | Execution model | Keep `single-session-tracking-workflow` as the primary delivery path | Create a new top-level superpowers-style master workflow | The current single-session approach better matches Codex’s long-running context strengths | Resolved |
| D-2 | Review architecture | Add a narrow single-review worker formula and sling it once per runtime | Convert the whole `review-implementation` skill into a formula; make review remain manual | A narrow worker is easier to automate, compose, and reason about inside formulas | Resolved |
| D-3 | Runtime selection | Use `gt sling --agent` outside the formula | Encode model/runtime branching inside the formula | Runtime choice is operational context, not part of the formula’s logic | Resolved |
| D-4 | Review ownership | Parent workflow synthesizes multiple reviewer reports | Each review worker tries to synthesize across models; a convoy formula owns all synthesis | The parent session already owns overall delivery context and final decision-making | Resolved |
| D-5 | Review timing | Make heavyweight review explicit near completion | Review after every micro-task by default | Milestone or end-stage review better fits Codex’s main-session ownership model | Resolved |
| D-6 | Milestone review model | Adaptive milestone review: parent self-check always, single-subagent review only when risk signals appear | No milestone review; mandatory subagent review every milestone | This keeps momentum high while still providing separation when drift risk is real | Resolved |
| D-7 | TDD policy | Evidence-based TDD: default to real red/green for normal behavior changes, allow explicit alternative proof models when classic TDD is a poor fit | Hard universal TDD mandate; soft guidance only | This preserves discipline without forcing fake ceremony or collapsing back to vague “test later” behavior | Resolved |
| D-8 | Review categories vs domain expertise | Keep review categories fixed and model domain expertise through `review_profile` | Add domain-specific categories such as `golang` or `neovim` | Categories describe what to evaluate; profiles describe the domain lens used while evaluating it | Resolved |
| D-9 | Specialist review participation | General reviewers always run; specialist reviewers are optional add-ons when domain fit is strong | Specialist-only review; mandatory specialist review for every workflow | This keeps the baseline review simple while still allowing domain depth where it materially helps | Resolved |
| D-10 | Domain-profile selection | Hybrid selection: explicit override first, obvious heuristics second, otherwise `general` | Pure manual selection; aggressive automatic detection | This keeps the system predictable and easy to override without forcing users to specify a profile every time | Resolved |
| D-11 | Visibility model for sling-based review | Final sling-based review must run on committed/materialized state visible to fresh workers | Review dirty parent-session state directly from fresh polecats | Real workflow exercise showed fresh slung workers cannot see local-only parent artifacts and uncommitted changes | Resolved |
| D-12 | Review artifact location | Shared rig-root `.runtime/reviews/...` artifacts | Repo-relative report files committed from review worker branches | Review reports are transient synthesis inputs and should not force sidecars to create landed code changes | Resolved |
| D-13 | Final review kickoff | Parent creates a pushed review checkpoint before slinging sidecars | Sling reviewers directly against dirty in-session state | Fresh polecats need a stable, visible branch state to review accurately | Resolved |

## Traceability

| Spec Element | Source | Notes |
|--------------|--------|-------|
| [N-1] selective, Codex-native adaptation | user dialogue + codebase comparison | Derived from the discussion that Claude-era superpowers patterns should be re-evaluated through Codex’s 1M-context and long-running-session behavior |
| [N-2] main session owns implementation | user dialogue | User explicitly described better results when Codex keeps ownership of the whole build in one session |
| [N-3] explicit heavy review stage | user dialogue | User described the current manual end-of-run review pattern and agreed it should become explicit in the formula |
| [N-4] narrow review worker formula | discussion of Option A + built-in review formulas | Chosen to avoid porting the full interactivity of `review-implementation` into workflow automation |
| [N-5] parent-side synthesis | discussion of multi-agent review flow | The parent session is best positioned to compare model outputs and decide whether to loop back |
| [N-6] milestone self-check | user dialogue | User agreed that every milestone should include a lightweight structured parent-session check |
| [N-7] adaptive milestone escalation | user dialogue | User agreed that brief separation is useful, but only when a milestone becomes risky enough to justify a subagent review |
| [N-8] proof model per milestone | user dialogue | Derived from the agreed rule that correctness evidence must be explicit before a milestone is considered complete |
| [N-9] default red/green for normal behavior changes | user dialogue | User agreed with an evidence-based TDD policy rather than a universal hard gate or vague guidance |
| [N-10] final review defaults to `all` | user dialogue | User explicitly preferred keeping review categories simple and always running all core dimensions |
| [N-11] domain expertise via `review_profile` | user dialogue | User agreed domain-specific review should be modeled as a separate lens rather than as more categories |
| Domain-profile selection model | user dialogue | User agreed on a hybrid model with explicit override, lightweight heuristics, and `general` as the safe default |
| [N-12] materialized review inputs | live workflow exercise | Real slung review workers could not see untracked spec artifacts or dirty parent-session state in fresh polecat clones |
| [N-13] shared `.runtime` review outputs | live workflow exercise + user dialogue | Live run showed repo-relative output caused a sidecar to commit and submit the report; user proposed moving reports to shared gitignored runtime storage |
| [N-14] review checkpoint commit | user dialogue + live workflow exercise | User proposed pushing the integration branch before review so sidecars can inspect a stable visible state |
| Design: review worker inputs and outputs | built-in review formulas + dialogue | Influenced by the structured input/output contracts in built-in review formulas and the desire to use `--agent` externally |
| Design: milestone-boundary review | user dialogue | Derived from the agreed model of self-check first, escalate to one subagent only when drift risk is present |
| Design: evidence-based TDD policy | user dialogue | Derived from the agreed model of default red/green evidence plus explicit alternative proof strategies when classic TDD is awkward |
| Design: domain profiles | user dialogue | Derived from the discussion of proactively loading domain skills and adding specialist reviewers without exploding category count |
| Design: review visibility constraint | live workflow exercise | Derived from actually slinging Codex and Claude review workers against this dirty branch and observing they could not read parent-only artifacts |
| Design: shared runtime review artifacts | live workflow exercise + user dialogue | Derived from the need for review workers to return artifacts without committing them as feature work |
| D-1 through D-13 | trade-off discussion | Reflect the shift from “new superpowers formula” toward “upgrade single-session with explicit review sidecars, adaptive milestone checks, evidence-based proof, optional domain lenses, materialized review inputs, and shared runtime artifacts” |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Reviewer outputs are too free-form to synthesize reliably | Parent workflow may struggle to compare Codex and Claude results | Use a rigid report schema with clear sections and severity buckets |
| Dual-agent review adds latency near completion | Workflow may feel slower or more expensive than manual review | Keep review worker narrow, run both reviews in parallel, and reserve the stage for meaningful completion boundaries |
| Claude and Codex disagree materially | Workflow may stall on ambiguous findings | Have the parent session classify disagreement explicitly and surface only true unresolved conflicts to the human |
| Review stage grows until it recreates the full interactive skill | Formula becomes hard to automate and maintain | Keep the formula boundary narrow and leave interactive triage in the existing skill |
| Milestone review becomes noisy process overhead | The team may ignore checkpoints or resent the workflow | Keep the default self-check brief and escalate to a subagent only when concrete risk signals appear |
| Proof policy becomes too vague in practice | Teams may claim compliance without strong evidence | Require milestones to record the proof model explicitly and let final review inspect whether the proof matched the claim |
| TDD policy becomes performative | People may simulate red/green steps where they are not meaningful | Allow explicit alternative proof models instead of forcing fake universal TDD |
| Domain profiles add too much complexity too early | Workflow setup may become harder than the review value justifies | Keep `general` as the default and make specialist profiles optional only when the domain fit is obvious |
| Final review sidecars cannot see parent-local state | The review stage may hang or produce misleading results | Materialize review inputs before slinging, or use in-session subagents for pre-materialization checks |
| Review sidecars may accidentally land report artifacts | Review workers can create noisy commits/MRs unrelated to feature code | Write review reports to shared `.runtime` storage and treat the work as report-only completion |

## Testing

The design should be validated at two levels.

First, validate the review worker formula in isolation:

- it accepts explicit scope variables
- it writes its report to the requested output path
- its report structure is stable enough for synthesis

Second, validate the end-to-end single-session workflow behavior:

- final review is invoked automatically as an explicit stage
- Codex and Claude review runs can be slung via `--agent`
- both review outputs are collected successfully
- parent-side synthesis can distinguish blocking and non-blocking findings
- blocking findings route the workflow back into implementation/fix work
- clean findings allow normal finalization

Also validate milestone-boundary behavior:

- every milestone records a lightweight self-check
- low-risk milestones do not trigger unnecessary external review
- risky milestones can trigger a single-subagent drift review
- drift findings can influence the next milestone or route back into fixes

Also validate the testing/proof policy:

- normal behavior changes can show red/green evidence
- milestones record an explicit proof model
- awkward classes of work can declare an alternative proof model
- the workflow rejects vague “test later” milestone completion
- final review can inspect whether claimed proof actually occurred

Also validate domain-profile behavior:

- final review defaults to `categories=all`
- specialist reviewers can be added without changing the base category model
- domain profiles can influence both implementation guidance and review outputs
- general review still runs even when a specialist review is added

Also validate review visibility behavior:

- fresh slung review workers can read the committed/materialized spec and code
- the workflow does not attempt sling-based final review against parent-only
  dirty state
- pre-materialization drift checks stay in-session or use local-context
  subagents instead

Also validate shared review artifact behavior:

- sidecar review reports are written under rig-root `.runtime/reviews/...`
- parent synthesis can read those reports directly
- review workers do not need to commit the reports as code changes

The workflow should prefer evidence from generated review artifacts and session
state rather than relying only on the parent session’s prose summary.

## Open Questions

- Should the initial implementation include only `general`, `go-development`,
  and `neovim-plugin-development`, or should additional domain profiles be
  supported immediately?
