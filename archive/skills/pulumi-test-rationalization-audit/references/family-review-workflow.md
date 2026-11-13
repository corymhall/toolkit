# Family Review Workflow

Use this workflow when a cluster of tests clearly belongs together.

## Good Family Candidates

- one patch or workaround protects multiple tests
- one feature family has many similar regressions
- one upgrade or migration surface has a bundle of fixtures
- one smoke matrix has many near-duplicates across languages or examples

## Sequence

### 1. Define the family

Name the shared thing connecting the tests:

- tags
- import normalization
- security-group defaults
- upgrade migrations
- auth/config
- broad smoke

### 2. Write one shared family statement

Explain the common behavior or operational purpose once.

### 3. Split shared evidence from row-specific evidence

Shared:

- common workaround
- common owner
- common cadence
- common replacement strategy

Row-specific:

- one test exercises a narrower edge case
- one test is the chosen smoke representative
- one test became obsolete earlier than the rest

### 4. Decide whether the family should stay together

Keep the family together when the same disposition applies.

Split it when:

- one or two rows are clearly stronger local guards
- one row is already covered upstream
- one row is just broad smoke
- one row still needs a deeper single-test pass

### 5. Record group metadata first

Put the shared behavior, owner, cadence, and recommended home in group metadata.

Use per-test overrides only when needed.

## Guardrail

Do not let family review become mass classification by vibes.

A family-level call is only good if the shared evidence is real and the outliers are surfaced explicitly.

