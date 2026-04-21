# Report Template

Use this as the high-level report structure.

## Status

- parent issue
- audit issue
- row-level source of truth
- whether the audit is fully classified

## How To Use These Docs

- baseline inventory doc
- layer or ownership doc
- row-level provenance doc
- machine-readable JSON input

## Headline Counts

- active tests traced
- broad-smoke tests tracked
- patch-backed tests tracked
- upgrade tests tracked
- replay tests tracked

## Decision Buckets

Render counts for:

- `Tests We Can Remove`
- `Rewrite Cheaper`
- `Ready To Move Upstream`
- `Keep - Conditionally`
- `Keep - Always Run`
- `Still Needs Analysis`

## Per-Bucket Tables

Each row should include:

- test
- behavior under test
- layer under test
- recommended home
- cadence
- disposition
- confidence
- needs migration spike
- replacement coverage
- evidence needed
- root cause
- obsolete since
- last reviewed
- introduced in

## Optional Operational Sections

Add these when relevant:

- `Live Patch-backed Tests`
- `Upgrade Tests`
- `Provider RPC Replay Tests`
- `Other Conditional-Run Tests`

## Closing Sections

- removal checklist
- iterative review workflow
- open questions or next tracks

