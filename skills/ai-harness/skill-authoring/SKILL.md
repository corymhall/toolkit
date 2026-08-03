---
name: skill-authoring
description: Create, revise, de-slopify, or review Agent Skills while preserving useful behavior and requiring evidence for added prompt weight. Use explicitly for skill authoring, semantic prompt review, compression passes, or deciding whether a skill should exist.
disable-model-invocation: true
---

# Skill Authoring

Build the smallest durable skill that changes agent behavior. Do not optimize for
line count, completeness, or polished prose in isolation.

Read the repository instructions and the
[skill prompting lens](references/skill-prompting-lens.md). Inspect the target
skill, its references, and relevant history before asking the user for context.

## Mode

- **New:** decide whether observed behavior justifies a skill, then author it.
- **Revise:** correct a skill using field evidence or a concrete defect.
- **De-slop:** remove prompt weight without losing domain judgment.
- **Review:** report semantic findings only; do not edit.

## Change Contract

Before editing, identify:

1. **Evidence:** the recurring failure, human correction, repository fact, or
   expert behavior motivating the change.
2. **Intervention:** the decision or action the skill should change, including
   positive triggers and important non-triggers.
3. **Preserve:** domain facts, evidence gates, counterfactuals, boundaries,
   stopping conditions, and durable artifacts that must survive.
4. **Non-goals:** generic behavior, rare cases, and ceremony not justified by
   the evidence.
5. **Success evidence:** a realistic task or field observation that would show
   the intervention helped.

For a new skill, stop when no meaningful intervention remains after removing
behavior the model already performs. For revision or de-slop work, classify
existing instructions as `preserve`, `remove`, or `uncertain`; resolve material
uncertainty with the user before editing.

## Edit

- Keep one owner for the edit. Do not give another model an open-ended "review
  and fix" request.
- Require field evidence, a repository fact, an external contract, or a concrete
  failure mode for every addition. Delete unsupported additions.
- Preserve domain judgment before compressing prose. A shorter skill with a
  missing gate is a regression.
- Use references only for conditionally loaded detail; do not repeat required
  rules in both `SKILL.md` and a reference.
- Keep outputs task-specific. Do not impose universal fields on helpers that
  cannot or should not produce them.
- Verify claims such as `always`, `never`, `must`, shared schemas, and exhaustive
  lists against every relevant path.
- Fix deterministic failures in the owning tool or repository interface instead
  of teaching the skill a workaround when possible.

## Compare

Inspect the base-to-candidate diff and account for behavior added, removed, and
changed; evidence for additions; reasons for removals; weakened preserved rules;
and contradictions across descriptions, instructions, references, and outputs.
For revisions, compare base and candidate decisions and evidence, not writing
style.

## Review Mode

Review read-only against the change contract. Report only:

1. lost or weakened behavior;
2. unsupported additions, duplicated ceremony, or contradictions;
3. trigger mistakes, impossible commands, or outputs that overclaim evidence.

Stop after findings. The author verifies and applies accepted findings. Use
`harness-evaluation` separately after real sessions or human correction; do not
invoke it automatically.

## Finish

Report behavior added, preserved, and intentionally removed, plus decisions that
still need user judgment.
