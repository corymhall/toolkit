# Go Lifecycle Judgment

Use this reference when failure behavior, cancellation, shared state, background
work, recovery, or external side effects are material to the change.

## Error Boundaries

Return errors from reusable code. Add operation context at meaningful package or
I/O boundaries. Preserve the original error when callers need to classify it.
Use `errors.Is` or `errors.As` instead of matching error text when a stable error
identity exists.

Do not repeatedly log and return the same failure. Return errors through reusable
code and log where handling policy is selected, such as a CLI, request, worker,
or process boundary.

Follow established error wording and types when they are public or operational
contracts. Reserve panic and process exit for genuine invariant or process
boundaries. Invalid input and operational failures should normally return useful
errors.

## Context And Cancellation

Accept and propagate `context.Context` when work is request-scoped, cancelable,
long-running, or crosses an API that already accepts context. Do not replace a
caller context with `context.Background()` or add context to pure calculations.

If work intentionally outlives its caller, make that policy and its new owner
explicit. Do not store a request context on a long-lived object without a
lifecycle reason.

## Goroutine Ownership

For each goroutine, identify:

- who starts it
- what stops it
- who observes failure
- who waits for completion
- which resources or state it owns

Finite work whose completion is awaited might not need a separate cancellation
path. Long-lived work normally does. Avoid detached goroutines that lose
failures. Bound fan-out when caller-controlled input can create unbounded work.
Use direct sequential work when concurrency does not provide a material benefit.

## Channels, Locks, And Shared State

Use channels to communicate values, transfer ownership, or coordinate events.
Use mutexes to protect shared state and invariants. Choose the mechanism that
makes ownership and failure easiest to understand; neither mechanism is always
preferred.

Keep lock scope visible. Do not hold locks across network, filesystem, or other
unbounded operations. Document ordering when multiple locks exist. Copy mutable
inputs before concurrent use only when ownership would otherwise be shared.

## External Effects And Recovery

For filesystem, process, environment, Git, network, and remote API effects,
check:

- what can already have changed when an error returns
- whether retry or rerun is safe and idempotent
- whether cancellation leaves recoverable state
- whether logs or recorded commands can expose secrets
- whether no-op and dry-run modes preserve their promise

Do not infer ambiguous recovery state merely to continue automatically. When the
program cannot prove that an action is safe, stop without further mutation and
give concrete recovery guidance.
