# Base Pack Owner-Session Surface

This note defines the first local `base` pack surface to review before prompt
or formula text is finalized.

## Proposed Ownership

The local `base` pack should own:

- the long-lived owner-session prompt for larger work
- shared prompt fragments that are safe across trust classes
- safe common formulas that are not specific to `work` or `personal`
- shared scripts or setup helpers that are neutral across trust classes

The local `base` pack should not own:

- branch-only worker submit behavior
- direct-commit or merge-friendly personal behavior
- work-repo-specific pool worker policy

## Proposed Initial Asset Inventory

### Prompts

| Path | Purpose | Notes |
|------|---------|-------|
| `prompts/owner-session.md.tmpl` | Long-lived owner-session path for larger work | New local prompt; review wording before using it |
| `prompts/shared/command-glossary.md.tmpl` | Shared command vocabulary | Candidate local fragment |
| `prompts/shared/operational-awareness.md.tmpl` | Shared operational guardrails | Candidate local fragment |
| `prompts/shared/approval-fallacy.md.tmpl` | Shared “finish the work” behavior | Candidate local fragment |
| `prompts/shared/capability-ledger.md.tmpl` | Shared ownership/history framing | Candidate local fragment |

### Formulas

| Path | Purpose | Notes |
|------|---------|-------|
| `formulas/README.md` | Tracks which formulas should move into `base` | M2 review artifact only |
| `delivery-workflow-planned` | Candidate safe common formula | Planning-first, not trust-class-specific |
| `mol-review-implementation` | Candidate safe common formula | Review lane logic may stay shared |

### Shared Scripts

| Path | Purpose | Notes |
|------|---------|-------|
| `scripts/README.md` | Tracks neutral setup/helper scripts | No concrete script commitment yet |

## Review Questions

- Which shared prompt fragments are truly neutral across `work` and `personal`?
- Should the owner-session prompt be a new local asset or a tailored fork of an
  existing Gastown/Gas City prompt?
- Which formulas belong in `base` versus staying in repo-local workflow space?
- Is there any controller/order behavior that should be modeled as docs only in
  M2 rather than as a pack-owned asset?
