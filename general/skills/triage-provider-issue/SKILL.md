---
name: triage-provider-issue
description: "Triage Pulumi provider issues end-to-end without forcing a one-shot conclusion. Use when Codex needs to assess likely attribution, decide what evidence is already settled, choose the next best action, and explicitly switch to helper skills for Pulumi repros, Terraform repros, bridge parity investigations, or workaround work."
---

# Triage Provider Issue

Triage provider issues as an evidence-driven orchestration problem, not a
single-pass verdict.

The job of this skill is to determine what is already known, what is not yet
known, and which next action most directly increases certainty or helps the
human move toward a workaround.

Do not post comments, apply labels, or create issues automatically from this
skill. Bounded local actions are allowed.

## Core Rules

- Do not guess when confidence is low.
- Do not optimize for a plausible-looking report.
- Prefer the best path to certainty even when execution is blocked by missing
  credentials or approvals.
- If the best next step requires a repro artifact, create the artifact rather
  than substituting a weaker path.
- Keep working across repos when the investigation moves from provider to
  bridge or upstream. Repo boundaries do not require a different agent if the
  same agent can continue effectively.
- Treat workaround discovery as part of the job. Triage is often not complete
  when attribution is known.

## Confidence Fork

Use these thresholds after the first evidence pass:

- `>= 90%`: state a provisional disposition, explain the strongest evidence,
  name ruled-out alternatives, and choose the next maintainer action.
- `60-89%`: do not anchor on a final disposition. Center the result on the
  unresolved question and the next action that would most increase certainty.
- `< 60%`: avoid hypotheses. Focus on evidence acquisition, not conclusions.

If the answer to this question is "yes", you are not done routing:

`Would the opposite repro or parity result change my recommendation?`

When the answer is yes, stage the sharper discriminator instead of issuing a
strong ownership call.

## Workflow

1. Read the issue carefully and classify the issue type.
2. Identify the likely implementation family or boundary involved.
3. Gather only enough evidence to choose the next best action.
4. Estimate confidence and decide whether routing is settled.
5. If routing is not settled, explicitly switch to the helper skill that best
   reduces uncertainty.
6. If routing is settled but the human still needs a practical path forward,
   switch to workaround work.

If the next best step belongs in another repo, move to that repo and continue.
Do not stop just because the investigation crossed a repository boundary.
When it is feasible in the current turn, actually continue into the selected
helper skill and begin that work. Do not stop at "the next step should be X"
unless execution is genuinely blocked.

Read these references before finalizing:

- `references/confidence-and-artifacts.md`
- `references/helper-switches.md`

## Helper Skills

Switch explicitly rather than vaguely suggesting "more investigation."

### `stage-pulumi-provider-repro`

Use when the sharpest next action is to stage a durable Pulumi-side repro in a
provider repo.

Typical triggers:

- the issue has a user repro but there is no maintainer-quality artifact yet
- you need to verify update, refresh, import, or multi-step Pulumi behavior
- `--refresh --run-program` is part of the discriminator

### `stage-terraform-provider-repro`

Use when the next best action is the Terraform discriminator or an upstream
acceptance-style repro.

Typical triggers:

- ownership depends on whether Terraform reproduces
- you need to test a narrow semantic variant such as `-refresh=false`
- you need an upstream artifact instead of an ad hoc local run

### `bridge-parity-investigation`

Use only after the issue is understood as a real Pulumi-vs-Terraform parity
gap and the right next step is a bridge cross-test investigation.

Do not use it while parity is still unproven.

### `workaround-investigation`

Use when the likely ownership boundary is clear enough, but the human is not
done until a workaround or practical mitigation is found.

## Default Output

Always leave a compact artifact the next pass can pick up:

- current state
- confidence
- what is settled
- what is not settled
- next best action
- artifacts prepared
- blocked steps and required access
- workaround status

If you switch to a helper skill, restate the unresolved question in one line so
the next pass knows exactly what it is trying to collapse.

Do not treat "continue investigating" as a sufficient outcome. Always name the
next action and the helper skill, if any, that should own it.
