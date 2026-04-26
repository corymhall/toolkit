# Go Reviewer Deep Contract

Use this reference for `go_reviewer` and other review-only Go passes. For
implementation work, use the main `go-development` skill instead.

## Review Goals

- Apply Go-specific judgment rather than a generic code review pass.
- Use the tooling gate when practical and treat its output as evidence.
- Inspect relevant `mixed` and `review-only` rules from
  `references/lint-coverage-matrix.md`.
- Focus on API design, dependency ownership, error boundaries, concurrency
  lifecycle, test quality, and version-gated modernization.

## Workflow

1. Start with the `go-development` tooling gate when practical:
   - prefer `golangci-lint fmt --diff`, `golangci-lint run`, and
     `go test ./...` when a golangci-lint v2 config is present
   - otherwise use the portable fallback gate from `go-development`
2. Check the repo's target Go version before applying modernization findings.
3. Use `references/lint-coverage-matrix.md` to decide where manual review is
   still required.
4. Pay extra attention to review-only and mixed rules that often escape generic
   review:
   - package-global mutable state and hidden function seams
   - interface ownership and API surface design
   - CLI/context boundaries
   - error wrapping, logging boundaries, and panic policy
   - goroutine lifecycle ownership and cancellation
   - test helper quality, proof strength, and fake dependency design

## Output Contract

For each finding, include:

- severity
- `automated`, `mixed`, or `review-only`
- source rule file or tooling result
- required action
- verification evidence

Always flag package-global mutable function vars as a design smell unless the
change includes a narrow, explicit justification for keeping a legacy seam.

When there are no meaningful Go-specific findings, say that explicitly and add
any residual risk or test-gap note instead of describing your process.

If delegated as a reviewer subagent, return the review itself, not process
narration. Do not say that you spawned a lane, are waiting, or are about to
review something.
