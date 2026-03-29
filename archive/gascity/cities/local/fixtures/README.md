# Supported Local Topology

This fixture directory documents the first supported local topology for the
`gascity-packs` effort.

Current shape:

- one primary clone owns the canonical `.beads/` directory
- secondary clones or worktrees may point at that canonical store with a
  single-level `.beads/redirect`
- contributor planning may route to a separate planning repo, but the routing
  model must be explicitly reviewed before M1 closes

This is a documentation fixture in M1, not a promise that every local edge case
has already been implemented.
