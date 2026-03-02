---
name: multi-model-evaluate
description: "Get multiple AI models to evaluate the same document or idea, then synthesize their perspectives into a unified assessment."
---

# Multi-Model Evaluate

## Overview

Dispatch the same question to multiple AI models in parallel, then synthesize
their responses. Useful when you want diverse perspectives on a design,
approach, or decision — without manually running separate sessions and
combining results yourself.

## When to Use

- Evaluating a design or approach from an external source (ChatGPT recommendation, colleague's proposal, RFC)
- Comparing trade-offs where you want multiple reasoning styles
- Reviewing a document where blind spots matter (security review, architecture review)
- Any time you'd otherwise paste the same thing into two agent sessions manually

## The Process

### 1. Gather Input

Ask the user what to evaluate. Accept any of:
- A file path (`docs/plans/feature/spec.md`)
- Pasted text in the conversation
- A bead ID (`bd show <id>` to read its description)
- A URL (fetch and read)

Also ask what they want to know. This becomes the evaluation prompt.
Examples:
- "Evaluate this approach — what are the strengths and weaknesses?"
- "Find gaps in this design"
- "Compare this to [alternative] — which is better and why?"
- "Is this feasible given our codebase?"

### 2. Check Available Models

Check which model CLIs are installed:

```bash
command -v claude >/dev/null 2>&1 && echo "claude: available" || echo "claude: not installed"
command -v gemini >/dev/null 2>&1 && echo "gemini: available" || echo "gemini: not installed"
```

The primary model (the one running this skill) is always available.
Report which models will be used before dispatching.

Minimum: 2 models (primary + one CLI). If only the primary model is available,
tell the user and offer to proceed with a single-model deep review instead.

### 3. Dispatch in Parallel

Build the evaluation prompt:

```
You are evaluating a document. Read it carefully, then answer the question.

## Document

<full document content>

## Question

<user's evaluation question>

## Instructions

- Be specific and cite evidence from the document
- State your confidence level for each finding
- If you disagree with the document's approach, explain why with alternatives
- Be direct — don't hedge with "it depends" unless it genuinely does
```

Dispatch to all available models in parallel:

| Model | Command |
|-------|---------|
| Claude Opus 4.6 | `claude -p --model opus "<prompt>"` |
| Gemini 3 Pro | `gemini --model gemini-3-pro-preview -y -o text "<prompt>"` |
| Primary model | Run directly (no CLI needed) |

Use temp files for prompts if needed. Wait for all models (timeout: 10 minutes each).

### 4. Synthesize

Read all model responses and produce a synthesis:

**Where models agree** — high confidence findings. If all models flag the same
issue or praise the same aspect, that's strong signal.

**Where models disagree** — this is the most valuable part. For each disagreement:
- What does each model say?
- Why might they differ? (different assumptions, different priorities)
- Which perspective is more compelling and why?

**Unique insights** — things only one model noticed. These aren't necessarily
wrong — they might be blind spots the others missed.

### 5. Present Results

Present the synthesis conversationally. Don't just dump three responses —
the value is in the comparison and synthesis.

```
## Multi-Model Evaluation

**Models used:** [list]
**Document:** [source]
**Question:** [what was asked]

### Consensus (all models agree)

- [Finding 1]: [what they all said]
- [Finding 2]: [what they all said]

### Disagreements

**[Topic]:**
- Claude: [position]
- Gemini: [position]
- [Primary]: [position]
- **Assessment:** [which is more compelling and why]

### Unique Insights

- [Model X] noticed: [insight the others missed]

### Summary

[2-3 sentence bottom line — what should the user take away?]
```

## Key Principles

- **Synthesis over concatenation** — don't just show three responses. Compare, contrast, and judge.
- **Disagreements are the point** — that's where diverse perspectives add value.
- **Be direct about which model is right** — when models disagree, take a position on which reasoning is stronger.
- **No files written** — this is conversational output, not a persisted artifact. If the user wants to save it, they can ask.
- **Same prompt to all models** — don't customize per model. The value comes from diverse reasoning on identical input.
