# Supported Redirect Topology

This is the first supported local topology for the `gascity-packs` effort.

## Shape

```text
toolkit/
  .beads/                 # canonical beads store for the local pack repo
  crew/quick/.beads/      # redirect -> ../../.beads
  crew/other/.beads/      # redirect -> ../../.beads
```

Rules:

1. One canonical `.beads/` store per routing target.
2. Secondary clones or worktrees point to that canonical store with a single
   `.beads/redirect`.
3. Redirect chains are not supported.
4. The redirect target must already exist.

## Why This Is The Supported Topology

- it preserves the "do not commit `.beads`" local experience
- it keeps one source of truth per routing target
- it matches the current Gastown-style redirect model

## Explicitly Deferred

- multi-hop redirect chains
- automatic cleanup of abandoned redirected stores
- broad cross-repo storage federation beyond the first supported shape
