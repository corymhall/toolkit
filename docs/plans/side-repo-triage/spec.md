# Side-Repo Central Issue Triage

## Overview

We will add central issue triage automation in this private side repository to monitor newly opened issues across approximately 50 source repositories, while keeping all triage artifacts and commentary private to this repo.

The workflow will read source issues that currently carry the `needs-triage` label, create or update one corresponding tracking issue in this side repo, and never mutate source issues. Human operators remain responsible for posting final triage comments back to source repos and removing `needs-triage` there.

This design uses GitHub Agentic Workflows SideRepoOps + MultiRepoOps hub-and-spoke patterns, with least-privilege auth (GitHub App token via ESC) for cross-repo reads and safe outputs that restrict writes to this repo only.

## Design

### Architecture

Two workflows run in this side repo:

1. Ingest workflow (`triage-ingest`): scheduled and manually triggerable. It scans configured source repos for open issues labeled `needs-triage`, then upserts tracking issues in this repo.
2. Triage worker workflow (`triage-worker`): operates only on tracking issues in this repo to generate triage analysis/comments for human review.

All source-repo interactions are read-only. All writes are side-repo-local.

### Authentication and Permissions

The workflows use existing org auth patterns:

- ESC step (`pulumi/esc-action`) to fetch GitHub App credentials.
- `actions/create-github-app-token` to mint short-lived GitHub App token.

Permission model:

- Source repos: read-only (issues/metadata required for scan and context gathering).
- Side repo: issue create/update permissions required for tracking issue management.
- Safe outputs enforce that create/update operations can only target the current side repo.
- `allowed-github-references: []` is set for no cross-repo references/backlinks.

### Repository Configuration

Add repository-managed config files:

- `config/triage-repos.yaml`: source repository list (pilot and full set).
- `config/triage-policy.yaml`: SLA buckets, severity normalization, owner/team mapping rules.
- `config/triage-state.json` (or state issue marker): per-repo watermark/checkpoint for scan continuity.

### Ingest Workflow Behavior

For each configured source repo:

1. Query open issues with label `needs-triage`.
2. For each matching source issue, compute deterministic key `owner/repo#issue_number`.
3. Find tracking issue in side repo by key marker.
4. If found: update normalized fields and sync metadata.
5. If missing: create tracking issue using standard template.

Tracking issue body fields:

- Source repository and source issue URL
- Normalized triage summary
- Severity/priority
- Recommended owner/team
- Next action and SLA target
- Sync metadata (`first_seen`, `last_seen`, source state snapshot, dedupe key)

To avoid noisy backlinks, source links in side-repo issues use redirect form:

- `https://redirect.github.com/<owner>/<repo>/issues/<number>`

### Dedupe and Idempotency

Dedupe key is stable and mandatory per tracking issue.

- First run: create one tracking issue per unique key.
- Re-runs: update existing tracking issue, do not create duplicates.
- If source issue remains labeled `needs-triage`, side issue stays active.
- If source issue label is removed or issue is closed, mark side issue as resolved/closed via policy.

### Triage Worker Workflow

The worker runs only on side-repo tracking issues and can:

- Research related/upstream issues.
- Attempt reproduction based on available issue details.
- Propose triage comment content and recommended resolution path.

The worker posts comments only in side-repo tracking issues and updates side-repo status labels (for example `triage:ready-for-human`).

Human workflow remains:

1. Review side-repo triage output.
2. Copy approved comment manually to source issue.
3. Remove `needs-triage` in source repo.
4. Close side-repo tracking issue.

### Observability and Reporting

Each ingest run outputs per-repo counters:

- scanned issues
- matched `needs-triage`
- created tracking issues
- updated tracking issues
- unchanged/skipped
- errors

Workflow summary includes totals and per-repo breakdown.

## Scope

In:

- Side-repo ingest automation for `needs-triage` source issues.
- Side-repo-only tracking issue creation/update with dedupe.
- Side-repo triage worker comments and status transitions.
- Pilot rollout (5 repos) and expansion to full list.
- README + operator runbook documentation.

Out:

- Automatic comments on source issues.
- Automatic source-repo label mutations.
- Automatic source-repo issue edits/closure.
- Any cross-repo references that create backlink noise.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Source issue selection | Scan by `needs-triage` label instead of created-since watermark only | Matches current team process and reduces state complexity for new-issue detection. |
| Workflow split | Separate ingest and triage-worker workflows | Keeps ingestion deterministic and lets triage analysis iterate independently. |
| Source writes | Human-only source updates | Enforces safety and avoids accidental mutation of public/source repos. |
| Auth model | ESC + GitHub App token | Aligns with existing org-approved token minting process and least privilege. |
| Reference handling | `allowed-github-references: []` + redirect URLs | Prevents backlink noise while preserving operator usability. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token scope too broad | Accidental source writes | Use least-privilege GitHub App permissions and safe outputs restricted to side repo. |
| Duplicate tracking issues | Operator confusion and noisy queue | Enforce deterministic dedupe key and mandatory upsert path. |
| Drift between source and side status | Stale triage queue | Reconcile each run; auto-close or flag when `needs-triage` removed. |
| Worker false confidence | Low-quality triage suggestions | Require human approval gate before source comment posting. |

## Testing

Verification plan:

1. Static validation:
   - `gh aw validate` and `gh aw compile` pass for all new workflows.
2. Dry run:
   - Run ingest in dry mode against at least 3 repos and capture created/updated previews.
3. Pilot run:
   - Real run on 5 repos; verify expected tracking issue creation within one interval.
4. Idempotency check:
   - Re-run ingest without source changes; verify `created=0`, only updates/unchanged.
5. Safety check:
   - Audit logs for zero source-repo write operations.

## Open Questions

- What exact schedule interval should production ingest use (`15m`, `30m`, or `60m`)?
- Should side issues auto-close immediately when `needs-triage` is removed, or move to a short grace state first?
- What final taxonomy should be used for severity and owner/team mapping in `triage-policy.yaml`?
