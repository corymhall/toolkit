# Provider Triage Skill Plan

## Goal

Replace one-shot triage expectations with a small skill set that helps a single
agent work an issue across multiple passes and multiple repos.

The entry skill should decide what is already settled, what is not, and which
next action most directly increases certainty or finds a workaround.

## Skill Set

### `triage-provider-issue`

Entry skill. Owns:

- initial evidence gathering
- confidence assessment
- next-action selection
- explicit switching to helper skills
- compact handoff artifact generation

### `stage-pulumi-provider-repro`

Helper for durable Pulumi-side repro staging in provider repos.

### `stage-terraform-provider-repro`

Helper for durable Terraform-side repro staging and parity discrimination.

### `bridge-parity-investigation`

Helper for established Pulumi-vs-Terraform parity gaps inside the bridge repo.
Cross-test-only to avoid harness churn.

### `workaround-investigation`

Helper for practical mitigation work after ownership is clear enough to act.

## Shared Rules

- Do not guess below the confidence threshold.
- Optimize for the best path to certainty even when execution is blocked.
- Create durable repro artifacts instead of weaker substitute analysis.
- Treat workaround discovery as part of the overall job.
- Keep repo boundaries permeable. The same agent should keep going when the
  work moves from provider to bridge or upstream.

## Confidence Model

- `>= 90%`: provisional disposition is useful
- `60-89%`: focus on the next action that gets to certainty
- `< 60%`: focus on evidence acquisition only

Counterfactual check:

`Would the opposite repro or parity result change my recommendation?`

If yes, routing is not settled.

## Standard Artifact

Every skill should leave behind:

1. Current state
2. Confidence
3. Settled evidence
4. Unsettled question
5. Next best action
6. Artifacts prepared
7. Blocked steps and required access
8. Workaround status

## Switching Rules

- Switch to `stage-pulumi-provider-repro` when the best next step is a durable
  Pulumi repro artifact.
- Switch to `stage-terraform-provider-repro` when Terraform behavior is the
  sharpest discriminator.
- Switch to `bridge-parity-investigation` only after Pulumi and Terraform
  behavior are both known and the gap matters.
- Switch to `workaround-investigation` when ownership is clear enough and the
  human still needs a practical path forward.

## Migration Notes

- Preserve the strongest routing and confidence rules from the current triage
  skill.
- Move repro execution details out of the entry skill and into helpers.
- Replace broad bridge harness choice with a stricter parity-investigation
  helper.
- Keep PR/issue handoff work out of scope for now.

## Implementation Sequence

1. Create the new skill folders and metadata.
2. Write the entry skill around confidence, switching, and artifacts.
3. Write the helper skills around concrete capability.
4. Add one small reference file per skill.
5. Validate the skill folders.
6. Forward-test the set on the GCP triage scenario and revise based on drift.
