# M1 Topology And Routing Review

This note supports the M1 human stop for `gascity-packs: pack shape and storage
contract`.

## Local Implementation Target

The local pack family lives in this repo:

```text
gastown/
  packs/
    base/
    work/
    personal/
  cities/
    local/
      city.toml
      rigs-work.toml
      rigs-personal.toml
```

`~/github/gascity` is reference material for pack and config syntax. It is not
the implementation target for this feature.

## First Supported Storage Topology

The initial supported topology is intentionally narrow:

1. One primary clone owns the canonical `.beads/` directory.
2. Secondary clones or worktrees may use `.beads/redirect` to point at that
   canonical store.
3. Redirects stay single-level only.
4. The redirect target must already exist.

This follows the current Beads redirect model and keeps the first supported
shape explainable.

## Contributor / Maintainer Routing Model

Current Beads docs describe three relevant routing rules:

1. Role detection prefers explicit `git config beads.role` over heuristics.
2. In `routing.mode=auto`, maintainers route to the current repo and
   contributors route to a planning repo such as `~/.beads-planning`.
3. When routing to a planning repo, hydration must include that repo or routed
   issues will not appear in the unified issue view.

Working summary for this project:

- `routing.maintainer = "."`
- `routing.contributor = "~/.beads-planning"`
- contributor mode should stay overrideable even when a user technically has
  push access

## What Gastown Does In This Workspace Today

The current Gastown-style experience here is cleaner than a naive
"maintainer means commit `.beads`" model:

- the clone-local `.beads/` path is gitignored
- the clone-local `.beads/` path redirects to the canonical rig store at
  `/Users/chall/gt/toolkit/.beads`
- `git config beads.role` is currently set to `contributor`
- `routing.maintainer` is `"."`
- `routing.contributor` is `"~/.beads-planning"`
- `routing.mode` is currently unset

Important implication:

- the reason `.beads` does not show up in normal repo commits today is the
  redirect-plus-ignore setup
- contributor/maintainer routing answers a different question: which logical
  beads database receives new issues

This means the future local Gas City setup can keep the "do not commit `.beads`"
experience even if a repo stays on maintainer routing, as long as the beads
directory remains untracked or redirected appropriately.

## Current M1 Default

For this project, the current default local model is:

- use Gastown-style redirect + ignore to keep `.beads` out of normal repo
  commits
- use one shared Dolt server process if desired, but keep separate logical
  beads databases per routing target
- use maintainer routing for local/personal repos unless planning explicitly
  needs to live elsewhere
- use contributor auto-routing for work/open-source repos when planning should
  stay out of the repo, even if push access exists

## Questions To Resolve Before Leaving M1

- In which exact situations do we force contributor mode even if push access is
  available?
- Should local worktrees share a redirected `.beads/` store by default, or is
  that only for secondary clones?
- What setup guidance do we want for hydration so routed planning issues remain
  visible?
- What is the minimum "I understand this 100%" explanation of the routing model
  before the plan can move past the M1 human stop?
