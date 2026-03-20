# Contributor Routing Scenarios

This note makes the supported contributor/maintainer routing behavior explicit
for the first local topology.

## Default Local Rule

- local/personal repos: maintainer routing by default
- work/open-source repos: contributor routing by default when planning should
  stay out of the repo, even if push access exists
- manual per-repo override remains allowed

## Example Scenarios

### 1. Local Pack Development In This Repo

- routing target: current repo
- storage shape: redirect + ignore
- reason: local pack development is the source of truth here

### 2. Work/Open-Source Repo With Push Access

- routing target: planning repo (for example `~/.beads-planning`)
- reason: planning should stay out of the work repo even if the user could push
- requirement: hydration must include the planning repo

### 3. Personal Repo

- routing target: current repo by default
- reason: the user controls merge policy and may want local planning coupled to
  the repo

## Explicitly Deferred

- automatic policy selection beyond the current default rule
- multi-planning-repo strategies
- edge cases where one repo intentionally mixes maintainer and contributor
  planning targets at the same time
