# Pulumi Repro Shape

Use this reference to keep Pulumi repro work durable and narrow.

## Preserve

- the exact lifecycle path
- the smallest input shape that still matters
- the exact failure mode
- any required config, provider version, or local binary wiring

## Prefer

- provider repo example programs
- provider harness tests
- focused existing test surfaces over new ad hoc scaffolding

## Avoid

- temp-dir repros as the main deliverable
- simplifying away the lifecycle transition that causes the bug
- broad snapshot assertions when one concrete failure proves the point

## If Execution Is Blocked

Stage the repro anyway and report:

- the command to run
- the required credentials or environment
- the expected signal if the issue reproduces
