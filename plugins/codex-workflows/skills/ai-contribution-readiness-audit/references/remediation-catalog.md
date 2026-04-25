# Remediation Catalog

Each remediation includes **example content** at the level of concreteness the audit output should match. Adapt paths, commands, and language to the target repo.

---

## 1. AGENTS.md

The single highest-leverage file. Acts as a map + contract for AI agents. Keep it ~50-150 lines.

### What it must include
- One-paragraph system summary
- "Start here" file list with actual paths
- Command canon: exact format, lint, test, build commands
- Key invariants: things that must not break
- Forbidden actions: explicit "never do this" list
- Escalation triggers: when to stop and ask

### Example content (Go project)

```markdown
# Agent Instructions

## What this repo is
CLI tool for managing schema migrations. Go, single binary, no external dependencies at runtime.

## Start here
- `cmd/schema-tools/main.go` — entrypoint
- `internal/migrate/` — core migration engine
- `internal/config/` — configuration loading and validation
- `pkg/api/` — public API surface (semver-stable)
- `Makefile` — all build/test/lint commands

## Command canon
- Format: `make fmt`
- Lint: `make lint`
- Fast tests: `make test-fast` (unit tests only, ~10s)
- Full tests: `make test` (unit + integration, ~2min)
- Build: `make build`

## Key invariants
- `pkg/api/` is the public interface. Changes require semver consideration.
- Migration files are append-only. Never modify an existing migration.
- Config loading must be backwards-compatible. Old configs must still parse.

## Forbidden actions
- Do not run `rm -rf`, `git push --force`, or `git reset --hard` without explicit approval.
- Do not modify files under `internal/auth/` without security review.
- Do not skip linting or bypass pre-commit hooks.
- Do not add external runtime dependencies without discussion.
- Do not fabricate test output or claim tests passed without running them.

## Escalate immediately if
- Requirements conflict or are ambiguous.
- A change touches `pkg/api/` (public surface).
- Tests fail after two debugging attempts.
- A change affects database migrations or destructive data paths.

## If you change...
- Any `.go` file → run `make fmt && make lint && make test-fast`
- `pkg/api/` → also run `make test` (full suite)
- `go.mod` or `go.sum` → run `go mod tidy` and commit both files
- `internal/config/` schema → update `docs/config-reference.md`
```

---

## 2. PR Template

Ensures AI-generated PRs include evidence, not just code.

### Example content

```markdown
## Summary
<!-- What changed and why. Link to issue/plan if applicable. -->

## Validation
<!-- Commands you ran and their output. Copy-paste, don't paraphrase. -->
- [ ] `make fmt` (no diff)
- [ ] `make lint` (clean)
- [ ] `make test-fast` (all pass)
- [ ] `make test` (if public API or integration-level change)

## Risk
<!-- What could go wrong? What's the blast radius? -->

## Rollback
<!-- How to revert if this causes problems. -->
```

---

## 3. Makefile / justfile Targets

Standardize the command surface so agents and humans run the same thing.

### Example Makefile targets

```makefile
.PHONY: fmt lint test-fast test build verify help

fmt: ## Format all source files
	gofmt -w .

lint: ## Run linters
	golangci-lint run ./...

test-fast: ## Run unit tests only (~10s)
	go test -short ./...

test: ## Run full test suite including integration
	go test ./...

build: ## Build the binary
	go build -o bin/schema-tools ./cmd/schema-tools

verify: fmt lint test-fast ## Quick pre-commit check
	@echo "All checks passed."

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
```

### Example justfile targets (TypeScript)

```just
fmt:
    npx prettier --write .

lint:
    npx eslint .

test-fast:
    npx vitest run --reporter=verbose

test:
    npx vitest run --coverage

build:
    npx tsc --build

verify: fmt lint test-fast
    @echo "All checks passed."
```

---

## 4. CI Workflow

CI should run the same commands as local development.

### Example GitHub Actions workflow

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod

      - name: Format check
        run: |
          make fmt
          git diff --exit-code || { echo "Run 'make fmt' and commit."; exit 1; }

      - name: Lint
        run: make lint

      - name: Test
        run: make test
```

---

## 5. Regeneration Rules

For repos with generated artifacts (schemas, docs, lockfiles, clients).

### What to add to AGENTS.md

```markdown
## If you change...
- `proto/*.proto` → run `make gen-proto` and commit generated files
- `openapi.yaml` → run `make gen-client` and commit `pkg/client/`
- `go.mod` → run `go mod tidy` and commit `go.sum`
- Config types in `internal/config/types.go` → run `make gen-config-schema`
```

### CI drift check

```yaml
      - name: Check generated files
        run: |
          make gen-proto
          git diff --exit-code || { echo "Generated files are stale. Run 'make gen-proto'."; exit 1; }
```

---

## 6. Architecture / Module Map

For repos where an AI agent might not know which files to touch.

### Example docs/architecture.md

```markdown
# Architecture

## Module map
- `cmd/` — CLI entrypoints. Thin wrappers that call into `internal/`.
- `internal/migrate/` — Core migration engine. Owns migration ordering, execution, rollback.
- `internal/config/` — Config loading, validation, defaults. Backwards-compatible.
- `internal/store/` — Database interaction layer. All SQL lives here.
- `pkg/api/` — Public Go API. Semver-stable. Changes require version bump.

## Boundaries
- `cmd/` calls `internal/` only. Never imports `pkg/api/`.
- `internal/store/` is the only package that imports database drivers.
- `pkg/api/` must not depend on `internal/` (it's the public surface).

## Common change patterns
- Bug in migration logic → `internal/migrate/` + test in `internal/migrate/*_test.go`
- New CLI flag → `cmd/` + update `docs/cli-reference.md`
- New config option → `internal/config/` + update `docs/config-reference.md` + regenerate schema
```

---

## 7. Contributing Guide

### Example CONTRIBUTING.md section for AI workflow

```markdown
## AI-Assisted Contributions

### Required workflow
1. Read `AGENTS.md` and relevant source files before editing.
2. Summarize current behavior and proposed change before writing code.
3. Make minimal, scoped changes. Don't refactor unrelated code.
4. Run `make verify` (or equivalent) and fix all failures.
5. Include test evidence in PR description (copy-paste command output).

### PR expectations
- Tests added/updated for behavior changes.
- Docs updated for user-facing changes.
- No unrelated formatting or refactoring.
- Evidence of test execution in PR body.
```

---

## 8. Runbook / Debug Guide

### Example docs/runbook.md

```markdown
# Runbook

## Local development
- Build: `make build`
- Test: `make test-fast` (fast) or `make test` (full)
- Full check: `make verify`

## Debugging common failures
### "migration already applied" error
- Check `internal/store/migrations.go` for the migration registry
- Verify migration files are append-only (no edits to existing migrations)

### Test failures in CI but not locally
- Check Go version matches `go.mod` (`go` directive)
- Check for tests that depend on file ordering (non-deterministic on Linux)
- Run `make test` with `-count=1` to disable test caching

### Lint failures
- Run `make fmt` first (formatting fixes most lint issues)
- For remaining issues, check `.golangci.yml` for enabled linters
```
