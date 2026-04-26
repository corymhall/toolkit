# Skill Prompting Lens

Use this lens when authoring, importing, reviewing, or retiring Codex skills and
reusable prompts.

## Core Principle

Prefer the smallest durable prompt that reliably improves the workflow.

A skill is not a proof of quality. It is a reusable prompting intervention whose
effect may be positive, neutral, or harmful.

## Default Assumptions

- skills should earn their context and procedural weight
- general skills should stay small and easy to override
- specific skills should preserve domain judgment, not generic ceremony
- prompts and skills are model-sensitive and runtime-sensitive
- field use matters more than toy prompt tests
- collaboration with the user is often better than delegating planning ritual to
  the agent
- unresolved ambiguity should return to the conversation, even during
  implementation or review

## General Skills

General skills include planning, collaborative framing, review, implementation loops,
and other broadly applicable workflows.

Keep them minimal. They should encode posture, useful boundaries, collaboration
rules, stopping conditions, and a few high-value checks. They should not force
every task through the same rigid framework.

Good general skills help Codex notice what kind of conversation or review is
needed. They do not replace the conversation.

Treat a broad general skill skeptically when it:

- makes small tasks feel large
- imposes a fixed artifact before the work needs one
- asks the agent to plan instead of helping the user think
- hides uncertainty behind a confident template
- adds steps without changing decisions or evidence quality

## Collaborative Thinking

For fuzzy, high-context, or domain-heavy work, the goal is not to make the user
happy in the moment by moving quickly. The goal is to build the thing that works.

Codex should be willing to work back and forth with the user until there is
shared understanding good enough for the next responsible step. That may mean
asking more questions than feels convenient, inspecting the repo before asking,
bringing concrete options back to the user, or pausing implementation when new
uncertainty appears.

Do not treat a question count as the stopping condition. The stopping condition
is understanding: desired outcome, constraints, success evidence, and the
tradeoffs that would change the next move.

This applies throughout the work:

- before planning, when the user's goal is still forming
- during implementation, when the code reveals new ambiguity
- during review, when the result needs to be compared against intent

Use Plan Mode or a durable plan when a decision-complete artifact is needed.
Otherwise, keep the planning surface conversational and grounded in the work.

## Specific Skills

Specific skills are easier to justify when they encode how a human expert works
through a narrow class of tasks.

They should capture domain judgment:

- what evidence matters
- what confidence threshold is enough to act
- what counterfactual would change the recommendation
- which repo, system, or owner should be checked next
- what artifact should be left behind
- what blocked steps require human access
- when to stop, hand off, or switch to a helper skill

Specific skills should make the agent less likely to skip the important domain
move. They should not become a long general workflow with domain words sprinkled
on top.

## Model Fit

Do not assume a skill written for another model, agent runtime, or year transfers
unchanged.

Skills written for Claude, older Codex models, or another agent environment may
encode assumptions that are harmful in Codex: more rigid planning, more
subagent-first execution, different verbosity, different tool expectations, or a
different balance between autonomy and collaboration.

Before adopting an external skill, ask:

1. What model and runtime shaped this skill?
2. What failure mode was it trying to prevent?
3. Does Codex still have that failure mode?
4. Does the skill improve the outcome, or mostly add ritual?
5. What is the smallest Codex-native adaptation?

## Trust And Evidence

Do not treat a small prompt eval as proof that a skill works.

A handful of hand-picked scenarios can catch broken packaging, bad triggers,
missing references, impossible commands, or regressions against one known case.
They cannot prove that the skill improves outcomes across the diverse work it
will encounter.

Trust should come mostly from field use:

- repeated successful use on real tasks
- clear cases where the skill changed a decision for the better
- visible reduction in user correction
- fewer recurring failure modes
- easier handoff or restart when that is the skill's purpose
- willingness to retire or shrink the skill when it adds ceremony

When evidence is weak, keep the skill narrow, explicit, and easy to override.

A broad general skill with only toy-scenario evidence should be treated as an
untested theory, not reusable infrastructure.

## Planning Artifacts

Durable plans are useful when the work is long, risky, restart-sensitive,
handoff-heavy, or likely to span multiple sessions.

They are not the default answer to every fuzzy request. For many tasks, the best
planning surface is the conversation itself: inspect the repo, clarify the real
goal, compare a few concrete options, and proceed once the direction is clear.

Use heavier planning only when it reduces real risk or preserves decisions that
would otherwise be lost.

## Preferred Patterns

- narrow review lenses
- collaborative framing over rigid brainstorming
- explicit evidence thresholds
- bounded helper skills
- progressive disclosure
- user-agent collaboration loops
- small default prompts that set up the conversation
- durable artifacts only when they reduce restart, handoff, or audit risk

## Patterns To Treat Skeptically

- broad skills copied from another model ecosystem without adaptation
- mandatory planning frameworks for ordinary implementation work
- skill chains that make the agent manage the workflow instead of the goal
- prompt rules that duplicate what tool descriptions or repo docs already say
- large templates whose main effect is verbosity
- eval claims based on a few cherry-picked examples

## Questions To Ask Before Keeping A Skill

1. What decision or behavior does this skill improve?
2. Would the agent likely do the right thing without it?
3. Is this skill general posture or domain-specific judgment?
4. Can the instruction be shorter without losing the important behavior?
5. Is the trigger narrow enough to avoid accidental activation?
6. Has real use shown that it reduces correction, rework, or missed evidence?
7. What would make us shrink or delete it?

## References

These docs and examples shaped this lens:

- [OpenAI GPT-5.5 latest model guide](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance)
- [OpenAI Codex skills docs](https://developers.openai.com/codex/skills)
- [Using PLANS.md for multi-hour problem solving](https://developers.openai.com/cookbook/articles/codex_exec_plans)
- [Codex Plan Mode prompt](https://github.com/openai/codex/blob/87bc72408c5ef08f8d21f2cdd00c55451c3be33f/codex-rs/collaboration-mode-templates/templates/plan.md)
- [Codex code review skill examples](https://github.com/openai/codex/tree/main/.codex/skills)
- [obra/superpowers](https://github.com/obra/superpowers)
