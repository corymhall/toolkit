# Codex Model Workflow Lens

Use this lens when a workflow's model or harness assumptions may not fit a
Codex-family coding model in the current runtime.

Here, **Codex-family model** means the OpenAI coding model, whether it is
accessed through Codex CLI, Pi, or another harness. Name **Codex CLI**, **Pi**,
or the **current harness** explicitly when the behavior comes from the runtime
rather than the model.

## Core Principle

Prefer workflows that amplify the active Codex-family model's strengths and fit
the current harness.

## Default Assumptions

- one main model session should own implementation work
- sidecar agents should help with bounded work, parallel research, or review
- durable artifacts should capture decisions, status, and audit points, not
  every tiny implementation detail
- heavyweight review should happen at meaningful workflow boundaries
- milestone-oriented tracking is usually a better fit than hyper-detailed
  task-by-task orchestration

## Questions To Ask Before Porting A Pattern

1. Why did this pattern exist?
2. What model limitation or harness constraint was it compensating for?
3. Does it still help when the main session can hold the whole build?
4. Is the plan serving the human and the work, or compensating for context
   limits?
5. Should sidecars assist, or own the work?
6. Is review happening at the right granularity?
7. What is the smallest valuable adaptation for the active model and harness?

## Prompt And Skill Fit

When the pattern is a reusable prompt or skill, also apply
`docs/skill-prompting-lens.md`.

Treat skills as model-sensitive and harness-sensitive interventions, not
reusable truths. Adapt them to the active Codex-family model and current
harness, keep broad general skills minimal, and preserve domain-specific
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
