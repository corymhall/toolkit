# Go Errors, Concurrency, And Effects

Use this reference when failure behavior, cancellation, shared state, background
work, recovery, or external side effects are material to the change.

## Error Boundaries

Return `error` from reusable code. Add context when crossing a semantic, package,
or I/O boundary so the message says what operation failed. Preserve the original
error with `%w` only when callers should be able to inspect it.

Use `errors.Is` and `errors.As` for classification. Avoid branching on error
message text unless an external dependency exposes no stable typed signal; if
forced to do so, isolate and document the fragile boundary.

Do not both log and return the same error through multiple layers. Return errors
through reusable code and log where handling policy is chosen, such as a CLI,
request, worker, or process boundary.

Follow repository wording and error types when they are public or operational
contracts. Generic lowercase-message advice does not justify churn in a mature
codebase.

Reserve panic and invariant assertions for programmer errors or impossible
internal states. Invalid user input, network failure, missing files, Git state,
and other operational failures should normally produce actionable errors.

## Context And Cancellation

Accept `context.Context` as the first parameter when work is request-scoped,
cancelable, long-running, or crosses APIs that already accept context. Propagate
the caller's context rather than replacing it with `context.Background()`.

Do not add context to pure calculations or store request contexts on long-lived
objects without a lifecycle reason. If work intentionally outlives its caller,
make that policy explicit and preserve only the values or tracing it genuinely
needs.

## Goroutine Ownership

Every goroutine needs answers to:

- Who starts it?
- What stops it?
- Who observes failure?
- Who waits for completion?
- What resources does it own or mutate?

Finite work whose completion is awaited may not need a separate cancellation
path. Long-lived work normally does. Avoid detached goroutines that silently
lose failures.

Bound fan-out when caller-controlled input can create unbounded work. Do not
introduce a worker-pool abstraction when `errgroup`, a small semaphore, or direct
sequential work is sufficient.

## Channels, Locks, And Shared State

Use channels to communicate values, transfer ownership, or coordinate events.
Use mutexes to protect shared state and invariants. Neither is categorically more
idiomatic; choose the mechanism that makes ownership and failure easiest to
understand.

Keep lock scope visible and avoid holding locks across network, filesystem, or
other unbounded operations. Document ordering when multiple locks exist. Copy
mutable inputs before concurrent use only when ownership is otherwise shared.

## External Effects And Recovery

Filesystem, process, environment, Git, network, and remote API operations need
explicit ordering and partial-failure behavior. Check:

- what may already have changed when an error returns
- whether retry or rerun is idempotent
- whether cancellation leaves recoverable state
- whether logs or recorded commands can expose secrets
- whether no-op and dry-run modes preserve their promise

Do not infer every possible interrupted state merely to automate recovery. When
the program cannot prove that an action is safe, stop without mutation and give
the user concrete recovery guidance.
