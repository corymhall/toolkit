---
name: workaround-investigation
description: "Investigate practical workarounds for provider issues after the ownership boundary is already clear enough to act, or when the user explicitly asks for workaround help. Use when Codex needs to keep going past attribution, look for narrow mitigations or behavioral guards, evaluate whether a workaround is realistic, and report the tradeoffs without pretending the final fix is already known."
---

# Workaround Investigation

Use this skill when the human is not done at attribution and needs a practical
way forward.

This skill is for narrowing workable mitigations, not for writing polished
upstream or downstream PR handoff material.

Stay in the workaround lane. Do not reopen broad triage unless the workaround
work exposes a real contradiction in the current understanding.
Prefer `triage-provider-issue` first unless a prior pass already established
that workaround work is the next best action or the user explicitly invoked
this skill.

Read `references/workaround-ladder.md` before editing.

## Goal

Find the narrowest credible workaround that changes the user's outcome without
claiming more certainty than the evidence supports.

## Workflow

1. Restate the failure boundary.
   What exact behavior must the workaround avoid, suppress, normalize, or
   redirect?
2. Identify the narrowest workaround surfaces.
   Examples: config change, lifecycle flag, provider guard, normalization,
   state shaping, alternate resource flow.
3. If the strongest workaround surface lives in another repo, move there and
   continue instead of stopping.
4. Prefer practical mitigations over elegant theories.
5. Validate the workaround if safe and possible.
6. Report the tradeoffs and what remains unknown.

## Operating Rules

- Do not restart attribution from scratch unless the workaround work exposes a
  real contradiction.
- Prefer narrow behavioral guards over sweeping redesign ideas.
- Distinguish between:
  - "this is a plausible workaround idea"
  - "this was validated locally"
  - "this looks safe enough to recommend provisionally"
- If a workaround depends on credentials or a long-running environment, stage
  the artifact and report what still needs validation.
- If both an upstream and downstream workaround surface exist, compare them in
  terms of practicality and user impact rather than ideology.

## Deliverable

Leave behind:

- current state
- confidence
- what is settled
- what is not settled
- next best action
- the workaround candidates considered
- the candidate that currently looks best
- what was validated
- what remains risky or unknown
- the next best validation step
- what blocked execution, if anything
- workaround status
