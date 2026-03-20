# Base Pack

Owns the local shared layer for the Gas City pack family.

Intended contents:

- shared prompts and prompt fragments
- shared formulas that are safe across trust classes
- owner-session defaults for larger work
- shared policy/config surface that `work` and `personal` build on

Current runnable surface:

- rig-scoped `owner` agent for long-lived larger-work ownership
- `prompts/owner-session.md.tmpl` for the base owner-session prompt

This pack should remain neutral across `work` and `personal`. Worker submit
behavior and trust-class-specific landing rules stay out of `base`.
