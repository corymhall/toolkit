# M5 Topology Hardening Review

This note supports `gascity-packs: supported shared-store and routing
hardening`.

## Local Artifacts To Review

- `gascity/cities/local/fixtures/redirect-topology.md`
- `gascity/cities/local/fixtures/contributor-routing.md`
- `docs/plans/gascity-packs/m1-topology-and-routing.md`

## Current M5 Position

- one canonical `.beads/` store per routing target
- redirect + ignore is the default local cleanliness model
- contributor routing stays explicit and overrideable
- work/open-source repos with push access may still use maintainer routing when
  redirect + ignore already keep beads state out of normal commits
- broader cross-repo storage patterns remain deferred

## Review Questions

- Is the first supported topology narrow enough to be safe but still useful?
- Are the contributor-routing defaults specific enough to avoid ambiguity?
- What operator-facing caveats still need to be written down before this is
  considered hardened?
