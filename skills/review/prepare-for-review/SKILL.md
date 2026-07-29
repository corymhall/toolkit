---
name: prepare-for-review
description: Perform one author-side pass over the current implementation before independent review, using the active conversation as the source of truth to simplify the change, apply relevant implementation guidance, improve code documentation, and verify focused tests and repository hygiene.
disable-model-invocation: true
---

# Prepare For Review

Perform an author-side self-review pass on the current implementation before submitting for independent review.

> ℹ️ **Scope & Rules:** This is a read-write author pass in the main session. Inspect the diff, simplify code, fix author-owned issues, and run test gates. **Do not launch sidecar agents.**

---

## Author Review Matrix

| Step | Focus Area | Actionable Checklist |
| :--- | :--- | :--- |
| **1. Intent Alignment** | Reconcile with conversation | - Compare implementation against agreed outcomes, constraints, and non-goals.<br>- If unagreed scope decisions appear, ask the user before expanding implementation. |
| **2. Code Simplification** | Remove unnecessary complexity | - Delete dead helpers, unused abstractions, and redundant result types.<br>- Apply the **80/20 Rule:** If a rare edge case adds 80% more code complexity, preserve a conservative fallback and document the limitation. |
| **3. Domain Guidance** | Apply language/domain standards | - Apply domain skills (e.g. `go-development`) to the final diff rather than copying local patterns uncritically. |
| **4. Code Documentation** | Maintainability & comments | - Document exported APIs and non-obvious invariants/tradeoffs.<br>- Explain **why** code exists or what contract it preserves. Omit comments that merely narrate obvious code lines. |
| **5. Hygiene & Validation** | Tests & repository rules | - Ensure tests prove intended behavior and fallbacks.<br>- Run narrowest formatting, lint, and test gates first, then broader repo validation. |

---

## Boundaries & Stop Condition

- [ ] Perform **one** focused pass; do not generate new planning or task artifacts.
- [ ] Ask the user before modifying agreed product scope.
- [ ] Do **not** commit code, post GitHub comments, or invoke `request-review` automatically.
- [ ] **Summary Output:** Finish by reporting: (1) Edits made, (2) Validation run, (3) Accepted limitations, and (4) Items needing user judgment.
