---
name: capture-decision-context
description: Distill the current conversation into a durable, implementation-light decision note or compact GitHub issue draft that preserves motivation, evidence, rationale, tradeoffs, accepted limitations, and open questions without turning session details into an authoritative specification or implementation plan.
disable-model-invocation: true
---

# Capture Decision Context

Preserve the parts of the current conversation that a future agent or
contributor would otherwise lose. Produce a decision/context artifact, not a
complete implementation specification.

Use the conversation as the source of truth. Consult the repository only to
confirm named facts, links, current status, or the appropriate destination; do
not restart planning or broaden the investigation. If a repository-note
destination is unclear, ask the user where it should live.

Capture only what adds durable value:

- the problem, motivation, and desired observable outcome
- evidence that materially shaped the discussion
- accepted decisions and why they were chosen
- rejected alternatives when the reason matters later
- constraints, non-goals, tradeoffs, accepted limitations, and safe fallbacks
- genuinely open questions
- concise status, validation evidence, and high-value references when useful

Distinguish user-accepted decisions from assistant proposals, rejected ideas,
and unresolved questions. Do not promote suggestions or speculation into
requirements.

Keep the artifact implementation-light. Avoid file-by-file tasks, exhaustive
edge-case or test matrices, detailed pseudocode, speculative requirements, and
facts that are easy to rediscover. Keep an implementation detail only when it
records an external contract, settled constraint, consequential tradeoff, or
rationale for rejecting an alternative.

## Decision Note

Adapt this shape and omit empty sections:

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

## GitHub Issue Draft

When the user wants to snapshot the investigation as an issue, keep the visible
body compact and move supporting context into an expandable section. Include a
proposed direction only when the user accepted it or label it explicitly as
provisional. Include `Done when` only when it clarifies the observable outcome.

```markdown
## Problem

## Proposed direction

## Done when

<details>
<summary>Context and evidence</summary>

### Relevant evidence and history
### Tradeoffs, limitations, and rejected directions

</details>
```

Omit inapplicable headings. Make every visible sentence change the reader's
understanding of the current problem or desired outcome. Keep only the most
relevant history, evidence, rationale, tradeoffs, limitations, rejected
directions, and links in the details section; do not copy the full session note.
Label API or architecture sketches as proposals unless the user settled them.

Draft in chat by default. Create or post the issue only when the user explicitly
asks, and do not also create a repository context note unless requested.

Prefer a short concrete artifact over comprehensive session summarization.
Preserve uncertainty rather than resolving it by inference. A future agent
should use the artifact with the current repository and maintainer conversation,
not treat it as authoritative implementation instructions.
