# Reviewer Lenses

Use this file as the source of truth for which reviewer agents to launch for a
manual review request.

Choose the smallest lens set that answers the user's actual question. Do not add
lanes just because they exist.

## Baseline

Always start with:

- `general_reviewer`

Also run `repo_instructions_reviewer` when the review target is a repo change
and an applicable `AGENTS.md` file exists.

This lane is required for plugin, skill, workflow, generated output, release
process, validation, or file-placement changes.

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

## Lane Rules

- Reviewer lanes are read-only.
- Reviewer lanes should focus on findings, not code edits.
- Reviewer lanes should return findings directly, not lane-management status
  chatter such as "I spawned a review lane" or "still running".
- If a selected lane cannot be launched, continue with the useful lanes that are
  available and report the missing lens as residual risk.
- If a lane returns process narration instead of findings, ignore the narration
  and synthesize only the useful findings.

## Good default combinations

### Current diff, no extra context

- `general_reviewer`
- `repo_instructions_reviewer` when applicable

### Spec or plan alignment check

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
- optional `test_reviewer`
- optional `error_handling_reviewer`

### Risky feature delivery check

- `general_reviewer`
- `repo_instructions_reviewer` when applicable
- optional `go_reviewer` for Go-heavy scopes
- `spec_alignment_reviewer`
- `test_reviewer`
- optional `error_handling_reviewer`
- optional one outside generic lane
