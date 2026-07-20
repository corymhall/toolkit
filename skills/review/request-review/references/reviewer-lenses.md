# Reviewer Lenses

Use this file as the source of truth for selecting independent review lenses and
framing sidecar prompts. Start with one lane and add another only when it answers
a distinct unresolved question.

## Contents

- [Baseline](#baseline)
- [Additional lenses](#additional-lenses)
- [Lens contracts](#lens-contracts)
- [Lane rules](#lane-rules)
- [Common combinations](#common-combinations)

## Baseline

Use `general_reviewer` by default. A normal repository change does not also need
separate repository-instruction, documentation, specification, and language
lanes merely because those concerns exist.

The main session owns:

- the user's intent and conversation history
- repository instructions and required workflow checks
- code documentation and other author responsibilities
- deciding whether a finding fits the agreed scope

Give each sidecar a concise statement of the intended observable behavior and
important accepted constraints. Plans and design notes are context by default,
not an authoritative requirement set for a context-free reviewer to enforce. An
explicitly user-designated specification or an external protocol,
compatibility, security, or policy contract may be authoritative.

## Additional Lenses

### `contract_alignment_reviewer`

Add only when the user explicitly asks for independent alignment against a
named authoritative document, or when an external protocol, compatibility,
security, or policy contract is the central unresolved question. Do not add it
for an ordinary issue, task, implementation plan, or decision note. The main
session must identify the authoritative portions, accepted limitations, and
relevant observable behavior in the prompt.

### `test_reviewer`

Add when the user explicitly asks for a test review, the central uncertainty is
whether the proof is meaningful, or tests could plausibly pass without
exercising the claimed behavior. Do not add this lane solely because the diff
contains tests or changes behavior.

### `go_reviewer`

Add for non-trivial Go changes when an independent idiom and API-quality pass
has distinct value, or when the user asks for it. This reviewer applies current
Go guidance rather than assuming existing repository patterns are idiomatic.
Small mechanical Go changes normally need only the general lane.

### `error_handling_reviewer`

Add when retries, recovery, destructive operations, fallbacks, or operational
failure behavior are the main risk and deserve a dedicated pass. Do not add it
for ordinary error returns already covered by general review.

### Other domain expertise

Use a focused domain contract only when generic review is likely to miss a
material domain-specific failure. For Neovim runtime behavior, load
`../../neovim-plugin-development/references/reviewer-deep.md` and include that
contract in one focused lane. Do not create a broad lane stack around it.

## Lens Contracts

Every sidecar prompt must include the exact target, concise intended behavior,
relevant constraints, and the selected contract below. All lanes are read-only
and return findings rather than fixes.

### `general_reviewer`

Review like an owner. Find correctness bugs, behavioral regressions, unsafe
assumptions, and maintainability problems likely to hurt future work. Look for
accidental complexity when a simpler implementation would preserve the claimed
behavior, but do not turn hypothetical unsupported cases into new requirements.
Lead with evidence-backed findings, include file references, and avoid
style-only comments. Return blocking findings, important non-blocking findings,
and residual risks.

### `contract_alignment_reviewer`

Compare the implementation and tests with the named authoritative contract.
Distinguish required observable behavior from examples, advisory guidance, open
questions, and accepted non-goals. Report concrete mismatches and unresolved
contract ambiguities without expanding beyond the contract or turning residual
risk into a new requirement.

### `test_reviewer`

Evaluate proof quality rather than test count. Check whether tests exercise and
assert the behavior the change actually claims to support, including meaningful
fallback or failure behavior. Find misleading tests, weak assertions, and
important untested branches introduced by the implementation. Do not demand an
exhaustive matrix of theoretical cases or broaden product scope. Distinguish
insufficient proof from an explicitly accepted limitation.

### `go_reviewer`

Load the `go-development` skill and its
`references/reviewer-deep.md` contract. Review manual Go design judgment:
simplicity, package and API boundaries, dependency and data ownership, errors,
external effects, concurrency lifecycle, semantic tests, and behavioral
documentation. Do not reproduce formatter, linter, compiler, or analyzer
findings. Treat local precedent as evidence: follow hard repository constraints,
tolerate legacy that requires broader migration, and challenge newly introduced
avoidable complexity. For each finding include severity, location, concrete
cost, the smallest responsible correction, and verification evidence.

### `error_handling_reviewer`

Review operational failure behavior. Find swallowed errors, dangerous silent
failures, weak observability, unsafe recovery or fallback logic, and mismatches
between documented and actual behavior. Prefer a safe, understandable stop over
speculative automatic recovery when the system cannot prove the state. Return
dangerous failure modes, observability gaps, recovery issues, and residual
operational risk without inventing broader recovery requirements.

## Lane Rules

- Remain read-only; do not implement fixes.
- Focus on the assigned question and target.
- Return findings directly, not lane-management narration.
- Include concrete file references and evidence when possible.
- Treat context notes as context, not a checklist to enforce.
- Do not promote residual risk or an unsupported hypothetical into required work.
- If a lane cannot run, continue with useful lanes and report the missing lens
  only when it materially reduces confidence.
- The main session verifies findings against the code and conversation before
  reporting them.

## Common Combinations

### Ordinary change

- `general_reviewer`

### Explicit authoritative-contract alignment

- `general_reviewer`
- `contract_alignment_reviewer`

### Behavior where test proof is the main concern

- `general_reviewer`
- `test_reviewer`

### Substantial Go change

- `general_reviewer`
- `go_reviewer`
- add `test_reviewer` only when it answers a separate proof question

### Recovery or destructive workflow

- `general_reviewer`
- `error_handling_reviewer`
- add a language or test lane only for another material uncertainty
