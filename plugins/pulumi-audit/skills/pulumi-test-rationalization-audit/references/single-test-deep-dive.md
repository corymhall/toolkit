# Single-Test Deep Dive

## Contents

- [When To Use This](#when-to-use-this)
- [Sequence](#sequence)
- [Output Shape](#output-shape)
- [Escalation Rule](#escalation-rule)

Use this workflow when a single test still needs real analysis.

## When To Use This

Use a deep dive when any of these are true:

- the row is `Still Needs Analysis`
- the confidence is `Medium`
- the likely owner is disputed
- the current workaround may have been removed
- the test looks upstream-owned, but the upstream replacement is still fuzzy
- deletion seems attractive, but the exact behavior under test is still unclear

## Sequence

Work in this order.

### 1. State the behavior in one sentence

Read the test body and say what it is actually checking, not what the file name suggests.

Good:

- “Importing old security-group state into a new program should not emit preview-element warnings after explicit description defaults are materialized.”

Bad:

- “Security group regression.”

### 2. Read the introducing PR

Capture:

- what bug or behavior motivated the test
- what fix or workaround landed with it
- whether the PR itself points to a different repo as the true owner

### 3. Find the concrete code path

Identify the actual code or patch the test appears to protect.

Examples:

- local provider transform
- overlay
- schema default
- bridge diff/check logic
- Pulumi engine lifecycle behavior
- patch in `patches/`
- broad smoke only, with no local hook

### 4. Check whether that fix still exists

Do not assume the original fix is still live.

Check:

- whether the patch is still present
- whether the feature flag or rollout guard is still needed
- whether a provider-wide default superseded a resource-specific regression
- whether the fix moved upstream

### 5. Identify likely owners

List the most plausible owners, usually one to three.

For each owner, say:

- what evidence supports it
- what evidence cuts against it

### 6. Compare plausible dispositions

Usually compare two or three candidates:

- `Keep`
- `Delete candidate`
- `Covered upstream`
- `Move upstream`
- `Rewrite cheaper`
- `Do not run by default`
- `Release only`

Do not pretend there is only one possible answer if the evidence is mixed.

### 7. Decide whether the current test shape is the cheapest useful one

Ask:

- is this a live cloud example protecting a behavior that could be a replay, unit, or fixture test?
- is this only broad confidence smoke?
- is there already upstream coverage for the same behavior?
- if the row stayed here, should it run always or conditionally?

### 8. Record either a final review or a provisional state

If the evidence is good enough, fill the final row-level fields.

If not, record a provisional state and the exact missing evidence.

## Output Shape

For a deep dive, the useful output is:

1. one-sentence behavior under test
2. short provenance summary
3. concrete code path or workaround
4. whether it still exists
5. candidate owners
6. candidate dispositions
7. recommended next call
8. confidence level

## Escalation Rule

Pause and re-check with the user when:

- deleting the test would remove the only known local guard
- moving it upstream implies non-obvious ownership or coordination
- the evidence supports materially different conclusions
