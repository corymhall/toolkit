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

Do not let a detailed static explanation bypass this check. If the opposite
result would change your routing, your routing is not settled yet.

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
9. Closest related issues and why they are duplicate, same-family, or only
   background

Keep each section short and evidence-backed.

When the mechanism is not yet fully proven, label it explicitly:

- proven by evidence
- likely but unconfirmed
- related but exact applicability unverified

Do not use a stronger label later in the report than the evidence justifies.
