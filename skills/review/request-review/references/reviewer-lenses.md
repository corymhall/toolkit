# Reviewer Lenses

Use this file as the source of truth for selecting review lenses and framing
independent reviewer prompts. Choose the smallest set that answers the user's
question.

## Contents

- [Baseline](#baseline)
- [Additional lenses](#additional-lenses)
- [Lens contracts](#lens-contracts)
- [Lane rules](#lane-rules)
- [Good default combinations](#good-default-combinations)

## Baseline

Always start with `general_reviewer`.

Also use `repo_instructions_reviewer` when the target is a repository change and
an applicable `AGENTS.md` exists. This lens is required for skill, workflow,
generated output, release process, validation, or file-placement changes.

## Additional Lenses

### `spec_alignment_reviewer`

Add when a spec, plan, PRD, task, or acceptance criteria defines the intended
outcome, or when scope drift matters as much as correctness.

### `test_reviewer`

Add when behavior changed, tests or proof are central to the request, the diff
touches tests, or the main uncertainty is whether verification is strong
enough.

### `documentation_reviewer`

Add for public APIs, exported declarations, important internal contracts,
non-obvious helpers, commands, configuration, workflows, generated docs,
examples, or user-visible behavior.

### `go_reviewer`

Add when the target is mostly Go or the uncertainty is Go API design,
dependency ownership, error policy, concurrency lifecycle, modernization, or
Go-specific test quality.

### `error_handling_reviewer`

Add for retries, recovery, fallbacks, logging, incident-prone behavior, or an
explicit resilience and failure-handling review.

### Neovim plugin reviews

There is no dedicated Neovim lane. Start with normal lenses. When the target
touches runtimepath layout, startup or lazy-loading, keymaps, autocmds,
`vim.uv`, health checks, vimdoc, or release behavior, the main session should
load `../../neovim-plugin-development/references/reviewer-deep.md` and
synthesize that domain pass with other findings.

### Optional outside perspective

Add one external-model perspective only when the user asks or independent model
diversity materially improves a risky decision. Do not duplicate the entire
lens stack across runtimes.

## Lens Contracts

Every sidecar prompt must include the shared target and the relevant contract
below. All lenses are read-only and return findings rather than fixes.

### `general_reviewer`

Review like an owner. Find correctness bugs, behavioral regressions, missing or
weak tests, and maintainability risks likely to hurt future work. Lead with the
most important evidence-backed findings, include file references, and avoid
style-only comments. Return blocking findings, important non-blocking findings,
and residual risks or test gaps.

### `repo_instructions_reviewer`

Read applicable `AGENTS.md` files and check concrete workflow, validation, file
placement, tool usage, ownership, generated-output, and versioning requirements.
Cite both the instruction source and affected change or missing action. Do not
invent rules or drift into generic code review. Return instruction violations,
missing required validation or generated updates, and residual compliance risk.

### `spec_alignment_reviewer`

Map the implementation and tests against the named spec, plan, task, or
acceptance criteria. Identify missing or partial requirements, scope drift, and
underspecified decisions. Treat implementation differences as informational
unless they break the intended outcome. Return a requirement-by-requirement
completion assessment and unresolved ambiguities.

### `test_reviewer`

Evaluate proof quality rather than test count. Find important untested behavior,
weak assertions, happy-path-only coverage, missing error and boundary cases, and
false confidence. Distinguish no tests, weak tests, and sufficient tests. Return
missing or misleading tests, uncovered edge cases, and residual verification
risk.

### `documentation_reviewer`

Check whether public and important internal behavior is understandable and safe
to change. Find missing, stale, misleading, or detached docs and comments,
especially around purpose, invariants, edge cases, errors, concurrency,
lifecycle, cleanup, compatibility, and examples. Do not request comments that
merely narrate obvious code. Return missing or misleading contracts and residual
documentation risk.

### `go_reviewer`

Load the `go-development` skill and its
`references/reviewer-deep.md` contract. Run the practical tooling gate first,
then inspect API design, dependency ownership, error boundaries, concurrency
lifecycle, test quality, and modernization judgment. For each finding include
severity, `automated`/`mixed`/`review-only`, source rule, required action, and
verification evidence.

### `error_handling_reviewer`

Review operational failure behavior. Find swallowed errors, dangerous silent
failures, weak observability, unsafe recovery or fallback logic, and mismatches
between documented and actual error behavior. Prioritize paths that can corrupt
state, hide bad outcomes, or make incidents hard to diagnose. Return dangerous
failure modes, observability gaps, recovery issues, and residual operational
risk.

## Lane Rules

- Remain read-only; do not implement fixes.
- Focus on the assigned lens and target.
- Return findings directly, not lane-management narration.
- Include concrete file references and evidence when possible.
- If a lane cannot run, continue with useful lenses and report the missing lens
  as residual risk.
- The main session verifies findings and owns synthesis.

## Good Default Combinations

### Current diff

- `general_reviewer`
- `repo_instructions_reviewer` when applicable

### Spec alignment

- `general_reviewer`
- `repo_instructions_reviewer` when applicable
- `spec_alignment_reviewer`

### Behavior change with tests

- `general_reviewer`
- `repo_instructions_reviewer` when applicable
- `test_reviewer`

### Go-heavy review

- `general_reviewer`
- `repo_instructions_reviewer` when applicable
- `go_reviewer`
- optional `documentation_reviewer`, `test_reviewer`, or
  `error_handling_reviewer` only when the target justifies them

### Risky feature delivery

- `general_reviewer`
- `repo_instructions_reviewer` when applicable
- `spec_alignment_reviewer`
- `test_reviewer`
- optional domain, documentation, error-handling, or one external-model lens
