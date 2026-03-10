# Google Go Style Checklist (Distilled)

Use this for pass/fail review decisions.

## Formatting
- All Go source is `gofmt`-clean.
- Keep readability over artificial line-length limits.

## Naming and Packages
- Use concise, contextual names; avoid package/name stutter.
- Keep initialism casing consistent (`ID`, `URL`, etc.).
- Avoid unnecessary underscores in identifiers.
- Keep receiver names short and consistent in a type's methods.
- Avoid package names like `util`, `common`, or `helper` for mixed concerns.

## Imports
- Group imports clearly (stdlib first, then non-stdlib).
- Avoid `import .`.
- Restrict blank imports to explicit side-effect cases (`main`, tests, or required runtime registration).
- Rename imports only for collisions or clarity.
- Keep proto import aliases consistent (for example `foopb`, `bargrpc`).

## Error Contracts
- Return `error` as the final return value for fail-capable functions.
- Exported APIs return `error`, not concrete error types.
- Error strings are lowercase and avoid terminal punctuation.
- Do not silently drop errors (`_ = err`) without explicit justification.
- Keep failure handling early (`if err != nil`) so normal flow stays unindented.

## Error Logging and Panic Boundaries
- Do not both log and return the same error at multiple layers.
- Use `%w` when callers need unwrapping; use `%v` when intentionally hiding internals.
- Keep `%w` at the end of wrapped messages.
- Limit `panic` to truly exceptional invariant failures.
- Keep process-exit policy (`log.Fatal`, `os.Exit`) in binary entrypoints.

## Context and Concurrency
- Accept `context.Context` as the first parameter for request-scoped work.
- Prefer standard `context.Context`; avoid custom context abstractions.
- Do not store request contexts on long-lived structs unless an interface requires it.
- Define goroutine ownership, shutdown, and wait path before launch.
- Keep lifecycle ownership on concrete structs; avoid package-global mutable callbacks for process, clock, filesystem, or network behavior.

## Language and API Semantics
- Prefer value semantics unless mutation/sharing/size justify pointers.
- Use field names in composite literals for external package types.
- Prefer nil slices/maps as defaults unless semantics require eager allocation.
- Avoid pointer args purely for speculative micro-optimization.
- Prefer concrete structs with owned dependencies over package-global mutable function vars.
- Introduce interfaces at the consuming boundary when there is a real need; do not add provider-side interfaces or globals only to simplify tests.

## Testing
- Prefer `testing` package conventions and readable failure output.
- Use table-driven tests for behavior matrices.
- Include function, input, got, and want in failure messages.
- Use `t.Helper()` in reusable helpers.
- Use `t.Fatal` only for irrecoverable setup/assert paths; otherwise prefer `t.Error`.
- Avoid brittle checks on unstable output ordering.
- Prefer constructing a subject with fake deps over mutating package globals in tests.

## Documentation
- Add doc comments for exported declarations.
- Keep comments complete, concrete, and non-ornamental.
- Document context, concurrency, cleanup, and error semantics where relevant.
- Include runnable examples where they improve API discoverability.

## Common Libraries and CLI
- Use `crypto/rand` for key/secret material.
- Keep flags/config wiring in binaries, not reusable libraries.
- For command frameworks, pass command context through to operations.
- Keep `main` thin: wire config and concrete dependencies, then delegate to an `app`, `runner`, or `service` type.

## Review Gate
- A change should fail review if it violates any `Formatting`, `Imports`, `Error Contracts`, or `Testing` checklist items without explicit rationale in code review notes.
- A change should also fail review when it introduces package-global mutable function vars without a narrow, explicit justification.
