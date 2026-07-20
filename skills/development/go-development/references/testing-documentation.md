# Go Testing And Documentation Judgment

Use this reference when test architecture, proof quality, or maintainer-facing
contracts are central to the change.

## Test The Contract

Start with the regression or user-visible behavior. A useful test should fail
for the defect or missing behavior and pass for the intended reason. Prefer
assertions on outputs, state transitions, effects, and errors over assertions on
private helper structure.

Match the test surface to the risk:

- pure unit tests for calculations and decisions
- package tests for API and ownership behavior
- repository harnesses for generated assets, protocol setup, or external tools
- integration tests only when the boundary itself is the uncertainty

Do not duplicate unit matrices as live tests. One deterministic boundary test is
often more valuable than several expensive smoke tests that may not exercise the
discriminator.

## Choose Test Structure Deliberately

Use table-driven tests when several cases share setup and assertion shape. Keep a
specialized test separate when its lifecycle or proof is easier to understand
linearly. Test count alone does not justify a table.

Failure messages should make the relevant input, result, and expectation clear.
Use helpers only when they remove meaningful repetition without hiding the
behavior under test.

Test failure, cancellation, partial-result, and fallback paths that the change
owns. Do not add exhaustive cases for deliberately unsupported behavior merely
to make a matrix complete.

## Prefer Small Seams

Use the smallest seam that makes the real behavior deterministic:

- direct parameters or functions
- `t.TempDir` for filesystem behavior
- `httptest` for HTTP boundaries
- a narrow consumer interface for an external dependency
- repository-native replay, fixture, or cross-test harnesses

Do not abstract an entire filesystem, clock, process environment, or client
hierarchy when a local seam suffices. Conversely, do not mutate package globals
when tests can run concurrently or multiple instances are valid.

Generated mocks, testify, golden files, and other established tools may be hard
repository constraints. Use them where required without treating them as a
generic recommendation. Review golden changes as behavioral evidence rather
than accepting them mechanically.

## Documentation Preserves Reasoning

Document exported APIs where callers need a stable contract. For important
internal code, explain information that is not evident from syntax:

- why the code or abstraction exists
- invariants and ownership
- lifecycle, cancellation, and cleanup
- error and partial-result behavior
- safety or compatibility constraints
- deliberate conservative fallback and accepted limitations
- where generated or source metadata originates

Examples are valuable when they make data flow, wildcard paths, configuration,
or API usage substantially easier to understand.

Avoid comments that merely restate function names or individual statements.
Delete stale comments when the implementation changes. The author session is
usually best positioned to write the reasoning because it retains the
conversation that produced the design.
