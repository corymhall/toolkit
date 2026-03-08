# Codex Evaluation Lens

Use this lens when evaluating workflows, skills, formulas, or practices from
other agent systems and deciding whether they belong in Gastown.

## Why This Exists

Many external agentic systems were shaped by different model behavior than what
we see from Codex today.

In particular, systems designed around Claude Code often optimized for:

- smaller context windows
- more frequent session compaction or restart pressure
- a stronger need to externalize intent into verbose plans
- more reliance on fresh subagents as a way to preserve cleanliness and reduce
  context drift

Codex often behaves differently:

- it can keep a much longer thread
- it is often stronger when one session owns the whole build
- it benefits less from giant, ultra-explicit task plans
- it can use subagents effectively, but does not always want them as the
  backbone of implementation

Because of that, external systems should be adapted selectively, not copied
whole.

## Core Principle

Prefer workflows that amplify Codex's strengths rather than compensating for
Claude-era constraints.

## Default Assumptions

When no stronger reason exists, assume:

- one main session should own implementation work
- subagents should be sidecars for bounded work, parallel research, or review
- durable artifacts should capture decisions, status, and audit points, not
  every tiny implementation detail
- heavyweight review should happen at meaningful workflow boundaries, not after
  every micro-task
- milestone-oriented tracking is usually a better fit than hyper-detailed
  task-by-task orchestration

## Questions To Ask Before Porting A Pattern

1. Why did this pattern exist in the source system?
- Was it solving a real product problem, or compensating for model/context
  limitations?

2. Does this pattern still help when the main session can hold the whole build?
- If Codex can keep ownership cleanly, avoid unnecessary fragmentation.

3. Is the plan serving the human and the system, or mainly acting as a crutch
   for stateless workers?
- Prefer concise specs, milestones, and explicit invariants over giant
  execution scripts unless detailed plans clearly add value.

4. Should subagents own the work, or just assist?
- Default to parent-session ownership unless the work is truly independent or
  benefits from parallel specialization.

5. Is review happening at the right granularity?
- Keep ordered review loops when they improve quality, but prefer milestone or
  completion-boundary review over mandatory review after every tiny step.

6. What is the smallest valuable adaptation?
- Port the high-value behavior, not the whole operating system.

## Patterns We Generally Prefer

- Explicit workflow stages over hidden prompt magic
- Main-session implementation with clear ownership
- Lightweight milestone tracking
- Structured review artifacts
- Final or milestone-boundary multi-agent review when risk justifies it
- Selective reuse of external ideas

## Patterns We Should Treat Skeptically

- Mandatory fresh subagent per task
- Giant, ultra-explicit task plans as the default execution artifact
- Workflow designs built around constant session reset assumptions
- Review loops after every micro-task
- Whole-system cloning for parity with a successful external framework

## Practical Application

When reviewing or designing a new Gastown workflow, spell out:

- what behavior is being borrowed
- why it worked in the source system
- whether that reason still applies for Codex
- what we are keeping, changing, or dropping

If a borrowed pattern is still valuable, adapt it into Gastown's style:

- visible formulas and steps
- explicit artifacts
- main-session ownership
- optional sidecar delegation
- clear audit and review boundaries

## Current Example

The working example for this lens is the superpowers investigation:

- keep the single-session owner model
- avoid porting subagent-per-task execution wholesale
- make heavyweight review explicit and first-class
- run external reviewers as sidecars
- defer TDD and lighter milestone-review details until they are designed with
  the same lens
