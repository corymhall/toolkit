---
name: brainstorming
description: "Use before creative work that changes behavior: clarify intent, constraints, and design before implementation."
metadata:
  upstream_repo: https://github.com/obra/superpowers
  upstream_path: skills/brainstorming/SKILL.md
  upstream_commit: 06b92f36820f38175b2ed6ff3f8df45157d54731
  local_notes: Rewritten for spec-centric workflow. Outputs spec.md, not ExecPlan.
---

# Brainstorming Ideas Into Specs

## Overview

Help turn ideas into specs through natural collaborative dialogue.

Start by understanding the current project context, then ask focused questions
to clarify the idea. Once you understand what you're building, write a spec
using the standard template.

Output: `docs/plans/<feature>/spec.md`

## The Process

**Understanding the idea:**
- Explore the current project state first (files, docs, recent commits)
- Ask 3-7 focused questions in a single batch (prefer multiple choice)
- If the user wants a fast path, ask only 3 questions
- Focus on: purpose, constraints, success criteria, scope boundaries

**Exploring approaches:**
- Propose 2-3 different approaches with trade-offs
- Lead with your recommendation and explain why
- Present options conversationally

**Presenting the design:**
- Present the design incrementally in sections (200-300 words each)
- Ask after each section whether it looks right so far
- Be ready to go back and clarify if something doesn't fit
- Cover what's relevant: architecture, components, data flow, error handling

## Writing the Spec

Write to `docs/plans/<feature>/spec.md` using this structure:

```markdown
# <Feature Name>

## Overview
What we're building, why, and for whom.

## Design
How it works. Scale depth to complexity.
For small work: bullet points.
For large work: sub-sections (Architecture, Components, Data Model,
User Flows, Error Handling, Integration Points).
Be specific — name files, functions, patterns from the codebase.

## Scope
In: what this covers.
Out: what we're NOT doing, with rationale.

## Decisions
Key trade-offs. Skip if approach was obvious.
| Decision | Choice | Rationale |

## Risks
What could go wrong. Skip for low-risk work.
| Risk | Impact | Mitigation |

## Testing
Verification approach. Skip if task-level acceptance criteria suffice.

## Open Questions
Unresolved items. Remove if none.
```

**Required sections:** Overview, Design, Scope.
**Optional sections:** Decisions, Risks, Testing, Open Questions.
Only include optional sections when they carry real content.

## After the Spec

- Commit the spec to git (on a feature branch, not main)
- Next steps:
  - `enrich-expansion` — optional: find gaps, auto-fix, ask decisions
  - `delivery-workflow-quick` or `delivery-workflow-planned` — continue through the active delivery workflows

## Key Principles

- **Batch questions** — 3-7 focused questions, not one at a time
- **Multiple choice preferred** — easier to answer than open-ended
- **YAGNI ruthlessly** — cut unnecessary features from all designs
- **Explore alternatives** — 2-3 approaches before settling
- **Incremental validation** — present design in sections, validate each
- **Be flexible** — go back and clarify when something doesn't fit
- **Be specific** — name files, functions, patterns, not generalities
