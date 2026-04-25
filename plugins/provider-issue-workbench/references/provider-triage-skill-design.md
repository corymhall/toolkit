# Provider Triage Skill Design

## Purpose

Capture the design theory, goals, and tradeoffs behind the provider-triage
skill set so future revisions do not have to reconstruct the reasoning from
chat history.

This document is not the skill itself. It explains why the skill set is shaped
the way it is, what problems it is trying to solve, and what principles should
guide future updates or related skill work.

## Problem Statement

The original instinct was to build a one-shot triage skill: a skill that could
take a fresh issue, perform triage automatically, and produce a final report.

In practice, that model is too brittle for the hardest provider issues.

For complicated provider bugs, especially bridged-provider bugs, the work often
looks like this:

1. Perform initial issue triage and collect evidence.
2. Stage a Pulumi repro.
3. Stage a Terraform repro.
4. Compare the results to decide whether this is upstream, bridge, or
   provider-local.
5. If this is a bridge problem, create a bridge-side parity investigation.
6. Once ownership is clear, continue into workaround or mitigation work.
7. Potentially move across multiple repos while keeping the thread of the
   investigation intact.

That is usually not a one-shot task. It is a multi-pass investigation where
the first pass narrows the uncertainty and prepares the next pass.

The design goal, therefore, is not "make the skill finish triage in one turn."
The goal is "make the skill useful across the first pass, the next pass, and
the handoff between them."

## Core Insight

Many real triage problems are not one-shot. They are two-shot or multi-shot.

The first pass should often answer:

- what is already settled?
- what is not settled?
- what next action most directly increases certainty?

The second pass should then use the artifacts and narrowed question from the
first pass to keep going.

This changes how skills should be designed:

- less emphasis on forcing a full workflow through prompt text
- more emphasis on capability, evidence gating, and explicit next-action
  selection
- more emphasis on durable artifacts that allow continuation

## Observations From The GCP Case

The `pulumi-gcp` issue used during design was a strong stress test because it
touched every phase of the problem:

- initial triage and routing
- Pulumi repro work
- Terraform parity discrimination
- bridge investigation
- root-cause narrowing
- workaround discovery
- upstream and downstream follow-on work

The most important design observations from that case were:

### 1. Policy alone is not enough

The original triage skill already contained reasonable policy, including parity
rules, but the agent still made an early strong upstream call before parity was
actually established.

This means the skill must do more than say "consider repro." It must force a
clear confidence fork and counterfactual check.

### 2. The hard part is often not the diagnosis but the next step

In ambiguous cases, a final-ish triage report is not very useful if it is based
on unstable assumptions. What matters more is identifying the next action that
would make the conclusion trustworthy.

### 3. Capability gaps matter as much as routing logic

The agent did not only struggle with the ownership call. It also struggled with
some of the concrete "how" work:

- staging repo-native Pulumi repros
- staging Terraform repros that preserved the correct discriminator
- constructing bridge investigations cleanly
- choosing and using the right bridge test shape

This means the solution cannot be one bigger triage prompt. It needs helper
skills for recurring capability areas.

### 4. The agent should not optimize for what it can run right now

When credentials or approvals are missing, an agent may drift toward weaker
analysis because it cannot execute the strongest path.

The design should instead optimize for the best path to certainty even when
execution is blocked. In those cases, the agent should stage the correct
artifact and leave the right command and rationale behind.

### 5. Triage is often not done at attribution

For provider maintainers, the work is frequently not complete once ownership is
clear. The human is often not done until a workaround or mitigation path is
understood.

That makes workaround work a first-class continuation path, not an optional
afterthought.

### 6. Cross-repo continuity matters

Real investigations move across repos: provider repo, bridge repo, upstream
repo, possibly downstream patch repo. The skill system should assume one agent
can continue across repos when useful rather than treating repo boundaries as a
reason to hand off by default.

## Design Goals

The skill set should:

