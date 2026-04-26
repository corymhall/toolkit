# Codex Evaluation Lens

Use this lens when evaluating workflows, skills, formulas, or practices from
other agent systems and deciding whether they fit this repo.

## Core Principle

Prefer workflows that amplify Codex's strengths.

## Default Assumptions

- one main session should own implementation work
- sidecar agents should help with bounded work, parallel research, or review
- durable artifacts should capture decisions, status, and audit points, not
  every tiny implementation detail
- heavyweight review should happen at meaningful workflow boundaries
- milestone-oriented tracking is usually a better fit than hyper-detailed
  task-by-task orchestration

## Questions To Ask Before Porting A Pattern

1. Why did this pattern exist?
2. Does it still help when the main session can hold the whole build?
3. Is the plan serving the human and the system, or compensating for context limits?
4. Should sidecars assist, or own the work?
5. Is review happening at the right granularity?
6. What is the smallest valuable adaptation?

## Prompt And Skill Fit

When the pattern is a reusable prompt or skill, also apply
`docs/skill-prompting-lens.md`.

Treat skills as model-sensitive interventions, not reusable truths. Adapt them
to Codex, keep broad general skills minimal, and preserve domain-specific
judgment only where it has observable workflow value.

## Patterns We Generally Prefer

- explicit workflow stages over hidden prompt magic
- main-session implementation with clear ownership
- lightweight milestone tracking
- structured review artifacts
- final or milestone-boundary review when risk justifies it
- selective reuse of external ideas

## Patterns To Treat Skeptically

- mandatory fresh subagent per task
- giant, ultra-explicit task plans as the default execution artifact
- workflow designs built around constant session reset assumptions
- review loops after every micro-task
- whole-system cloning for parity with another framework
