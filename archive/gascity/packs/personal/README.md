# Personal Pack

Owns the local personal-repo variants for the Gas City pack family.

Intended contents:

- more autonomous personal-repo prompts and formulas
- personal-only overrides layered on top of the shared `base` surface
- local behavior that should never silently bleed into `work` rigs

Current runnable surface:

- `owner-personal-v2.md.tmpl` prompt override for the shared `owner` agent

Personal-pack owner prompts should carry the crew-specific landing behavior for
personal repos:

- the crew checkout's `origin` points at the rig checkout
- land by pushing a feature branch to that rig checkout
- merge `main` in the rig checkout with `git merge --ff-only`
- push the rig checkout's `main` to the hosted remote
- sync the crew checkout back to `main`
