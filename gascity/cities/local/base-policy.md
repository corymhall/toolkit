# Base Policy Defaults

This note captures the M2 policy surface that should stay shared across trust
classes before `work` and `personal` diverge.

## Shared Defaults

- the workspace includes the local `base` pack
- larger work flows through the owner-session path
- controller/daemon behavior is available, but risky mutation orders stay manual
  or disabled by default on `work` rigs
- deacon/refinery-style roles are not assumed in the v1 local pack family

## What Stays Out Of `base`

- `work`-only pool worker behavior
- `personal`-only direct-commit behavior
- trust-class-specific submit rules

## Review Focus

- Is this the right shared policy surface for both trust classes?
- Which order behaviors belong in docs/config only versus reusable pack content?
- Is the “no deacon/refinery requirement” statement strong enough?
