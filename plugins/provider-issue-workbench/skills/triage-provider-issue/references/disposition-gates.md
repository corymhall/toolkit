# Disposition Gates

Use these gates before making a strong routing or duplicate claim.

## `awaiting-upstream`

Use only when at least one of these is true:

- there is an existing upstream issue or fix that matches the same
  user-facing failure mode and maintainer next action, or
- Terraform reproduces strongly enough that the routing would not change if
  Pulumi-specific details were refined later

Do not use it when:

- the issue is only in the same general area as an upstream issue
- the upstream issue is merely suggestive
- Terraform parity is still unknown and would change your recommendation

## `awaiting/bridge`

Use only when at least one of these is true:

- there is an existing bridge issue that matches the same failure mode, or
- Pulumi behavior is established, Terraform behavior is established, and the
  remaining gap is bridge-owned enough that `bridge-parity-investigation` is
  the right next step

Do not use it when:

- the bridge is only a plausible layer
- Terraform parity is still unknown
- you would still need to create the first bridge repro artifact before saying
  the issue is bridge-owned

## `duplicate`

Use only when both of these are true:

- the existing issue covers the same user-facing failure mode, not just the
  same subsystem or root-area
- the next maintainer action is the same

If the issue is merely related, say so explicitly:

- same-family issue
- possible umbrella/root issue
- historical background

Do not collapse "same general area" into "duplicate."

## `awaiting-feedback`

Use when the strongest current explanation is outside the provider's current
bug surface and the maintainer needs reporter details to proceed.

Typical cases:

- version-resolution or environment mismatch
- repro depends on missing stack/state details
- current `HEAD` does not reproduce and the missing discriminator lives with
  the reporter

Do not use it just because the issue is annoying to reproduce. If maintainer
repro is the sharpest next step, stage the repro artifact instead.

## `local-fix`

Use when repo-local evidence already settles the likely ownership boundary well
enough that the next maintainer action can happen in the current repo.

This does not require certainty about the exact final patch, but it does
require that the opposite upstream/parity result would not overturn the routing
recommendation.

## `fixed by upgrade` / version-boundary cases

Use when the issue is best explained by a capability or fix that already landed
in a later released version.

The report should still include:

- the exact version boundary
- why the current version explains the report
- why this is not an open current bug in `HEAD`

## Hypothesis Discipline

If your best explanation is still a leading theory, say so.

Good examples:

- "likely but unconfirmed root cause"
- "related upstream fix, exact applicability unverified"
- "same family as `#1234`, not yet justified as duplicate"

Bad examples:

- presenting a plausible mechanism as if the issue text or repro already proved
  it
- naming a strong routing label and then quietly adding caveats later
