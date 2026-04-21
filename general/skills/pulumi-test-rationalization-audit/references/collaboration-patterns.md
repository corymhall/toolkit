# Collaboration Patterns

This skill is meant to support a conversation, not replace one.

## Default Conversation Shape

For an ambiguous row, structure the response like this:

1. what we know
2. what is still uncertain
3. the two or three plausible interpretations
4. the recommendation that currently looks strongest
5. what evidence would change that recommendation

## Good Moves

- summarize the test in plain language first
- name the concrete evidence before naming the conclusion
- present alternatives when the evidence is mixed
- use provisional wording when confidence is not high
- narrow the decision for the user instead of asking an open-ended question

## Good Escalation

Pause and align with the user when:

- deleting the row would be hard to undo
- moving it upstream depends on another repo’s maintainers
- the evidence supports two materially different outcomes

Useful phrasing:

- “The strongest reading is X, but Y is still plausible because…”
- “I think this is likely a delete candidate, unless we find a still-live local workaround.”
- “This looks upstream-owned, but the replacement shape is still too fuzzy for a final move-upstream call.”

## Bad Moves

- present provenance as if it were ownership proof
- collapse uncertainty too early
- jump from expensive to removable without naming protected behavior
- ask the user to redo the evidence gathering that the agent can do directly

## Collaborative Goal

The goal is not “the agent decides.” The goal is “the user and agent can see why the current recommendation is what it is.”

