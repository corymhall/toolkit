---
name: pulumi-test-rationalization-audit
description: Audit and rationalize Go-heavy Pulumi provider or component test suites by producing a row-level inventory, provenance scan, ownership analysis, and decision-bucket report. Use when working in Pulumi bridged providers, native providers, or component libraries and you need to classify expensive, legacy, example, integration, or regression tests into keep, remove, rewrite-cheaper, move-upstream, conditional-run, or always-run buckets.
---

# Pulumi Test Rationalization Audit

## Overview

Use this skill to run the same audit methodology across Pulumi repos such as bridged providers, native providers, and component libraries.

Automate the inventory and provenance steps with the bundled scripts. Keep the actual judgment in handwritten metadata, because ownership, replacement coverage, and disposition are repo-specific decisions.

The bundled discovery and provenance scripts currently support top-level Go tests. For non-Go suites, use the methodology but adapt the inventory and provenance step before trusting row coverage.

This skill is intentionally collaborative. Use it to help a user work through the audit in an iterative, back-and-forth way. Do not treat it as a hands-off pipeline that should silently classify a whole suite without discussion.

If the user is new to the workflow, auditing an unfamiliar repo, or wants a teammate-ready starting point, read [references/first-run.md](references/first-run.md) before doing the first bootstrap.

## Workflow

1. Pick the repo profile before doing any analysis.
   Use [references/repo-profiles.md](references/repo-profiles.md) to choose `bridged-provider`, `native-provider`, or `component-library`.

2. Initialize audit files in the target repo.
   Run `scripts/init_audit_files.py` to create `repo-audit.yaml` and `audit-metadata.yaml` in a chosen audit directory.

3. Discover active tests.
   For Go-heavy Pulumi repos, run `scripts/discover_go_tests.py` against the configured test roots and save the JSON output as the machine-readable inventory.

4. Build provenance for each test.
   Run `scripts/build_go_test_provenance.py` to trace introducing commits with `git log -G`, resolve commits to PRs with `gh api`, and materialize a joined JSON dataset.

5. Fill row-level metadata iteratively.
   Group obvious families together first, then add per-test overrides only when the group metadata is too coarse.
   Use provisional states while reasoning with the user, and only convert them to final row-level dispositions once the evidence is good enough.

6. Generate the markdown report.
   Run `scripts/render_test_report.py`.
   The report should be regenerated from machine-readable provenance plus handwritten metadata, not maintained manually.

7. Validate completeness before acting on results.
   Run `scripts/validate_audit.py` and confirm that every discovered test has:
   - behavior under test
   - owning layer
   - recommended home
   - cadence
   - disposition
   - confidence
   - replacement coverage
   - evidence needed
   - root cause
   - last reviewed

## Collaboration Model

Use this skill as a shared reasoning aid.

- Surface evidence, alternatives, and tradeoffs instead of jumping straight to a verdict on ambiguous tests.
- Make provisional recommendations when the evidence is incomplete.
- Ask the user to confirm only when the consequence is non-obvious, such as deleting a still-live local guard, moving a test upstream, or collapsing a broad smoke matrix.
- Treat the conversation as iterative. It is normal to revisit a row after reading the introducing PR, finding a patch, or checking whether the fix still exists.

Use [references/collaboration-patterns.md](references/collaboration-patterns.md) when the audit feels conversational rather than purely mechanical.

## Core Protocol

Ask the same questions for every test:

1. What exact behavior is this test protecting?
2. Is that behavior local to this repo, or owned elsewhere?
3. Does the original fix or workaround still exist today?
4. Is this the cheapest useful test shape for that behavior?
5. If not, where should the replacement coverage live?
6. Should this test run always, conditionally, or not by default?

Do not skip directly from provenance to deletion. A test is only a good removal candidate once the behavior, owner, and current replacement story are explicit.

## Single-Test Deep Dive

Use a deep dive when a row is ambiguous, medium-confidence, or still under discussion.

Read [references/single-test-deep-dive.md](references/single-test-deep-dive.md) and [references/evidence-checklist.md](references/evidence-checklist.md) for the exact sequence.

Typical triggers:

- `Still Needs Analysis`
- `Medium` confidence
- likely `Move upstream`, but the destination test shape is not concrete yet
- likely `Delete candidate`, but it is unclear whether the original workaround still exists
- conflicting clues between the test body, the introducing PR, and the current repo state

For a single hard test:

1. read the test body
2. read the introducing PR
3. trace the code path or workaround it was guarding
4. check whether that fix still exists
5. identify the likely owning layer
6. identify plausible dispositions
7. compare the evidence with the user
8. record either a final disposition or a provisional working state

## Family Review

Prefer family-level review when tests clearly belong together.

Examples:

- tags or diff-normalization families
- import or upgrade families
- patch-backed families
- broad-smoke examples
- auth/config or region families

Read [references/family-review-workflow.md](references/family-review-workflow.md) before mass-classifying a cluster.

## Repo Profiles

Choose one profile and keep its ownership model consistent throughout the audit.

- `bridged-provider`
  Use for repos like `pulumi-aws`. Read [references/repo-profiles.md](references/repo-profiles.md) for the expected layers and common outcomes.
- `native-provider`
  Use for repos like `pulumi-aws-native`. More tests will usually stay local because there is no bridge bucket by default.
- `component-library`
  Use for repos like `pulumi-awsx`. Expect more ownership to stay in local component logic, underlying provider behavior, or runtime ergonomics.

## Decision Buckets

Use these top-line buckets in the report:

- `Tests We Can Remove`
- `Rewrite Cheaper`
- `Ready To Move Upstream`
- `Keep - Conditionally`
- `Keep - Always Run`
- `Still Needs Analysis`

