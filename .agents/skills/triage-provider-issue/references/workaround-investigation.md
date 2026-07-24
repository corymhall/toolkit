# Workaround Investigation

Use this reference after the ownership boundary is clear enough for practical purposes and the user still needs a mitigation.

Stay in the workaround lane. Reopen broad triage only when workaround evidence contradicts the current understanding.

## Workflow

1. Restate the exact behavior the workaround must avoid, suppress, normalize, or redirect.
2. Search from the narrowest surface to the broadest:
   1. configuration or usage change
   2. lifecycle option or command flag
   3. narrow normalization or behavioral guard
   4. alternate resource flow
   5. broader downstream or upstream patch
3. Compare serious candidates by practicality, user impact, and risk rather than by which owning layer appears conceptually cleaner.
4. Validate the strongest candidate when safe and possible.
5. If validation requires credentials or a long-running environment, stage the artifact and state the exact remaining check.

## Validation Levels

Label each candidate accurately:

- idea only
- locally staged
- locally validated
- validated in the real failing path

Do not present a plausible idea as a verified workaround.

## Deliverable

Report:

- the failure boundary
- candidates considered
- the best current candidate and why
- its validation level
- user impact and tradeoffs
- remaining risk or uncertainty
- the next validation step
- blocked execution and required access
