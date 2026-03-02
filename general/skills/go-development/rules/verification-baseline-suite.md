---
title: Run a baseline verification suite before completion
impact: MEDIUM
impactDescription: fewer regressions and clearer handoffs
tags: verification, quality, delivery
enforcement: mixed
---

## Run a baseline verification suite before completion

Always run a consistent verification baseline.
Use non-mutating checks for reviewer/CI gates.

**Bad (partial, non-reproducible verification):**

```bash
# ran one package ad-hoc and shipped

go test ./internal/foo
```

**Good (repeatable baseline):**

```bash
if command -v golangci-lint >/dev/null 2>&1 && { [ -f .golangci.yml ] || [ -f .golangci.yaml ] || [ -f .golangci.toml ] || [ -f .golangci.json ]; }; then
	golangci-lint fmt --diff
	golangci-lint run
else
	bad="$(git ls-files -z --cached --others --exclude-standard -- '*.go' | xargs -0 gofmt -l)"
	if [ -n "$bad" ]; then
		printf 'gofmt required for:\n%s\n' "$bad"
		exit 1
	fi
	go vet ./...
fi
go test ./...
```

**Local implementer autofix (optional):**

```bash
golangci-lint run --fix
go test ./...
```

Use `--fix` only in local implementation loops, never as reviewer/CI evidence.

If repo tooling exists, include configured linters (for example `golangci-lint run` or `staticcheck ./...`) and report all executed commands and outcomes in the PR or handoff notes.