1. Help a single agent work an issue across multiple passes.
2. Avoid low-confidence guesswork.
3. Make the next best action explicit.
4. Create durable repro artifacts rather than disposable scratch work.
5. Support movement across repos without losing the investigation thread.
6. Treat workaround discovery as a real part of the job.
7. Use helper skills for concrete capability, not just more prompt text.

## Design Principles

### 1. Prefer orchestration over one-shot completion

The entry skill should not assume that triage is complete once it can produce a
plausible report. It should orchestrate the next best move.

### 2. Use explicit control flow, not hidden prompt magic

One of the key ideas from the design discussion was:

`Don't use prompts for control flow, use control flow for control flow.`

Applied here, that means:

- keep one entry skill
- give it clear branch conditions
- explicitly switch to helper skills when the next action is known

This is more reliable than hoping a single large skill body can represent every
phase of the investigation equally well.

### 3. Optimize for the smallest valuable adaptation

The design should not create a forest of tiny skills or import a heavyweight
workflow framework. It should add just enough structure to improve reliability
without turning the work into artificial orchestration.

### 4. Separate routing from capability

The entry skill should answer:

- what do we know?
- what do we not know?
- what should happen next?

The helper skills should answer:

- how do we stage this kind of repro?
- how do we run this kind of bridge investigation?
- how do we look for a workaround?

### 5. Prefer durable artifacts over ephemeral reasoning

Durable artifacts include:

- repo-native Pulumi repros
- repo-native Terraform repros
- bridge cross-tests
- compact handoff summaries

These artifacts carry the investigation forward much better than a smart but
temporary explanation.

### 6. Keep freedom where it helps and constrain where drift is costly

Some parts of the problem benefit from agent freedom:

- reading issue context
- inspecting code
- synthesizing evidence

Other parts should be tighter:

- confidence thresholds
- helper-skill switches
- bridge investigation harness choice once parity is established

The bridge case is a good example. Once Pulumi-vs-Terraform parity is already
known, allowing the agent to debate many harnesses caused churn. The skill
should reduce freedom there.

## Chosen Architecture

The resulting architecture is:

### Entry Skill

- `triage-provider-issue`

### Helper Skills

- `stage-pulumi-provider-repro`
- `stage-terraform-provider-repro`
- `bridge-parity-investigation`
- `workaround-investigation`

## Why One Entry Skill

One entry skill is better than two separate top-level triage modes because:

- the user only has to remember one entrypoint
- the first pass and continuation pass are part of the same conceptual job
- the skill can branch internally based on confidence and evidence

The entry skill is therefore not "the skill that does all the work." It is the
skill that owns the control flow and decides when to use specialized helpers.

## Why Helper Skills

Helper skills are justified when the work requires non-trivial procedural
knowledge that should not live in the entry skill body.

In this design, they exist because the investigation repeatedly needs specific
forms of work:

- create a Pulumi repro artifact
- create a Terraform repro artifact
- turn a known parity gap into bridge evidence
- look for a practical workaround

Without helper skills, the entry skill would become long, vague, and hard to
maintain.

## Confidence Model

The confidence model is central to the design.

### Thresholds

- `>= 90%`: a provisional disposition is useful
- `60-89%`: the output should focus on the next action that would get to high
  confidence
- `< 60%`: avoid leading hypotheses and focus on evidence acquisition

### Counterfactual Rule

Before making a strong routing decision, ask:

`Would the opposite repro or parity result change my recommendation?`

If the answer is yes, the routing is not yet settled and the repro is not
optional.

This rule exists because the GCP case showed that static explanation can look
convincing even when parity evidence would overturn the conclusion.

## Standard Artifact

Every pass should leave behind a compact, durable artifact with:

1. current state
2. confidence
3. settled evidence
4. unsettled question
5. next best action
6. artifacts prepared
7. blocked steps and required access
8. workaround status

