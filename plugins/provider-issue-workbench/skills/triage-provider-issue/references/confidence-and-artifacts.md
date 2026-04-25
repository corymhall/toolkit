# Confidence And Artifact Rules

Use this reference to keep triage grounded when the issue is ambiguous.

## Confidence Rules

- `>= 90%`: a provisional disposition is useful.
- `60-89%`: the report should answer "what next action gets us to certainty?"
- `< 60%`: do not name a leading hypothesis just to sound decisive.

Do not let a detailed issue report or a clever static explanation inflate
confidence.

## Counterfactual Check

Run this test before you route strongly:

`Would the opposite repro or parity result change my recommendation?`

If yes, the recommendation is not settled and the repro is not optional.

## Standard Artifact

Leave behind this structure:

1. Current state
2. Confidence
3. Settled evidence
4. Unsettled question
5. Next best action
6. Artifacts prepared
7. Blocked execution and required access
8. Workaround status

Keep each section short and evidence-backed.
