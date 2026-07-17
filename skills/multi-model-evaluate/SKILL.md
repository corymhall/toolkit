---
name: multi-model-evaluate
description: "Use when the user explicitly wants multiple model perspectives on a document, plan, or decision, or when independent comparison would materially change a high-risk judgment."
disable-model-invocation: true
---

# Multi-Model Evaluate

Use multiple models as a bounded evidence-gathering move, not as a default
workflow. The value is not model count; the value is whether independent
perspectives expose assumptions, alternatives, or risks that change the next
decision.

The main agent session owns the judgment. Other models can contribute evidence,
counterarguments, or blind-spot checks, but they do not vote the answer into
truth.

## When to Use

Use this skill only when:

- the user explicitly asks for multiple model perspectives or comparison
- an independent adversarial read could materially change a high-risk decision

Skip this skill when a normal repo inspection, focused review, or direct user
conversation is enough.

For multi-model code review, keep the runtime boundary clear. The main session
may use `request-review` for its own local review pass, but external helpers
cannot be assumed to know local skills. Give each helper the specific review
lens and evidence contract it needs.

## Process

### 1. Frame The Question

Identify:

- the artifact or idea being evaluated
- the decision the user needs to make
- the evidence that would change the recommendation
- constraints the helpers need: repo, product, security, operational, or user
  intent

Accept paths, pasted text, issue IDs, bead IDs, URLs, or conversation context.
If the user has not stated the decision clearly, ask a short clarifying
question or propose the framing before dispatch.

Inspect local context first when feasibility depends on the repo.

### 2. Use Bounded Helpers

Use only available, appropriate helpers. Check local CLIs when needed:

```bash
command -v claude
command -v gemini
```

Do not require a minimum number of models. If only the primary session is
available, say so and proceed with a focused single-model assessment if that is
still useful.

Use the same core facts for every model, but adapt the prompt when doing so
improves the evidence:

- Ask one model for adversarial risks and another for implementation tradeoffs.
- Give all models the same decision question, but tailor tool or output
  instructions to the model runtime.
- When `HERDR_ENV=1`, load the Herdr skill and give each bounded local or
  external-model sidecar its own non-focused, semantically named tab. Keep each
  tab through synthesis, then close it unless the user asks to retain it.
- For Pi or Codex sidecars, use the exact tab creation, harness startup,
  `send-text`, `send-keys`, wait, and output-reading protocol documented in the
  `request-review` skill. Use Pi's constrained tool list or Codex's
  `--sandbox read-only` rather than an unrestricted worker.
- For Claude or Gemini, prepare prompt/output files and run the read-only command
  from [references/model-cli-adapters.md](references/model-cli-adapters.md) in
  the sidecar tab's root pane. Do not improvise a different CLI invocation.
- The main session owns tab lifecycle and implementation. Keep sidecars
  read-only, and do not let them spawn additional agents.
- Outside Herdr, use the same direct model CLI adapters without tab creation.
- Keep prompts identical only when direct comparison matters.

Keep each request narrow enough to answer well:

```
Evaluate this artifact for the decision below.

Decision:
<question>

Context and constraints:
<facts that matter>

Artifact:
<document, excerpt, or path summary>

Return:
- findings that would change the decision
- assumptions you are making
- evidence from the artifact or repo
- one recommended next move
```

Use temp files for long prompts. Set reasonable timeouts. If a helper fails or
times out, continue with the available evidence and report that limitation.

For concrete Claude and Gemini CLI invocation patterns, output handling,
timeouts, and failure cases, open
[references/model-cli-adapters.md](references/model-cli-adapters.md).

### 3. Synthesize Into Judgment

Compare the responses against the artifact and local evidence. Do not treat
agreement as proof, and do not treat disagreement as automatically valuable.

Report:

- what changed your confidence
- what evidence is strongest
- where responses relied on weak or conflicting assumptions
- which recommendation you would follow and why
- what remains unresolved

Unique model observations are leads, not findings, until they survive your own
check against the evidence.

Keep the output conversational and outcome-focused. Include:

- models or helpers used
- the decision question
- bottom-line recommendation
- high-signal findings
- disagreements or assumptions that matter
- next step

Avoid dumping full model transcripts unless the user asks.

Stop early if the comparison is not adding useful evidence. Say that the extra
perspective did not change the recommendation, then return to direct analysis
or user collaboration.

## Key Principles

- **Outcome over ceremony**: use multiple models only when they improve the
  decision.
- **Evidence over consensus**: model agreement is a clue, not validation.
- **Adaptable prompts**: preserve comparable inputs where useful, but do not
  force identical prompts when different lenses would produce better evidence.
- **Main-session ownership**: synthesize, verify, and take responsibility for
  the recommendation.
- **Easy to stop**: if the comparison is not producing new information, return
  to direct analysis or user collaboration.