This artifact is what makes the system multi-shot rather than one-shot. It
gives the next pass the current frontier of the investigation.

## Helper Skill Roles

### `stage-pulumi-provider-repro`

Purpose:

- create the smallest durable Pulumi-side repro artifact that honestly captures
  the issue

Design intent:

- prefer repo-native examples and tests
- preserve the exact lifecycle path
- stage the correct artifact even if execution is blocked

### `stage-terraform-provider-repro`

Purpose:

- create the sharpest Terraform-side discriminator for routing

Design intent:

- prefer upstream acceptance-style or otherwise durable artifacts
- preserve the exact semantic question being tested
- keep the Terraform side honest rather than treating any quick config as
  sufficient

### `bridge-parity-investigation`

Purpose:

- investigate an already-established Pulumi-vs-Terraform parity gap inside the
  bridge repo

Design intent:

- cross-test-only
- preserve the relevant lifecycle and dataflow
- avoid harness churn

This skill is intentionally narrower than a general "extract bridge repro"
skill because once parity is known, ambiguity about harness choice is mostly
harmful.

### `workaround-investigation`

Purpose:

- continue past attribution to find the narrowest credible mitigation or
  workaround

Design intent:

- prioritize practical user impact
- search narrow workaround surfaces first
- distinguish ideas from validated mitigations

## Explicit Switch Conditions

The entry skill should switch explicitly:

- to Pulumi repro staging when a maintainer-quality Pulumi artifact is the next
  best action
- to Terraform repro staging when Terraform behavior is the sharpest
  discriminator
- to bridge parity investigation only after the parity gap is established
- to workaround investigation when ownership is clear enough and the human
  still needs a practical path

This explicit switching is an intentional replacement for fuzzy "continue
investigating" behavior.

## What This Design Is Not Trying To Do

This design does not try to:

- solve every step in one prompt
- eliminate all human judgment
- automatically post comments, labels, or issues
- create a comprehensive workflow engine
- encode every repo-specific detail in the entry skill

Those goals would either reduce reliability or create too much complexity.

## Tradeoffs

### Tradeoff: More skills vs simpler user surface

Using helper skills adds internal complexity, but the entry skill keeps the
user surface simple.

This is a deliberate tradeoff: small internal specialization in exchange for a
clean top-level interaction model.

### Tradeoff: Tight constraints in some phases

The bridge helper is intentionally narrower than a general bridge skill. That
reduces flexibility, but it prevents costly drift in a phase where the right
shape of work is already known.

### Tradeoff: Workaround as a separate phase

Treating workaround work as distinct from routing adds another step, but it
reflects real maintainer workflow better than pretending attribution ends the
job.

## Evolution Guidance

When revisiting this design later, ask:

1. Is the entry skill making the next best action obvious?
2. Are the helper switch conditions still sharp enough?
3. Are the helper skills capturing recurring capability, or just moving prompt
   text around?
4. Are agents still drifting toward weaker paths when blocked from executing
   the best path?
5. Are we preserving durable artifacts well enough for multi-pass work?
6. Are we stopping too early before workaround work?

If new helper skills are added in the future, they should exist because they
capture a recurring capability boundary, not because a specific issue happened
to need another step.

## Testing Philosophy

The right way to test this design is not just to check whether the skill text
sounds good.

Test in layers:

1. static review of the skill text and switch conditions
2. transcript replay against known failure cases
3. forward-testing with fresh agents on realistic prompts
4. evaluation of whether the agent follows the intended control flow

The GCP issue is a good benchmark because it stresses all of the main design
boundaries.

## Summary

This skill set is designed around one main idea:

Provider triage is often a multi-pass investigation, not a one-shot report.

The design therefore emphasizes:

- explicit control flow
- confidence gating
- durable artifacts
- helper skills for concrete capability
- workaround work as a first-class continuation

Future revisions should preserve those principles unless there is strong
evidence that a simpler structure performs better in practice.
