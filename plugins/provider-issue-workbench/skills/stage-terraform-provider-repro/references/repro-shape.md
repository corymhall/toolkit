# Terraform Repro Shape

Use this reference to keep Terraform repro work honest and useful for routing.

## Preserve

- the exact upstream question
- the exact lifecycle or flag variant being tested
- the smallest durable config or acceptance test that still answers that
  question

## Prefer

- upstream acceptance tests
- repo-native Terraform repro artifacts
- narrow command matrices tied to explicit outcomes

## Avoid

- presenting a convenience config as equivalent to the real discriminator
- vague "Terraform works" claims without stating what was actually exercised
- changing more than one semantic variable at a time

## If Execution Is Blocked

Stage the artifact and report:

- the exact command to run
- required credentials or approvals
- what result would change routing
