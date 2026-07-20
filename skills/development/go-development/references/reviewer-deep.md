# Go Reviewer Deep Contract

Use this contract for an independent `go_reviewer` sidecar. It reviews manual Go
design judgment, not formatter, linter, compiler, or analyzer output. The author
session should run repository tooling before independent review when practical.

## Context And Calibration

Read the repository's applicable instructions, minimum Go version, generated and
upstream boundaries, and the concise intended behavior supplied by the main
session.

Classify local precedent before reporting it:

- Follow hard compatibility, generation, framework, and workflow constraints.
- Do not request broad migration of tolerated legacy architecture from a narrow
  change.
- Report newly introduced legacy-style complexity when a simpler local design
  fits without breaking those constraints and the cost is concrete.

Do not report:

- formatting, imports, spelling, routine naming, mechanical modernization, or
  other findings repository tooling should own
- generated, vendored, or upstream code as handwritten house style
- pre-existing style debt untouched by the change
- hypothetical features or edge cases outside the claimed behavior

## Review Questions

### Simplicity And Packages

- Is the control flow direct and understandable?
- Did new packages, layers, owner types, state machines, options, or generic
  machinery earn their cost for the current behavior?
- Does the change deepen `service`/`repository`/`manager` layering or create a
  catch-all utility package without a real domain boundary?
- Can a safe fallback or explicit stop replace speculative automatic recovery?

### Interfaces, APIs, And Ownership

- Does each new interface serve a real consumer or narrow external boundary?
- Is the interface defined where it is consumed, unless compatibility requires
  otherwise?
- Is the exported surface no larger than callers need?
- Are constructors, pointers, maps, slices, protobufs, and state values clear
  about mutation, aliasing, and lifecycle?
- Did testability produce a dependency framework larger than the behavior being
  tested?

### Errors And Effects

- Do operational failures return actionable errors while preserving identities
  callers rely on?
- Are errors logged or handled once at an appropriate boundary?
- Are panic, process exit, and assertions limited to genuine invariants?
- For filesystem, process, Git, network, environment, and remote API effects, is
  ordering and partial-failure behavior safe and understandable?
- Can retries, reruns, dry-runs, and ambiguous recovery mutate or discard state
  unexpectedly?

### Context And Concurrency

- Does cancelable work propagate the caller's context?
- Does every goroutine have ownership, termination, failure observation, and a
  completion policy?
- Is fan-out bounded when input controls work volume?
- Are channels and locks chosen to make the invariant clear, with safe lock
  scope and shared-state ownership?

### Tests And Documentation

- Do tests prove the changed behavior, regression, and meaningful fallback at
  the right repository layer?
- Could a test pass without exercising the intended discriminator?
- Is test structure clear without unnecessary matrices, mocks, or fixtures?
- Are important exported contracts and non-obvious invariants, lifecycle,
  ownership, errors, and safety tradeoffs documented?

## Finding Threshold

A blocking finding requires a correctness, security, data-loss, compatibility,
or serious lifecycle failure. A maintainability finding needs a concrete cost in
new code, not merely a different preference. If fixing an observation requires a
repository-wide migration unrelated to the change, do not present it as an
actionable finding.

For each finding include:

- severity
- file and line
- concrete behavior or maintenance cost
- the smallest responsible correction
- verification evidence

When there are no meaningful Go-specific findings, say so and report only
material residual uncertainty. Return the review itself, not process narration.
