# <Feature Name> Decomposition Plan

## Planning Intent

What this decomposition is optimizing for and what output granularity is
expected.

- Output granularity: <feature beads / workstreams / integration bead>
- Primary optimization: <parallelism / ownership boundaries / risk isolation>

## Workstreams

### <Workstream / Feature>

Why it exists:
- <purpose>

Scope covered:
- <what this workstream owns>

Likely files / systems touched:
- <major code areas>

Acceptance signal:
- <how we know this workstream is complete enough>

### <Workstream / Feature>

Why it exists:
- <purpose>

Scope covered:
- <what this workstream owns>

Likely files / systems touched:
- <major code areas>

Acceptance signal:
- <how we know this workstream is complete enough>

## Sequencing

Dependency table:

| Blocked Workstream | Blocked By | Reason |
|--------------------|------------|--------|
|                    |            |        |

Notes:
- merge-gated dependencies vs code-order dependencies
- parallelism opportunities
- critical path concerns

## Cross-Cutting Concerns

- testing / validation
- migrations / rollout
- docs / operational work
- integration or final validation work that spans workstreams

## Open Planning Questions

- <questions that still affect decomposition quality>
