---
name: go-development
description: Implement, refactor, and review production Go code using Google-style API, error, concurrency, testing, and readability rules plus version-gated modernization guidance. Use when building Go features, reviewing Go pull requests, modernizing legacy Go code, or debugging Go services/CLIs/libraries.
---

# Go Development

Use this skill in one of two execution profiles.

## Profiles

### Implementer-Fast (default)

1. Run tooling gate first.
2. If tooling passes, read only rules that match changed risk areas.
3. Implement with minimal policy overhead.

### Reviewer-Deep

1. Run tooling gate.
2. Review all manual and mixed-enforcement rules relevant to changed files.
3. Report policy gaps with severity and evidence.

## Tooling Gate First

When `golangci-lint` v2 config is present:

```bash
golangci-lint fmt --diff
golangci-lint run
go test ./...
```

Fallback (portable baseline):

```bash
bad="$(git ls-files -z --cached --others --exclude-standard -- '*.go' | xargs -0 gofmt -l)"
if [ -n "$bad" ]; then
  printf 'gofmt required for:\n%s\n' "$bad"
  exit 1
fi
go vet ./...
go test ./...
```

## Rule Categories

- `api-*`: API and package design
- `error-*`: error and failure policy
- `concurrency-*`: context and lifecycle
- `testing-*`: test quality and helpers
- `style-*` / `readability-*`: style, naming, docs
- `language-*`: value/pointer/slice semantics
- `modernize-*`: version-gated modernization
- `dependency-*`: dependency hygiene
- `verification-*`: verification and delivery

## What To Read Next

Use `references/lint-coverage-matrix.md` to decide depth:

- `automated`: trust tooling output first
- `mixed`: check linter output plus rule intent
- `review-only`: always evaluate manually

## Local Autofix Policy

Allowed for implementers:

```bash
golangci-lint run --fix
```

Reviewer/CI gate stays non-mutating (`fmt --diff`, `run`, tests).

## Reviewer Output Contract

For each finding, report:

- severity
- `automated` / `mixed` / `review-only`
- source rule file
- required action
- verification evidence

## References

- `references/lint-coverage-matrix.md` - rule-to-enforcement routing
- `references/golangci-lint-v2.7.2.yml` - recommended v2 config baseline
- `references/google-go-style-checklist.md` - guide/decisions/best-practices pass/fail list
- `references/effective-go-checklist.md` - core idioms and API basics
- `references/modernize-checklist.md` - modernize analyzer coverage and guardrails

## Source Alignment

- Effective Go: `https://go.dev/doc/effective_go`
- Google Go guide: `https://google.github.io/styleguide/go/guide`
- Google Go decisions: `https://google.github.io/styleguide/go/decisions`
- Google Go best practices: `https://google.github.io/styleguide/go/best-practices`
- Modernize analyzers (pinned): `https://github.com/golang/tools/blob/b365b0a1509ccb1f7568a67499c6db90a6928d7c/go/analysis/passes/modernize/modernize.go`
