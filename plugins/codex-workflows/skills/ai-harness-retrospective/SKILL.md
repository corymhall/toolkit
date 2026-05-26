---
name: ai-harness-retrospective
description: Evaluate a real AI-assisted work session against the repo-local harness, classify reusable misses, and update or propose updates to docs, skills, scripts, MCP/tooling, or sensors. Use after substantial work, review feedback, failed validation, or human correction in a repo with an AI harness.
---

# AI Harness Retrospective

Use this after real work to keep a repo-local AI harness improving. The goal is
to convert recurring friction into deterministic harness changes without
turning one-off context into permanent process.

## Read First

If present, read:

- `AGENTS.md`
- `docs/ai-harness/harness-manifest.md`
- `docs/ai-harness/README.md`
- the skill or harness doc that should have guided the session
- the relevant diff, review comments, failed commands, or human corrections

If the repo has no harness skeleton, recommend `ai-harness-bootstrap` instead of
inventing an ad hoc retrospective structure.

## Reconstruct The Session

Capture only the facts needed to evaluate the harness:

- task type and owning layer;
- files changed;
- skill or doc consulted;
- commands selected and run;
- review findings;
- human corrections or clarifications;
- generated-file, test-selection, source-boundary, or tooling mistakes;
- any repeated manual step that could be deterministic.

## Classify Misses

For each meaningful miss, choose one bucket:

- **doc update**: missing or stale repo knowledge.
- **skill update**: wrong trigger, missing workflow step, or bad output shape.
- **deterministic script/check**: repeated mechanical step or drift check.
- **MCP/tooling addition**: external system or structured data access gap.
- **sensor/evaluator**: review or validation should catch this automatically.
- **no harness change**: one-off context, already covered guidance, or not worth
  encoding.

Be conservative. Encode lessons that are likely to recur.

## Update Rules

- Prefer patching an existing doc or skill before adding a new surface.
- Keep `AGENTS.md` as a routing map, not a detailed playbook.
- Update the harness manifest when active docs, skills, tools, generated outputs,
  or known gaps change.
- If changing review automation or generated workflow sources, run the repo's
  required compile/generation command.
- If the retrospective reveals a false harness claim, fix the claim before
  adding new guidance.
- If a larger tool or sensor is needed, create issue text or acceptance criteria
  instead of half-building it.

## Output

Return one of:

- `No harness change needed`, with the reason.
- Exact doc or skill patch, with validation.
- Proposed script/tool/sensor, with acceptance criteria.
- Follow-up issue text for a larger harness improvement.

When edits are made, include:

- what session miss the edit addresses;
- why it is likely to recur;
- files changed;
- validation run;
- residual gaps.

