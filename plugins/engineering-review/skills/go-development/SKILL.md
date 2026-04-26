---
name: go-development
description: Implement, refactor, modernize, and debug production Go code using Google-style API, error, concurrency, testing, and readability rules plus version-gated modernization guidance. For Go code review, prefer request-review, which can launch the Go reviewer lane.
---

# Go Development

Use this skill for writing and changing Go code. Keep the main session focused
on the implementation outcome, and load only the Go rules that match the code
being touched.

For review-only work, prefer `request-review`. It can launch `go_reviewer`,
which uses the Go-specific review contract in
[references/reviewer-deep.md](references/reviewer-deep.md).

## Implementer Profile

1. Inspect the repo's existing Go version, style, lint config, and local
   patterns.
2. Run the tooling gate when practical, or note why it is too expensive or
   blocked.
3. Read only the rule files that match the changed risk areas.
4. Implement with minimal policy overhead and verify the changed behavior.

## Version Gate

Before applying modernization rules, check the target Go version from `go.mod`,
toolchain config, CI, or repo docs.

- Use modernization rules only when the repo's target Go version supports them.
- Do not "modernize" across a version boundary without an explicit upgrade
  request.
- If version support is unclear, prefer the established local pattern and note
  the uncertainty.

## Architecture Defaults

- For stateful, lifecycle-heavy, or multi-step behavior, start with a concrete struct (`App`, `Runner`, `Service`, `Client`) that owns its dependencies through fields and methods.
- Keep dependency ownership explicit with constructors or small config/dependency structs. Prefer `runner := Runner{clock: realClock{}, fs: osFS{}}` over package-global mutable function vars.
- Start with concrete types first. Introduce interfaces only at the consuming boundary and only when a real alternate implementation or test seam is needed.
- Keep `main` packages thin: parse flags/config, build concrete dependencies, instantiate an `app`/`runner`/`service`, and delegate execution to a method.
- Do not default to package-global mutable function vars such as `var nowFn = time.Now`, `var readFileFn = os.ReadFile`, or `var killFn = syscall.Kill`. Treat them as a last-resort legacy seam that requires explicit justification and careful test restoration.
- In tests, prefer constructing a subject with fake/stub dependencies over mutating package globals. This keeps dependencies visible and tests safe for parallel execution.

## Tooling Gate First

When `golangci-lint` v2 config is present:

```bash
golangci-lint fmt --diff
golangci-lint run
go test ./...
```

Fallback (portable baseline):

```bash
bad=""
while IFS= read -r -d '' f; do
  out="$(gofmt -l "$f")"
  if [ -n "$out" ]; then
    bad="${bad}${out}\n"
  fi
done < <(git ls-files -z --cached --others --exclude-standard -- '*.go')
if [ -n "$bad" ]; then
  printf 'gofmt required for:\n%b' "$bad"
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

For implementation, load targeted rules based on the work:

- package design, dependency wiring, or test seams:
  `rules/api-global-state.md`, `rules/api-consumer-interfaces.md`
- command setup, cancellation, or process boundaries:
  `rules/api-cli-command-context.md`, `rules/error-init-panic-boundaries.md`
- goroutines, cancellation, or worker lifecycles:
  `rules/concurrency-context-first.md`,
  `rules/concurrency-goroutine-lifecycles.md`
- error surfaces, wrapping, logging, or panic policy:
  `rules/error-api-contract.md`, `rules/error-wrap-context.md`,
  `rules/error-logging-boundaries.md`, `rules/error-no-panic-libraries.md`
- tests, fakes, or helper assertions:
  `rules/testing-failures-helpers.md`, `rules/testing-table-driven.md`
- Go version updates or cleanup work:
  `references/modernize-checklist.md` and only the relevant `modernize-*`
  rules

## Local Autofix Policy

Allowed for implementers:

```bash
golangci-lint run --fix
```

Reviewer/CI gate stays non-mutating (`fmt --diff`, `run`, tests).

## References

- `references/lint-coverage-matrix.md` - rule-to-enforcement routing
- `references/reviewer-deep.md` - Go reviewer lane contract
- `references/golangci-lint-v2.7.2.yml` - recommended v2 config baseline
- `references/google-go-style-checklist.md` - guide/decisions/best-practices pass/fail list
- `references/effective-go-checklist.md` - core idioms and API basics
- `references/modernize-checklist.md` - modernize analyzer coverage and guardrails

## Source Alignment

- Effective Go: `https://go.dev/doc/effective_go`
- Go Code Review Comments: `https://go.dev/wiki/CodeReviewComments`
- Google Go guide: `https://google.github.io/styleguide/go/guide`
- Google Go decisions: `https://google.github.io/styleguide/go/decisions`
- Google Go best practices: `https://google.github.io/styleguide/go/best-practices`
- Modernize analyzers (pinned): `https://github.com/golang/tools/blob/b365b0a1509ccb1f7568a67499c6db90a6928d7c/go/analysis/passes/modernize/modernize.go`
