# Lint Coverage Matrix

Use this matrix to decide how much manual policy review is needed after the tooling gate.

## Enforcement Levels

- `automated`: mainly enforced by `golangci-lint` linters/formatters.
- `mixed`: partially enforced; still requires targeted manual review.
- `review-only`: not reliably enforceable by linting; always review manually.

## Automated

| Rule | Primary tool signal |
| --- | --- |
| `style-formatting-gofmt` | `golangci-lint fmt` (`gofumpt`/`goimports`) or `gofmt -l` |
| `modernize-any-alias` | `modernize` |
| `modernize-fmt-appendf` | `modernize` |
| `modernize-forvar` | `modernize` |
| `modernize-maps-loop-helpers` | `modernize` |
| `modernize-minmax` | `modernize` |
| `modernize-new-expr` | `modernize` |
| `modernize-omitzero` | `modernize` |
| `modernize-plusbuild` | `modernize` |
| `modernize-range-int` | `modernize` |
| `modernize-reflect-typefor` | `modernize` |
| `modernize-slices-contains` | `modernize` |
| `modernize-slices-sort` | `modernize` |
| `modernize-stditerators` | `modernize` |
| `modernize-strings-builder` | `modernize` |
| `modernize-strings-cut` | `modernize` |
| `modernize-strings-cutprefix` | `modernize` |
| `modernize-strings-seq` | `modernize` |
| `modernize-testing-context` | `modernize` |
| `modernize-unsafe-funcs` | `modernize` |
| `modernize-waitgroup-go` | `modernize` |

## Mixed

| Rule | Primary tool signal | Manual focus |
| --- | --- | --- |
| `style-imports` | formatters, `importas` | alias intent and package grouping rationale |
| `style-naming` | `godoclint` partial | naming/domain nuance |
| `style-comments-docs` | `godoclint` | behavioral contract quality |
| `readability-package-stutter` | `stylecheck`/manual | API readability |
| `concurrency-context-first` | `noctx` partial | non-HTTP flows and API boundaries |
| `concurrency-loop-capture` | `copyloopvar` partial | actual capture hazards in async code |
| `error-api-contract` | `errname`, `nilnil`, `errorlint` partial | exported error surface design |
| `error-wrap-context` | `wrapcheck`, `errorlint` | boundary choice and wrapping intent |
| `testing-table-driven` | none direct | case structure and behavior coverage |
| `testing-failures-helpers` | `thelper` partial | failure message quality |
| `dependency-stdlib-first` | `depguard` optional | dependency tradeoffs |
| `modernize-stdlib-builtins` | partial via `modernize` + `gocritic` | non-suite modernization judgment |
| `verification-baseline-suite` | command execution evidence | workflow consistency |

## Review-only

| Rule | Why manual |
| --- | --- |
| `api-consumer-interfaces` | architecture and ownership tradeoffs |
| `api-export-minimum` | public surface intent |
| `api-function-arg-options` | call-site and evolution ergonomics |
| `api-global-state` | hidden coupling and lifecycle design |
| `api-cli-command-context` | CLI UX and boundary policy |
| `error-logging-boundaries` | logging policy and observability design |
| `error-init-panic-boundaries` | process boundary policy |
| `error-no-panic-libraries` | runtime policy in context |
| `concurrency-goroutine-lifecycles` | ownership/shutdown semantics |
| `language-values-pointers-slices` | semantic/perf tradeoffs |
