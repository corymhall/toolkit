# AGENTS.md Exemplars

These are fully-written examples. Adapt to the target repo's actual paths, commands, language, and conventions. Do not use these as-is — they exist to model the **level of concreteness** the audit output should achieve.

---

## Example 1: Go CLI / Library

```markdown
# Agent Instructions

## What this repo is
CLI tool for managing cloud infrastructure schemas. Go, single binary.

## Start here
- `cmd/schema-tools/main.go` — CLI entrypoint
- `internal/migrate/` — migration engine (ordering, execution, rollback)
- `internal/config/` — config loading and validation
- `pkg/api/` — public API (semver-stable, changes require version bump)
- `Makefile` — all dev commands

## Command canon
- Format: `make fmt`
- Lint: `make lint`
- Fast tests: `make test-fast` (unit only, ~10s)
- Full tests: `make test` (unit + integration, ~2min)
- Build: `make build`
- Quick pre-commit: `make verify` (runs fmt + lint + test-fast)

## Key invariants
- `pkg/api/` is the public surface. Changes require semver consideration.
- Migration files are append-only. Never edit an existing migration.
- Config loading is backwards-compatible. Old configs must still parse.

## Forbidden actions
- Do not run `rm -rf`, `git push --force`, or `git reset --hard` without explicit approval.
- Do not modify `internal/auth/` without security review.
- Do not skip linting or bypass pre-commit hooks.
- Do not add external runtime dependencies without discussion.
- Do not fabricate test output.

## Escalate immediately if
- Requirements conflict or are ambiguous.
- A change touches `pkg/api/` (public surface).
- Tests fail after two debugging attempts.
- A change affects database migrations or destructive data paths.

## If you change...
- Any `.go` file → run `make fmt && make lint && make test-fast`
- `pkg/api/` → also run `make test` (full suite)
- `go.mod` or `go.sum` → run `go mod tidy` and commit both files
- Config types → update `docs/config-reference.md`
```

---

## Example 2: TypeScript / Node Project

```markdown
# Agent Instructions

## What this repo is
TypeScript SDK for a cloud infrastructure platform. Publishes to npm.

## Start here
- `src/index.ts` — public exports
- `src/resources/` — resource definitions (one file per resource type)
- `src/utilities/` — shared helpers (serialization, validation, naming)
- `tests/` — mirrors `src/` structure
- `package.json` — scripts and dependencies

## Command canon
- Format: `npm run fmt` (prettier)
- Lint: `npm run lint` (eslint)
- Fast tests: `npm test` (vitest, ~15s)
- Full tests: `npm run test:all` (includes integration, ~3min)
- Build: `npm run build` (tsc)
- Quick pre-commit: `npm run verify` (fmt + lint + test)

## Key invariants
- Public API in `src/index.ts` is semver-stable. Don't remove or rename exports.
- Resource definitions follow the pattern in `src/resources/README.md`.
- All utilities must be pure functions with no side effects.

## Forbidden actions
- Do not modify `package-lock.json` by hand. Run `npm install` to update it.
- Do not add `devDependencies` to `dependencies`.
- Do not import from `tests/` in `src/` or vice versa (test helpers stay in tests).
- Do not use `any` type. Use `unknown` with type guards.
- Do not bypass eslint with `// eslint-disable` without a comment explaining why.

## Escalate immediately if
- A change affects public API exports.
- Type-checking passes locally but you're unsure about downstream compatibility.
- Integration tests require credentials or network access you don't have.

## If you change...
- Any `.ts` file → run `npm run fmt && npm run lint && npm test`
- Public exports in `src/index.ts` → also run `npm run test:all`
- `package.json` deps → run `npm install` and commit `package-lock.json`
- Resource definitions → update `docs/resources.md`
```

---

## Example 3: Monorepo / Multi-Package

```markdown
# Agent Instructions (repo root)

## What this repo is
Monorepo containing the CLI, SDK, and web dashboard for a cloud platform.

## Repo structure
- `packages/cli/` — Go CLI binary
- `packages/sdk/` — TypeScript SDK (npm published)
- `packages/dashboard/` — React web app
- `packages/shared/` — Shared types and utilities (used by sdk + dashboard)
- `infra/` — Pulumi infrastructure definitions
- `scripts/` — Cross-package build/test orchestration

## Per-package commands
Each package has its own README with specific commands. The root orchestrates:
- `make fmt` — format all packages
- `make lint` — lint all packages
- `make test-fast` — fast tests across all packages (~30s)
- `make test` — full tests across all packages (~10min)
- `make build` — build all packages

For single-package work:
- `cd packages/cli && make test-fast`
- `cd packages/sdk && npm test`
- `cd packages/dashboard && npm test`

## Boundaries
- `packages/shared/` is the only cross-package dependency. Other packages must not import each other directly.
- `packages/cli/` must not depend on any TypeScript package.
- `infra/` has its own dependency tree and must not import from `packages/`.

## Forbidden actions
- Do not make cross-package changes in a single PR unless they're in `shared/`.
- Do not modify `infra/` without explicit approval (production infrastructure).
- Do not add new packages without discussion.
- Do not run `make deploy` (production deployment) under any circumstances.

## Escalate immediately if
- A change requires modifying `packages/shared/` (affects multiple consumers).
- CI is failing on a package you didn't touch.
- You need to add a new cross-package dependency.

## If you change...
- Files in one package → run that package's tests only
- `packages/shared/` → run tests in shared + all consuming packages
- `infra/` → run `cd infra && pulumi preview` (never `pulumi up`)
- Root `Makefile` or `scripts/` → run `make test-fast` from root
```