These are report buckets, not raw dispositions. The raw row-level dispositions should still be things like `Keep`, `Delete candidate`, `Covered upstream`, `Move upstream`, `Rewrite cheaper`, `Do not run by default`, or `Release only`.

## Audit Files

Keep the generated and handwritten layers separate.

- `repo-audit.yaml`
  Repo-level config: repo slug, test roots, profile, workflow names, decision bucket labels, and report paths.
- `audit-metadata.yaml`
  Handwritten group metadata, per-test overrides, review decisions, and optional special tracking buckets.
- `test-provenance.json`
  Machine-readable joined provenance dataset.
- `TEST_PROVENANCE.md`
  Regenerated row-level report.

Use [references/config-schema.md](references/config-schema.md) for the expected file shape.

## Scripts

Set `SKILL_DIR` to the actual loaded skill directory before copying these examples.

### `scripts/init_audit_files.py`

Bootstrap an audit workspace for a new repo.

Example:

```bash
python3 "$SKILL_DIR/scripts/init_audit_files.py" \
  ~/work/pulumi-aws-native/audit \
  --profile native-provider \
  --repo pulumi/pulumi-aws-native \
  --test-root examples \
  --suite-label "examples/*"
```

Repeat `--test-root` when the user wants more than one suite in scope. Presets are optional convenience, not a required part of the workflow.

### `scripts/discover_go_tests.py`

Discover top-level Go tests and emit JSON records with test name, file, path, and line number.

Example:

```bash
python3 "$SKILL_DIR/scripts/discover_go_tests.py" \
  ~/work/pulumi-aws/examples \
  --output ~/work/pulumi-aws/audit/discovered-tests.json
```

### `scripts/build_go_test_provenance.py`

Build introducing-commit, PR, and joined provenance data from `repo-audit.yaml`.

Examples:

```bash
python3 "$SKILL_DIR/scripts/build_go_test_provenance.py" \
  all \
  ~/work/pulumi-aws-native/audit/repo-audit.yaml \
  --repo-root ~/work/pulumi-aws-native
```

```bash
python3 "$SKILL_DIR/scripts/build_go_test_provenance.py" \
  scan-tests \
  ~/work/pulumi-awsx/audit/repo-audit.yaml \
  --repo-root ~/work/pulumi-awsx \
  --limit 20
```

### `scripts/render_test_report.py`

Render `TEST_PROVENANCE.md` from `repo-audit.yaml`, `audit-metadata.yaml`, and the joined provenance JSON.

Example:

```bash
python3 "$SKILL_DIR/scripts/render_test_report.py" \
  ~/work/pulumi-aws-native/audit/repo-audit.yaml \
  ~/work/pulumi-aws-native/audit/audit-metadata.yaml
```

### `scripts/validate_audit.py`

Validate that the audit is complete enough to trust. In complete mode, this fails if tests are still in the `Still Needs Analysis` bucket.

Example:

```bash
python3 "$SKILL_DIR/scripts/validate_audit.py" \
  ~/work/pulumi-aws-native/audit/repo-audit.yaml \
  ~/work/pulumi-aws-native/audit/audit-metadata.yaml \
  --mode progress
```

### `scripts/scaffold_test_review.py`

Print a YAML stub for one test review so the user and agent can fill in the hard analysis together.

Example:

```bash
python3 "$SKILL_DIR/scripts/scaffold_test_review.py" \
  TestSecurityGroupPreviewWarning
```

## References

- Read [references/methodology.md](references/methodology.md) for the end-to-end protocol and the boundaries between automation and judgment.
- Read [references/repo-profiles.md](references/repo-profiles.md) before auditing a new repo family.
- Read [references/first-run.md](references/first-run.md) when the user is starting fresh, onboarding a teammate, or wants a copy-pasteable first session.
- Read [references/config-schema.md](references/config-schema.md) when creating or editing the audit config files.
- Read [references/report-template.md](references/report-template.md) when drafting or regenerating the markdown report.
- Read [references/single-test-deep-dive.md](references/single-test-deep-dive.md) when one row needs a full, evidence-driven analysis.
- Read [references/evidence-checklist.md](references/evidence-checklist.md) when a row feels ambiguous or under-evidenced.
- Read [references/family-review-workflow.md](references/family-review-workflow.md) when working through a cluster of related tests.
- Read [references/collaboration-patterns.md](references/collaboration-patterns.md) when you need help structuring the back-and-forth with the user.

## Guardrails

- Prefer deterministic scripts for discovery and inventory.
- Prefer the bundled provenance/report scripts over ad hoc one-off local scripts when the workflow fits.
- Keep ownership analysis and disposition in handwritten metadata.
- Use provisional states when the evidence is still moving; do not force a final disposition too early.
- Do not assume bridged-provider ownership rules apply to native providers or component libraries.
- Do not let the markdown report become the source of truth if machine-readable provenance or review metadata exists.
- Do not mass-classify tests from age, expense, or provenance alone.
- Do not treat an introducing PR as proof that the guarded fix still exists today.
- Do not silently “solve” ambiguous rows without surfacing the evidence and tradeoffs to the user.
- Keep each audit scope to globally unique Go test names. If duplicate test names exist across files, narrow the scope or extend the tooling before trusting row-level output.
- Validate row coverage before trusting counts.
- Be explicit when the current checkpoint is progress-valid versus audit-complete.

## Starter Prompt

Use this as the default posture when a teammate is starting from scratch:

`Use $pulumi-test-rationalization-audit to bootstrap an audit in this repo, build provenance, and then help me review the biggest test families one at a time. Keep the process collaborative and do not silently classify ambiguous tests.`
