# Reviewer Lenses

Use this file to decide which reviewer agents to launch for a given manual
review request.

## Baseline

Always start with:

- `general_reviewer`

## Add `spec_alignment_reviewer` when

- the user names a spec, plan, PRD, task, or acceptance criteria
- the question is "did this implementation match what we intended?"
- scope drift matters as much as correctness

## Add `test_reviewer` when

- behavior changed
- the request mentions tests, coverage, proof, or confidence
- the diff touches tests or test-like files
- the main uncertainty is "did we verify this strongly enough?"

## Add `go_reviewer` when

- the review target is mostly `.go` files or Go packages
- the user asks for review using the `go-development` skill
- the main uncertainty is Go API design, dependency ownership, error policy,
  concurrency lifecycle, or Go-specific test quality

## Add `error_handling_reviewer` when

- the code touches retries, recovery, fallbacks, logging, or incident-prone
  behavior
- operational risk matters
- the request explicitly asks about failure handling or resilience

## Optional extra external lane

Add one outside generic review lane when:

- the user asks for a second opinion from another runtime
- the change is risky enough that an independent perspective is worth the
  latency

Do not duplicate the full Codex reviewer stack across multiple external
runtimes by default.

## Good default combinations

### Current diff, no extra context

- `general_reviewer`

### Spec or plan alignment check

- `general_reviewer`
- `spec_alignment_reviewer`

### Behavior change with tests

- `general_reviewer`
- `test_reviewer`

### Go-heavy review

- `general_reviewer`
- `go_reviewer`
- optional `test_reviewer`
- optional `error_handling_reviewer`

### Risky feature delivery check

- `general_reviewer`
- optional `go_reviewer` for Go-heavy scopes
- `spec_alignment_reviewer`
- `test_reviewer`
- optional `error_handling_reviewer`
- optional one outside generic lane
