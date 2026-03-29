# Agent Instructions For `gascity/packs/`

This file scopes the AI contribution contract for the local Gas City pack
family under `gascity/packs/`.

Use it when changing:
- `gascity/packs/base/`
- `gascity/packs/work/`
- `gascity/packs/personal/`
- `gascity/cities/local/` when the change is about how packs compose
- prompt, formula, and pack-composition behavior for the local city model

## What This Area Owns

The local pack family defines how the Gas City model behaves for this repo.

- `base/` owns shared owner-session fragments and neutral shared surfaces
- `work/` owns work-repo-safe prompts, formulas, and branch/PR behavior
- `personal/` owns more autonomous personal-repo prompt/formula variants
- `cities/local/` shows how the packs compose into a city/rig config

Do not treat `~/github/gascity` as the implementation target. It is reference
material for SDK shape and upstream patterns only.

## Start Here

- `gascity/packs/base/pack.toml`
- `gascity/packs/work/pack.toml`
- `gascity/packs/personal/pack.toml`
- `gascity/packs/base/prompts/shared/`
- `gascity/packs/work/prompts/`
- `gascity/packs/personal/prompts/`
- `gascity/packs/work/formulas/`
- `gascity/cities/local/city.toml`
- `docs/plans/gascity-packs/`

## Command Canon

These commands are the fastest reliable checks for pack work in this repo.

- Render a trust-class owner prompt:
  - `GC_AGENT=demo/owner gc prime owner --city <tmp-city>`
- Show how a pack composes into a scratch city:
  - `gc config show --city <tmp-city>`
- List formulas available from a scratch city:
  - `gc formula list --city <tmp-city>`
- Inspect current local pack diffs:
  - `git diff -- gascity/packs gascity/cities/local docs/plans/gascity-packs`

Scratch city pattern:

```toml
[workspace]
name = "pack-check"
provider = "codex"

[[rigs]]
name = "demo"
path = "/path/to/toolkit-checkout"
includes = ["/path/to/toolkit-checkout/gascity/packs/work"]
```

Then run:

```bash
GC_AGENT=demo/owner gc prime owner --city /path/to/tmp-city
gc config show --city /path/to/tmp-city
gc formula list --city /path/to/tmp-city
```

## Boundary Rules: Prompt vs Formula vs Skill vs AGENTS

When deciding where a practice belongs, use the narrowest layer that can enforce
it reliably.

### Put it in a prompt when…

The behavior should always be in the agent's head every time it starts.

Good prompt content:
- role identity and trust boundary
- hook/mail/handoff behavior
- invariant policy such as "work repos stay on branches and use PRs"
- high-level landing rules
- crew/rig checkout distinctions when they materially change git behavior

Bad prompt content:
- long procedural checklists that only apply sometimes
- repo-specific command lists that belong in repo docs
- detailed workflow state machines better expressed as formulas

### Put it in a formula when…

The behavior is an ordered workflow with explicit steps or state transitions.

Good formula content:
- create/reuse worktree
- create/reuse branch
- record bead metadata
- stop at a branch-ready handoff boundary

Bad formula content:
- vague identity or philosophy
- repo-specific "how to test" commands that should come from repo docs

### Put it in a skill when…

The behavior is a reusable playbook that is invoked intentionally, not an
always-on rule for the agent.

Good skill content:
- finishing a development branch
- PR follow-up / review-response workflow
- integration-branch handling
- multi-step release or migration workflows

### Put it in `AGENTS.md` when…

The behavior is a repo-local standing convention humans and agents should follow
while working in this area.

Good `AGENTS.md` content:
- command canon
- file ownership / which directory owns what
- commit message conventions
- "what belongs where" guidance
- forbidden patterns for this subtree

## Shared vs Trust-Class-Specific Rules

Use this split consistently:

- `base/` should only carry shared fragments and neutral shared guidance
- `work/` should carry branch/PR-oriented workflow and must not allow direct
  merge/push to the default branch from the crew/owner path
- `personal/` may carry more autonomous landing behavior, but it must never
  weaken `work` by accident
- `personal/` should explicitly teach the crew-checkout landing flow when
  `origin` points at the rig checkout and landing happens via the rig's `main`

If a rule differs between `work` and `personal`, do not hide that difference in
one shared prompt paragraph. Put the difference in the trust-class prompt or
formula explicitly.

## Current Prompt Ownership

Today the concrete owner prompts live here:

- `gascity/packs/work/prompts/owner-work-v2.md.tmpl`
- `gascity/packs/personal/prompts/owner-personal-v2.md.tmpl`

Shared owner-session sections live in:

- `gascity/packs/base/prompts/shared/owner-common.md.tmpl`
- `gascity/packs/base/prompts/shared/propulsion.md.tmpl`
- `gascity/packs/base/prompts/shared/capability-ledger.md.tmpl`
- `gascity/packs/base/prompts/shared/architecture.md.tmpl`

When changing owner-session wording:
- edit shared sections in `base/prompts/shared/` if they are truly common
- edit `owner-work-v2.md.tmpl` or `owner-personal-v2.md.tmpl` if the behavior differs

## Current Formula Ownership

- `gascity/packs/work/formulas/mol-work-branch-ready.formula.toml`
  owns the work-repo-safe branch-ready worker lifecycle

Do not put personal-only landing behavior into the work formula.

## Commit Conventions

Changes in this area currently use conventional-style messages with a `gascity`
scope, for example:

- `feat(gascity): add local base and work pack prompts`
- `feat(gascity): split owner prompts by trust class`
- `fix(gascity): clarify work owner prompt workflow`

Keep following that style unless the human asks for something else.

## Verify Before Calling It Ready

For prompt changes:
- render the affected prompt with `gc prime` in a scratch city

For pack composition changes:
- run `gc config show --city <tmp-city>` for the affected trust class

For formula changes:
- run `gc formula list --city <tmp-city>`
- if the change affects the rendered text or lifecycle, inspect the formula
  output and any relevant bead metadata expectations

For docs/composition changes:
- make sure `gascity/cities/local/` still reflects the real pack structure

## Forbidden Shortcuts

- Do not copy upstream Gastown prompt sections blindly without checking whether
  they encode stale workflow assumptions.
- Do not put repo-specific test/lint/build commands into formulas unless there is
  a very strong reason.
- Do not weaken `work` workflow guarantees in order to make `personal` easier.
- Do not leave pack docs or sample city configs teaching an old composition
  model after changing the pack graph.

## Escalate / Follow Up

File a follow-up bead when:
- a workflow concept is clearly needed across prompts/formulas/skills but is not
  yet modeled cleanly
- a reference to an upstream Gastown concept (for example integration branches)
  exists without a local compatibility surface
- a trust-class split (`work` vs `personal`) is still implicit instead of explicit
