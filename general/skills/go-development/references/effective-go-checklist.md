# Effective Go Checklist (Distilled)

Use this as a pre-commit review checklist.

## API and Naming
- Package name matches directory purpose and stays concise.
- Exported names are meaningful without repeating package context.
- Constructors follow `NewType` when needed; avoid mandatory constructors when zero value is useful.

## Control Flow
- Prefer early returns for errors.
- Keep happy path unindented.
- Use `switch` for multi-branch readability instead of long `if/else` chains.

## Data and Methods
- Use value receivers unless mutation/shared state or large-copy costs require pointer receivers.
- Keep structs cohesive; avoid "god" structs.
- Prefer composition over embedding that obscures ownership/behavior.

## Errors
- Return `error` as the final return value.
- Add context when propagating errors across boundaries.
- Compare errors using `errors.Is`/`errors.As`.

## Concurrency
- Define goroutine ownership and shutdown path before launching.
- Avoid unbounded goroutine creation.
- Prefer `context.Context` for cancellation/timeouts.

## Formatting/Docs
- Keep code gofmt-clean at all times.
- Add/update doc comments for exported identifiers.
- Keep examples/tests runnable and deterministic.
