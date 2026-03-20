# Contributor Routing Scenarios

This note makes the supported contributor/maintainer routing behavior explicit
for the first local topology.

## Default Local Rule

- local/personal repos: maintainer routing by default
- work/open-source repos with push access: maintainer routing is allowed when
  redirect + ignore keeps beads state out of normal commits
- contributor routing is still useful when planning should live in a separate
  planning repo despite push access
- manual per-repo override remains allowed

## Example Scenarios

### 1. Local Pack Development In This Repo

- routing target: current repo
- storage shape: redirect + ignore
- reason: local pack development is the source of truth here

### 2. Work/Open-Source Repo With Push Access

- routing target: current repo is acceptable
- storage shape: redirect + ignore so beads state still stays out of normal
  code commits
- reason: push access means maintainer routing can be fine when the git hygiene
  story is already handled

### 3. Work/Open-Source Repo Without That Local Hygiene Story

- routing target: planning repo (for example `~/.beads-planning`)
- reason: planning should stay out of the repo and the separate planning target
  makes that explicit
- requirement: hydration must include the planning repo

### 4. Personal Repo

- routing target: current repo by default
- reason: the user controls merge policy and may want local planning coupled to
  the repo

## Explicitly Deferred

- automatic policy selection beyond the current default rule
- multi-planning-repo strategies
- edge cases where one repo intentionally mixes maintainer and contributor
  planning targets at the same time
