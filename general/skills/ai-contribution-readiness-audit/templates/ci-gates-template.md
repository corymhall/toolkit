# CI and Command Surface Exemplars

Adapt to the target repo's actual language, tools, and CI platform.

---

## Makefile (Go project)

```makefile
.PHONY: fmt lint test-fast test build verify help

fmt: ## Format all source files
	gofmt -w .

lint: ## Run linters
	golangci-lint run ./...

test-fast: ## Run unit tests only (~10s)
	go test -short ./...

test: ## Run full test suite including integration
	go test -count=1 ./...

build: ## Build the binary
	go build -o bin/app ./cmd/app

verify: fmt lint test-fast ## Quick pre-commit check
	@echo "All checks passed."

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
```

---

## package.json scripts (TypeScript project)

```json
{
  "scripts": {
    "fmt": "prettier --write .",
    "fmt:check": "prettier --check .",
    "lint": "eslint .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "build": "tsc --build",
    "verify": "npm run fmt:check && npm run lint && npm test"
  }
}
```

---

## GitHub Actions CI (Go)

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
          git diff --exit-code || {
            echo "Formatting drift detected. Run 'make fmt' and commit."
            exit 1
          }

      - name: Lint
        run: make lint

      - name: Test
        run: make test
```

---

## GitHub Actions CI (TypeScript)

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

      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm

      - run: npm ci

      - name: Format check
        run: npm run fmt:check

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

---

## Generated File Drift Check (any language)

Add this as a CI step after any regeneration command:

```yaml
      - name: Check generated files are committed
        run: |
          make gen  # or whatever the regeneration command is
          git diff --exit-code || {
            echo "Generated files are stale."
            echo "Run 'make gen' locally and commit the results."
            exit 1
          }
```

---

## PR Template

```markdown
## Summary
<!-- What changed and why. Link to issue if applicable. -->

## Validation
<!-- Commands you ran and their output. Copy-paste, don't paraphrase. -->
- [ ] Format check passed
- [ ] Lint passed
- [ ] Tests passed (specify which: fast/full)

## Risk
<!-- What could go wrong? Blast radius? -->

## Rollback
<!-- How to revert if this causes problems. -->
```
