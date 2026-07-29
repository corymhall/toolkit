---
name: capture-decision-context
description: Distill the current conversation into a durable decision note or compact GitHub issue draft that preserves motivation, evidence, tradeoffs, and accepted limitations without generating file-by-file tasks or pseudocode.
disable-model-invocation: true
---

# Capture Decision Context

Preserve critical motivation, rationale, and tradeoffs from the current conversation for future contributors. Produce a decision context artifact, **not** an implementation plan or task list.

---

## Core Rules

1. **Source of Truth:** Use the current conversation as primary truth. Consult the repository only to confirm named facts, links, or file paths. Do not restart investigation.
2. **What to Capture:**
   - Problem, motivation, and desired observable outcome.
   - Key evidence and benchmarks shaping the decision.
   - Accepted choices and why they were selected.
   - Rejected alternatives and why they were discarded.
   - Non-goals, tradeoffs, accepted limitations, and safe fallbacks.
   - Genuine open questions.
3. **What to Omit:**
   - File-by-file task lists, test matrices, or pseudocode.
   - Speculative requirements or easily rediscovered code facts.
   - Assistant proposals not explicitly accepted by the user.

---

## Artifact Templates

### Option 1: Decision Note (Markdown File)

Use this shape for repository documentation (omit empty sections):

```markdown
# <Topic> Decision Context

## Motivation and Desired Outcome
## Relevant Evidence
## Decisions and Rationale
## Tradeoffs, Limitations, and Non-Goals
## Open Questions
## Current Status
## References
```

### Option 2: GitHub Issue Draft

Use this compact shape when snapshotting an investigation into a GitHub Issue:

```markdown
## Problem

## Proposed Direction

## Done When

<details>
<summary>Context and evidence</summary>

### Key Tradeoffs & Rejected Alternatives
### Supporting History & Links

</details>
```

---

## Workflow & Output

- **Default Location:** Draft in chat unless an explicit file path or GitHub issue destination is requested.
- **Handling Uncertainty:** Preserve open questions as unresolved. Do not attempt to resolve uncertainties by guessing.
