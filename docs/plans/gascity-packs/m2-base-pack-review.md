# M2 Base Pack Review

This note supports the M2 human stop for
`gascity-packs: base pack owner session and controller policy`.

## Local Artifacts To Review

- `gastown/packs/base/owner-session-surface.md`
- `gastown/packs/base/prompts/shared/owner-common.md.tmpl`
- `docs/plans/gascity-packs/m2-owner-prompt-comparison.md`
- `gastown/packs/base/prompts/shared/README.md`
- `gastown/packs/base/formulas/README.md`
- `gastown/packs/base/scripts/README.md`
- `gastown/cities/local/base-policy.md`

## Current M2 Position

- the local `base` pack owns the owner-session path
- keep `rig/crew/<name>` style identity, but remove the heavier town-role
  mythology around it
- keep minimal durable mail behavior only; remove the broader town
  communication protocol from the owner prompt
- shared prompt fragments should stay neutral across `work` and `personal`
- adapt `approval-fallacy` and `operational-awareness`, keep `capability-ledger`
  optional, and drop `command-glossary` from the base prompt by default
- safe common formulas may live in `base`, but worker-submit behavior should not
- borrow the `mol-polecat-base` layering pattern as reference, but defer actual
  shared worker-formula ownership to later `work` / `personal` stages
- risky mutation orders on `work` rigs stay manual or disabled by default
- deacon/refinery should remain explicit non-goals for the v1 local pack family

## Questions To Resolve Before Leaving M2

- Which prompt fragments do we actually want in `base`?
- Do we want a new owner-session prompt or a tailored fork of an existing one?
- Which formulas belong in `base` versus staying as repo-local workflow assets?
- Which controller/order behaviors are pack content versus city/rig config only?
