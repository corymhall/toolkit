# <Feature Name>

## Overview

What we're building, why it matters, and for whom.

For small work this might be 2-3 sentences. For larger work it should frame the
problem, intended users, and value in 1-3 short paragraphs.

## Goals

The outcomes this work must achieve.

- G-1: <primary outcome>
- G-2: <secondary outcome>

Goals should describe success, not implementation mechanics.

## Scope

In:
- <what this spec covers>

Out:
- <what we are explicitly not doing, with brief rationale>

For small work this can be brief. For larger work, be explicit so execution can
distinguish "missing" from "intentionally excluded."

## Constraints

Important boundaries that shape the solution.

- C-1: <technical / business / rollout / compatibility constraint>
- C-2: <constraint>

Use this for constraints that are real but are not quite strong enough to be
`Non-Negotiables`.

## Acceptance Criteria

How we will know the work is successful.

- A-1: <observable outcome or verification target>
- A-2: <observable outcome or verification target>

Acceptance criteria should be concrete and testable where possible.

## User Stories / Scenarios

Include this section when user-facing behavior matters. Remove it if the work
is purely internal and this would be redundant.

- As a <user>, I can <do thing>, so that <outcome>.
- Scenario: <important path or edge case>

## Design

How it works. Scale depth to match complexity.

For small work: a few bullets with concrete file paths and patterns.

For large work: use only the sub-sections that matter.

### Architecture

High-level structure. How this fits the existing system. Key components and
their relationships.

### Components

Detailed component breakdown. For each: responsibility, interface, and key
considerations.

### Data Model

Schema or storage design. New fields, relationships, migrations, and data
movement concerns.

### User Flows

Step-by-step behavior for important paths. Include error recovery where needed.

### Error Handling

What can go wrong and how it should be handled.

### Integration Points

How this connects to the existing codebase. Name real files, types, APIs,
registries, and patterns where possible.

## Non-Negotiables

Hard requirements with no exceptions.

- [N-1] <hard requirement>
- [N-2] <hard requirement>

## Forbidden Approaches

Explicitly disallowed approaches and why they are banned.

- [F-1] <disallowed approach> — <why>
- [F-2] <disallowed approach> — <why>

## Decision Log

Every material trade-off should be serialized here with stable IDs.

| Decision ID | Topic | Chosen Option | Rejected Alternatives | Rationale | Status |
|-------------|-------|---------------|------------------------|-----------|--------|
| D-1 | <topic> | <choice> | <alt A; alt B> | <why> | Resolved/Deferred |

If no trade-offs exist, include:

`| D-0 | none | n/a | n/a | No material trade-offs identified | Resolved |`

## Traceability

How the spec was formed and where critical ideas came from.

| Spec Element | Source | Notes |
|--------------|--------|-------|
| Goals | <user / docs / exploration> | <how captured> |
| Constraints | <user / codebase / prototype> | <why included> |
| Design subsection X | <dialogue / codebase / prototype> | <downstream impact> |
| Decision D-1 | <trade-off discussion> | <what it affects> |

## Risks

Include only if there are meaningful risks.

| Risk | Impact | Mitigation |
|------|--------|------------|
| | | |

## Testing

How this will be verified. Include high-signal scenarios, validation commands,
or evidence expectations. Remove if the acceptance criteria already make this
fully obvious.

## Open Questions

Only include unresolved items that still matter.

- [ ] <question>
