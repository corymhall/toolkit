---
name: go-development
description: Implement, refactor, and debug production Go using simple package and API design, concrete-first abstractions, explicit ownership, reliable error and concurrency boundaries, semantic tests, and repository-aware contributor judgment. For independent review, use request-review with its Go lens.
---

# Go Development

Write clear, boring Go. Prefer the smallest direct implementation that solves
the current problem. Do not make an unnecessary design more idiomatic; remove
the unnecessary design.

Use this skill for implementation and author-side Go judgment. For independent
review, use `request-review` with its `go_reviewer` lens, which loads
[references/reviewer-deep.md](references/reviewer-deep.md).

## Start With Repository Reality

Before changing code:

1. Read the applicable repository instructions and architecture docs.
2. Find the owning `go.mod` or `go.work` and its minimum Go version.
3. Identify handwritten, generated, vendored, and upstream boundaries.
4. Find the repository's canonical build, format, lint, and test commands.
5. Inspect nearby code and recent changes, but treat local precedent as evidence,
   not proof of idiomatic Go.

Classify a conflicting local pattern before acting:

- **Hard constraint:** public compatibility, generated boundaries, mandated
  frameworks, persisted state, or repository workflow. Follow it.
- **Tolerated legacy:** changing it requires a broader migration. Do not turn a
  narrow contribution into that migration.
- **Do not propagate:** a simpler idiomatic choice fits locally without breaking
  compatibility. Prefer the simpler choice.

Keep changes focused. Do not demand repository-wide cleanup, but do not deepen
legacy architecture merely for consistency.

## Core Go Posture

- Clear is better than clever. Keep control flow direct and the happy path easy
  to see.
- Start concrete. Add an abstraction only when a current consumer, alternate
  implementation, ownership boundary, or test seam genuinely needs it.
- A package boundary must earn its cost through a coherent domain or dependency
  boundary. Do not create `service`, `repository`, `controller`, `manager`,
  `utils`, or `common` layers by reflex.
- `internal` and `pkg` are mechanisms, not architectures. Use or preserve them
  when repository visibility and compatibility require them; do not use them as
  junk drawers.
- Prefer the standard library when it is sufficient and materially simpler.
  Existing repository dependencies and frameworks may still be hard constraints.
- Design useful zero values when practical. Require constructors only when they
  establish invariants or dependencies that cannot be optional.
- Export only the API callers need. Preserve public compatibility unless the
  requested work explicitly changes it.
- Do not add generic extension points, option systems, state machines, worker
  pools, or recovery inference for hypothetical future needs.
- If a difficult tail case can safely retain current behavior or stop with useful
  guidance, defer it when automatic support adds disproportionate complexity.

Read [references/architecture.md](references/architecture.md) when package
boundaries, interfaces, dependency ownership, globals, public APIs, or data
ownership are central to the change.

## Errors, Context, Concurrency, And Effects

- Return errors from reusable code and add operation context at meaningful
  boundaries without destroying caller-visible identity.
- Match errors with `errors.Is` or `errors.As` when callers need classification.
  Follow established repository error style when wording or types are part of a
  compatibility surface.
- Log an error where handling policy is decided; do not repeatedly log and
  return the same failure.
- Reserve panic, process exit, and invariant assertions for boundaries or states
  where ordinary recovery is impossible. External input and operational failure
  should normally return errors.
- Accept and propagate `context.Context` for request-scoped, cancelable, or
  long-running work. Do not add context mechanically to pure functions.
- Every goroutine needs an owner, stop condition, and completion policy.
- Use channels for communication and ownership transfer; use mutexes for
  protecting shared state. Choose the simpler model for the invariant.
- Bound concurrency when caller-controlled input can create unbounded work.
- Make mutation and aliasing of maps, slices, pointers, protobufs, and state
  explicit. Copy only when ownership requires it.
- Treat filesystem, process, network, Git, and environment changes as effects.
  Keep their ordering, retries, partial failure, and no-op behavior reviewable.
- Prefer a safe, understandable stop over guessing at ambiguous recovery state.

Read [references/errors-concurrency.md](references/errors-concurrency.md) for
changes where failure policy, cancellation, shared state, background work, or
external effects are material.

## Tests And Documentation

- Test observable behavior and regressions, not implementation structure.
- Use table-driven tests when several cases share the same setup and assertion
  shape. Do not force a specialized scenario into a table for uniformity.
- Use the repository's established test harness when it carries semantic setup,
  generated assets, protocol fixtures, or external-tool behavior.
- Prefer the smallest useful seam. A direct function, temporary directory,
  local server, or narrow fake is often simpler than abstracting a clock,
  filesystem, process, or client hierarchy.
- Preserve important failure, cancellation, partial-result, and fallback paths.
  Do not build an exhaustive matrix for behavior the change deliberately does
  not support.
- Document exported APIs where appropriate and explain non-obvious purpose,
  invariants, ownership, lifecycle, error behavior, and safety tradeoffs.
  Comments should preserve reasoning, not narrate syntax.

Read [references/testing-documentation.md](references/testing-documentation.md)
when test architecture or maintainer-facing contracts are a central risk.

## Tooling Is The Mechanical Gate

Use the repository's pinned commands from the real module or workspace. Run the
formatter, linter, generated-output checks, and focused tests appropriate to the
change. Broaden validation only when repository guidance and risk justify it.

Do not reproduce formatter, import, naming, or analyzer findings as prose rules.
For explicit modernization work, use version-aware tooling supported by the
repository, inspect its changes for semantic differences, and do not modernize
across the module's minimum Go version.

If no repository workflow exists, use the Go tools directly as a baseline:

```bash
gofmt -w <changed-go-files>
go vet ./...
go test ./...
```

Do not run credentialed, acceptance, or unusually broad suites merely because
they exist. Report the commands actually run and any blocked validation.

## Before Independent Review

When the user invokes `prepare-for-review`, apply this skill to the complete Go
diff in the main session:

- reconcile it with the conversation and accepted scope
- simplify unnecessary architecture and speculative support
- apply current Go judgment without blindly copying local legacy patterns
- add missing behavioral documentation
- run the repository's focused mechanical and test gates

A later `go_reviewer` is an independent manual-design pass, not another linter.

## Sources

This skill is informed by:

- [spf13/go-skills](https://github.com/spf13/go-skills), especially its
  concrete-first and anti-layering posture
- [Effective Go](https://go.dev/doc/effective_go)
- [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments)
- [Google Go Style Guide](https://google.github.io/styleguide/go/)
