# Personal Pack Variants

This note captures how the local `personal` pack should diverge from the shared
`base` surface without weakening the `work` defaults.

## Core Intent

The `personal` pack exists to express:

- more autonomous personal-repo behavior
- less restrictive order posture where the repo is fully controlled
- personal-only submit or landing variants that must never leak into `work`

It should not:

- mutate the shared `base` pack to get that behavior
- weaken `work`-rig guarantees indirectly through shared defaults
- assume every personal repo wants the same autonomy level by default

## Current M4 Direction

- personal behavior is a config choice layered on the shared substrate
- personal-only formulas should stay personal-only, even if they resemble
  work-pack variants
- personal autonomy is allowed to be more permissive, but still explicit

## Review Questions

- Which personal-only behaviors do we want to allow first?
- Which submit/landing behaviors belong in `personal` versus config?
- What guardrails do we still want even in a fully controlled repo?
