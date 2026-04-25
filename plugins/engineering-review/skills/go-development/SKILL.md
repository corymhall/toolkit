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
4. If delegated as a reviewer subagent, return the review itself, not process
   narration. Do not say that you spawned a lane, are waiting, or are about to
   review something.

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

When implementation touches package design, dependency wiring, `main`, lifecycle code, or tests with fakes/stubs, read these rules before editing:

- `rules/api-global-state.md`
- `rules/api-consumer-interfaces.md`
- `rules/api-cli-command-context.md`
- `rules/testing-failures-helpers.md`

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

Always flag package-global mutable function vars as a design smell unless the change includes a narrow, explicit justification for keeping a legacy seam.

When there are no meaningful Go-specific findings, say that explicitly and add
any residual risk or test-gap note instead of describing your process.

## References

- `references/lint-coverage-matrix.md` - rule-to-enforcement routing
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
