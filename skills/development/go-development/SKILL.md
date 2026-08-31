---
name: go-development
description: Implement and refactor Go where package design, abstractions, ownership, errors, concurrency, or Go-specific test seams require manual judgment. Use repository tooling and the bundled modernize helper for mechanical modernization. For independent review, use request-review with its Go lens.
---

# Go Development

Write the smallest direct Go implementation that satisfies the current behavior.
Follow repository compatibility, generated-code, and workflow constraints.

Before changing code:

1. Find the owning `go.mod` or `go.work`.
2. Read the applicable repository instructions.
3. Identify generated, vendored, upstream, and public compatibility boundaries.
4. Find the repository's focused test and validation commands.

## Manual Go Judgment

- Start with concrete functions and types.
- Add a package or interface only for a current domain, dependency, ownership,
  compatibility, or test boundary.
- Do not add service, repository, manager, utility, option, state-machine, or
  worker-pool machinery for hypothetical future use.
- Do not propagate a legacy pattern when a simpler compatible local design
  works. Do not turn a focused change into a repository migration.
- Make mutation and ownership of maps, slices, pointers, and shared state clear.
- Give every goroutine an owner, termination condition, failure path, and
  completion policy.
- Preserve caller context and error identity when callers rely on them.
- Test observable behavior with the smallest useful seam.

Read [references/architecture.md](references/architecture.md) only when package
boundaries, interfaces, public APIs, or dependency ownership are central.

Read [references/lifecycle.md](references/lifecycle.md) only when the change
includes goroutines, cancellation, shared state, external effects, or partial
failure.

## Mechanical Modernization

After editing handwritten Go, run the repository's existing modernization
command if it has one. Otherwise, run the bundled helper against the smallest
relevant package:

```bash
"<skill-dir>/scripts/run-modernize.sh" ./path/to/package
```

The helper installs a pinned `modernize` analyzer in the user cache. It requires
an explicit package scope and does not change files by default.

Inspect each diagnostic. Use `--fix` only when the changes will be reviewed
before validation:

```bash
"<skill-dir>/scripts/run-modernize.sh" --fix ./path/to/package
```

Do not modernize generated, vendored, upstream, or compatibility-sensitive code
without an explicit reason. Run formatting and focused tests after fixes. Report
the commands run and blocked validation.

Mechanical modernization does not replace design judgment. The analyzer cannot
decide package boundaries, API compatibility, ownership, error policy,
goroutine lifecycle, or whether a behavior-changing standard-library migration
is safe.
