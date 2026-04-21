# Methodology

## Contents

- [Goal](#goal)
- [What To Automate](#what-to-automate)
- [Collaborative Analysis](#collaborative-analysis)
- [Working States](#working-states)
- [Row-Level Fields](#row-level-fields)
- [Review Order](#review-order)
- [Choosing An Initial Suite](#choosing-an-initial-suite)
- [Decision Buckets](#decision-buckets)
- [Special Tracking Buckets](#special-tracking-buckets)
- [Completeness Check](#completeness-check)

## Goal

Run the same audit protocol across Pulumi repos while allowing the ownership model to change by repo type.

The protocol is:

1. Discover active tests.
2. Trace provenance from test to introducing commit and PR.
3. Record row-level metadata for every active test.
4. Classify each row into a disposition.
5. Roll those dispositions up into decision buckets.
6. Act on the resulting removal, rewrite, upstream, and conditional-run queues.

Treat steps 3 through 5 as iterative. It is normal to revisit a row after new evidence appears.

## What To Automate

Automate:

- test discovery
- provenance scanning
- commit-to-PR resolution
- materialization into JSON
- report rendering
- validation that every test has a row

The bundled scripts now cover the standard Go-heavy Pulumi workflow for discovery, provenance, and markdown report generation.

Treat provenance as evidence, not ground truth. In particular, file moves can make the first “introducing PR” look like a bulk relocation rather than the true behavior-introducing change. Use moved-path hints and manual spot checks when the provenance smells wrong.

Do not automate:

- behavior-under-test judgments
- ownership calls
- replacement coverage decisions
- final disposition

Those depend on current repo structure, upstream state, and maintainer intent.

## Collaborative Analysis

This skill is designed for a shared user-agent audit loop.

The normal pattern is:

1. gather evidence
2. explain the evidence
3. compare plausible interpretations
4. propose a recommendation
5. either lock the row or keep it provisional

Do not force a final row-level disposition too early.

## Working States

Before the final disposition is clear, use optional working states such as:

- `Needs more evidence`
- `Likely local keep`
- `Likely upstream-owned`
- `Likely delete candidate`
- `Likely rewrite cheaper`
- `Awaiting maintainer judgment`

These help the conversation move forward without pretending the analysis is already done.

## Row-Level Fields

Every active test should end with these fields:

- `Behavior Under Test`
- `Layer Under Test`
- `Recommended Home`
- `Cadence`
- `Disposition`
- `Confidence`
- `Needs Migration Spike`
- `Upstream Plan Ready`
- `Replacement Coverage`
- `Evidence Needed`
- `Root Cause`
- `Obsolete Since`
- `Last Reviewed`
- `Introduced In`

## Review Order

Review in this order:

1. Confirm the test is active.
2. Read the test body.
3. Read the introducing PR.
4. Locate the fix or workaround the test was added to protect.
5. Check whether that fix still exists.
6. Decide whether the behavior is local, upstream, or shared.
7. Decide whether the current test shape is the cheapest useful one.
8. Assign the row-level review fields.

## Choosing An Initial Suite

For unfamiliar repos, do not start by auditing every test root.

Choose one coherent first slice:

- a high-cost example suite
- a provider-local manual or 2e2 suite
- a focused feature area such as `tests/sdk/yaml`
- a cluster with obvious patch, upgrade, or broad-smoke candidates

The best first slice is the one that gives the user a legible report and an obvious next conversation, not the one with the most files.

## Decision Buckets

Use the same decision buckets across repos:

- `Tests We Can Remove`
- `Rewrite Cheaper`
- `Ready To Move Upstream`
- `Keep - Conditionally`
- `Keep - Always Run`
- `Still Needs Analysis`

These give maintainers an action queue instead of only a descriptive taxonomy.

## Special Tracking Buckets

These are optional, but useful when present:

- `patch-backed`
  Keep while the patch exists. Remove or reclassify when the patch is dropped.
- `upgrade-oriented`
  Keep, but run mainly for upgrade or version-bump workflows.
- `replay-based`
  Cheap provider-RPC or fixture-based tests that should usually not be treated like live cloud examples.
- `broad-smoke`
  Intentional confidence representatives. Keep the matrix small and explicit.

## Completeness Check

Do not trust counts until all active tests have row-level review data.

Use two distinct checkpoints:

- progress-valid
  The machine-readable inventory is sane, reviewed rows are internally complete, and the current report is safe to discuss.
- audit-complete
  Every active test has row-level review data, bucket counts add up, and unresolved rows either do not exist or are explicitly allowed.

A repo is not audit-complete if:

- discovered tests are missing from metadata
- decision buckets do not add up to active tests
- “still needs analysis” rows remain without an explicit follow-up plan
