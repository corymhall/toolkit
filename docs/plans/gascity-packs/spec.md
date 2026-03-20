# Gas City Packs

## Overview

We are designing a Gas City operating model and local pack family that fits the
user's actual workflow rather than recreating the full Gastown role tree. The
target environment spans many rigs, split between personal repositories the
user fully controls and work/open-source repositories where all substantive
changes must go through a branch and pull-request flow.

The main problem is not missing automation. It is missing control. The user
wants controller help, long-lived sessions, mail, health, and optional pool
workers, but does not want an all-or-nothing system that can silently drift
into merge-to-main behavior or spawn expensive agents across dozens of rigs.
The design therefore needs explicit trust boundaries, per-rig policy, and a
clear separation between reusable capabilities and local safety controls.

The proposed solution is a family of local Gas City packs stored in this repo,
combined with a city configuration that applies those packs differently to
`personal` and `work` rigs. The packs will define agents, prompts, formulas,
and default workflow behavior. The city config will define which rigs are
active, what can autoscale, and which risky automations remain disabled or
manual.

## Goals

- G-1: Create a reusable local Gas City pack family that captures the user's
  preferred owner-session and optional-pool-worker workflow without requiring
  the full Gastown role model.
- G-2: Support distinct operating modes for `personal` rigs and
  `work/open-source` rigs, with trust and merge policy expressed explicitly.
- G-3: Keep Beads/Dolt on the mature production path while incorporating native
  shared-store and contributor-routing capabilities where they materially reduce
  workflow friction.
- G-4: Make small-task pool automation compatible with a branch/PR workflow
  rather than direct merge-to-main behavior.
- G-5: Preserve resumability for review follow-up by storing enough metadata on
  work beads for a later worker session to continue on the same branch.

## Scope

In:
- Define the v1 pack architecture for local Gas City packs stored in this repo.
- Define the city/rig policy model for `personal` versus `work` repositories.
- Define the default session ownership model for large work and the default pool
  worker model for small work.
- Define the v1 Beads/Dolt storage strategy, including redirects, shared-store
  expectations, and contributor/maintainer routing implications.
- Define the default work-repo worker flow through branch preparation and
  resumable follow-up.
- Define the role of daemon/controller, orders, and optional helper roles in
  the intended system.
- Make redirect/shared storage and contributor/maintainer routing first-class
  v1 concerns rather than compatibility-only extension points.

Out:
- Treat this spec document as the design contract, not the file-by-file
  implementation plan for packs, prompts, formulas, or scripts. Implementation
  sequencing belongs in the follow-on milestone plan.
- Build GitHub issue polling or GitHub-label-driven autoscaling in v1.
- Implement a dedicated PR handler or merge/refinery replacement in v1.
- Implement a custom `exec:` Beads provider in v1.
- Fully solve cross-repo storage topology for 100+ repositories beyond the
  first supported local pattern.

## Constraints

- C-1: The user may operate across 22+ rigs now and 100+ later, so the design
  must scale operationally without assuming one-off per-repo hand tuning.
- C-2: Work/open-source repos must not assume permission to push or merge to
  `main`; branch/PR discipline is mandatory.
- C-3: The user wants controller help, but only when autonomy is explicit and
  bounded. Per-rig dormant-by-default behavior must remain available.
- C-4: Gas City's mature formula/runtime path currently assumes Beads `bd`
  semantics; v1 should avoid jumping to less mature storage abstractions unless
  the benefit clearly outweighs the loss of stability.
- C-5: The design must work with the user's existing preference for one strong
  owner session for larger work, with pool workers as optional accelerators.
- C-6: Runtime artifacts such as `.beads/` and `.gc/` must not leak into
  tracked project history in normal operation.

## Acceptance Criteria

- A-1: The spec defines a concrete pack family and clearly states what each
  pack owns.
- A-2: The spec defines a clear v1 distinction between `personal` and `work`
  rig policy.
- A-3: The spec defines the default large-work and small-work flows in enough
  detail that a future implementation can assign agent/formula ownership.
- A-4: The spec explains how Beads and Dolt fit into the v1 design, including
  redirect/shared-store behavior and the implications of contributor/maintainer
  routing.
- A-5: The spec explicitly forbids direct-to-main worker behavior on work rigs.
- A-6: The spec defines what happens to a pool worker after it finishes work,
  including what “cleanup” means in the initial design.
- A-7: The spec leaves remaining uncertainty serialized as decisions or open
  questions rather than implicit ambiguity.
- A-8: A work rig configured with the `work` pack must not be able to execute a
  direct push-to-main or merge-to-main worker flow through config/formula
  wiring, even if prompt text attempts to steer it there.

## User Stories / Scenarios

- As a user working on a larger feature in a work repo, I can start one
  long-lived owner session that handles planning and implementation without
  needing a full multi-agent town.
- As a user working on a small, well-scoped work item, I can sling it to a pool
  worker that prepares a branch in an isolated worktree and records enough bead
  metadata for later continuation.
- As a user working on a personal repo, I can enable more autonomous flows than
  I would allow in a work repo.
- As a user managing many repos, I can keep reusable behavior in packs while
  keeping trust policy in city configuration.
- As a user returning after PR feedback, I can have a later worker session pick
  up the same branch and continue rather than starting from scratch.

## Design

### Architecture

The design has two layers:

1. **Reusable capability layer** in local Gas City packs stored in this repo.
2. **Local policy layer** in `city.toml` and rig overrides.

This separation is required because the user's challenge is not only workflow
composition. It is safe workflow composition. The pack layer should say what is
possible. The city layer should say what is allowed for a given rig right now.

The v1 architecture uses a **three-pack split**:

- `base`
  - Shared prompts/fragments
  - Long-lived owner/crew session model
  - Shared formulas and scripts that are safe across trust classes
- `work`
  - Work-repo-safe behaviors
  - Branch/PR-oriented pool worker flow
  - No merge-to-main assumptions
- `personal`
  - Personal-repo behaviors
  - Potentially more autonomous direct-commit or merge-friendly formulas

The city config chooses which rigs include which packs and then layers policy on
top with `suspended`, pool overrides, order overrides, and agent patches.

The pack split must also be concrete enough to implement:

| Pack | Owns | Excludes |
|------|------|----------|
| `base` | shared owner-session prompts, shared fragments, shared scripts, safe common formulas, shared examples/docs | trust-class-specific worker submit behavior |
| `work` | work-safe worker prompts, branch/worktree formulas, conservative worker defaults, work-repo-safe order defaults | direct-commit and merge-to-main submit flows |
| `personal` | personal-repo worker variants, direct-commit or merge-friendly submit flows, more autonomous defaults | work-repo branch-protection assumptions |

Examples:
- shared owner/crew prompts belong in `base`
- a “prepare branch only” worker formula belongs in `work`
- a direct-commit variant belongs in `personal`

### Policy Surface

The design must bind policy to the surface that can actually enforce it:

- **Pack capability**
  - prompts
  - formulas
  - scripts
  - reusable defaults shared by a trust class
- **City policy**
  - workspace includes
  - provider defaults
  - city-wide suspend/resume posture
  - global order defaults
- **Per-rig policy**
  - repo classification (`personal` vs `work`)
  - rig suspended state
  - pool min/max and enablement
  - direct push permission
  - risky order overrides (`enabled = false` or manual-only posture)

Concrete examples:
- “work rigs start suspended by default” belongs in rig config
- “a pool worker exists as a capability” belongs in a pack
- “this work rig currently has worker pool max = 0” belongs in rig override
- “no push-to-main worker flow on work rigs” must be enforced by config/formula
  wiring, not only by prompt text

### Components

#### 1. Owner Session

The owner session is the default path for larger work. It is a persistent,
rig-scoped session that owns planning, most implementation, and higher-context
decision making. This follows the local Codex evaluation lens: one strong
session owns the build, with sidecars used selectively rather than as the
backbone of execution.

Responsibilities:
- planning and spec work
- larger feature implementation
- deciding when to use sidecar reviewers or workers
- synthesizing review feedback

#### 2. Pool Worker

The pool worker is the default path for smaller, issue-sized work where the
task is already well-scoped. In v1, the worker is not a merge bot and not a PR
submission bot by default. Its responsibility is to prepare an implementation
branch in an isolated worktree, perform the work, and persist resumable state on
the bead.

For work repos, the v1 default is **prepare branch only**:
- create or reuse worktree
- create or reuse branch
- implement and verify
- push branch if policy allows
- persist branch/worktree/target metadata
- stop before merge-oriented action

This preserves automation value while keeping trust boundaries explicit.
For v1, the flow ends after local branch preparation and optional remote push
according to rig policy. PR creation, PR updates, and merge/refinery handoff are
explicitly out of scope for the default worker path.
The default work-repo posture allows pushing feature branches, but never
directly pushing or merging to `main`.

#### 3. Optional Future PR Handler

A dedicated PR handler is not part of v1. The design should leave room for it,
but the initial system should not require a separate PR-oriented role to be
useful. The default follow-up path is resuming worker-oriented context from bead
metadata.

### Storage and Beads Model

V1 stays on the Beads `bd` + Dolt path, but it treats native Beads shared-store
features as first-class design inputs rather than ignoring them.

#### Baseline

- Gas City's default `bd` integration remains the production baseline.
- Per-rig bead identity and routing still matter because Gas City dispatches
  work to the rig database associated with the target agent.
- `.beads/` and other runtime state must be kept out of tracked Git history via
  local ignore/exclude practices.

#### Shared Redirects

Beads natively supports `.beads/redirect` files so multiple clones or worktrees
can share one canonical bead store. This is important for the user's desired
multi-rig, multi-session environment because it offers a path to shared issue
state without requiring each working copy to own an independent local database.

V1 should therefore treat redirects as a supported storage topology:
- each rig or routing domain may designate one canonical bead store
- redirected worktrees or satellite clones for that rig may point to it
- `bd where` and Beads routing logic remain the source of truth for active
  storage location

The implementation may still start with simpler local topology, but the spec
should require pack/workflow design to avoid assumptions that break in a
redirected setup.

#### Contributor / Maintainer Routing

Beads also supports role-aware routing:
- maintainers can route planning/issues to the current repo
- contributors can route planning/issues to a separate planning repo

This is directly relevant to the user's split between personal ownership and
external/work repos. V1 treats contributor/maintainer routing as a first-class
design concern. Pack and city behavior should assume that routing is active and
must be correct, overrideable, and safe for work-repo usage. In particular,
the implementation must confirm that contributor posture can be enforced even in
repos where the user has push access, so that routing cannot silently fall back
to maintainer semantics and reintroduce unsafe main-branch behavior.

#### Dolt

Dolt is the storage engine beneath `bd`. For this design, that matters in four
ways:

1. Bead history and sync semantics come from Dolt-native behavior, not Git
   commits on the repo's protected branch.
2. Shared Dolt server mode exists and is useful for multi-repo / multi-agent
   setups.
3. Redirects and shared-store patterns must preserve correct Dolt database
   targeting.
4. Security/privacy operational guidance must include disabling Dolt metrics if
   required by the environment.

The design should assume Dolt is part of the operating model, not an invisible
implementation detail.

### Worktree and Branch Lifecycle

For work-repo pool workers, v1 should borrow the strongest parts of the
existing `mol-polecat-work` pattern while removing its refinery handoff.

Required bead metadata:
- `work_dir`
- `branch`
- `target`
- `push_remote`
- `base_branch`
- optional rejection / follow-up metadata for later continuation

Required behavior:
- worktree is created or reused idempotently
- branch is created or reused idempotently
- worker can resume from existing metadata
- later worker sessions can continue the same line of work after review

This makes the worker flow resumable without requiring the original runtime to
remain alive forever.

The existing `mol-polecat-work` formula is a reference pattern for worktree,
branch, and metadata handling, but it is not the direct v1 worker formula. Its
current submit path pushes and reassigns to refinery, so the `work` pack will
need a forked or replacement variant that stops at the intended prepare-branch
boundary.

### Session Lifecycle for Pool Workers

The default mental model for a pool worker should be:
- active while doing work
- explicitly drained when done
- cleaned up by the controller according to pool/session policy

Gas City does not require a completed pool worker to sit idle forever. Existing
worker formulas already use `gc runtime drain-ack` and describe the intended
behavior as "you are gone." The session lifecycle docs and design notes also
show pool sessions moving through `active -> draining -> archived`, with
`wake_mode=fresh` meaning scale-up creates fresh sessions rather than reviving
old context.

For this design, that means:
- v1 should assume workers are ephemeral by default
- "cleanup" means the runtime is reclaimed and the session leaves the active
  routing path
- resumability should come from bead metadata and branch/worktree state, not
  from an immortal worker process

The exact archive-vs-close policy can remain implementation-specific, but the
spec should require that completed workers do not remain indefinitely eligible
for new work by accident.
For v1, review/fixup follow-up uses the same pool template rather than a
separate dedicated follow-up template. The later split remains available if
review behavior diverges enough to justify it.

### Personal vs Work Rig Policy

#### Personal

Personal rigs may enable more autonomous flows because the user fully controls
merge policy.

Allowed direction:
- optional direct-commit or merge-friendly formulas
- less restrictive orders
- higher automation tolerance

#### Work / Open Source

Work rigs must default to conservative policy.

Required v1 defaults:
- dormant-by-default support via rig suspension
- no direct worker push-to-main or merge-to-main behavior
- pool workers stop at branch preparation / resumable implementation handoff
- risky orders are disabled or manual until explicitly enabled

This policy belongs in city config and rig overrides, not only in prompt prose.

### Orders and Automation

Orders are useful in this system, but they should begin as explicit, low-risk
automation rather than broad autonomy.

V1 guidance:
- use orders for safe maintenance and observability first
- keep mutation-capable orders manual or disabled by default on work rigs
- defer GitHub issue polling and auto-spawn behavior until the core pack model
  is stable

The eventual GitHub issue flow should likely be:
- order discovers issues and creates/updates beads
- pool `check` scales workers from bead demand

That keeps discovery and execution separate.

### What Deacon / Dogs / Refinery Mean Here

This design does not require recreating the whole Gastown town.

- **Controller/daemon**: required, because it owns reconciliation, pool
  lifecycle, waits, and order dispatch.
- **Dogs**: optional, and usually better modeled as exec orders than long-lived
  agents when no agent judgment is needed.
- **Deacon**: not required as a first-class role in v1; controller-owned
  infrastructure should stay controller-owned.
- **Refinery**: not part of the default work-repo v1 flow. If introduced later,
  it should be PR-aware rather than merge-to-main by default.

## Non-Negotiables

- [N-1] The design must distinguish `personal` and `work/open-source` rig policy
  explicitly.
- [N-2] Work-repo worker flows must not assume permission to push or merge to
  `main`.
- [N-3] Reusable capabilities must live in local packs; trust policy must live
  in city/rig configuration.
- [N-4] V1 must remain compatible with the mature `bd` + Dolt production path.
- [N-5] Shared Beads redirects and Dolt-aware storage topology are first-class
  v1 requirements, not accidental edge cases.
- [N-6] Pool-worker completion must remove the worker from active routing rather
  than letting completed sessions sit indefinitely in a way that risks surprise
  reuse.
- [N-7] Review follow-up must be resumable from durable bead metadata, not only
  from one surviving worker session.
- [N-8] Contributor/maintainer routing must be correct and overrideable in v1,
  including in environments where repository push access alone would otherwise
  imply maintainer behavior.

## Forbidden Approaches

- [F-1] Recreate the full Gastown role tree as a prerequisite for usefulness —
  this would reintroduce the complexity the user is trying to escape.
- [F-2] Make work-repo worker automation merge or push directly to `main` by
  default — this violates the user's trust boundary and repo ownership model.
- [F-3] Put all policy in prompts while leaving city config permissive — this
  would create a dangerous mismatch between intended and actual autonomy.
- [F-4] Jump to a custom `exec:` bead store as a v1 requirement — it expands
  scope before the operating model is proven.
- [F-5] Assume completed pool workers should remain long-lived active sessions
  indefinitely — this conflicts with the intended drain/ephemeral worker model.

## Decision Log

| Decision ID | Topic | Chosen Option | Rejected Alternatives | Rationale | Status |
|-------------|-------|---------------|------------------------|-----------|--------|
| D-1 | Pack structure | Three-pack split: `base`, `work`, `personal` | Two-pack split; single pack | Best match for explicit trust separation and reuse | Resolved |
| D-2 | Large-work ownership | Long-lived owner session is the default path | Subagent-first or pool-first execution | Aligns with local Codex workflow preferences and existing planning lens | Resolved |
| D-3 | Small work-repo worker default | Prepare branch only | Auto-submit PR; merge/refinery handoff | Preserves automation while respecting branch/PR trust boundaries | Resolved |
| D-4 | PR review follow-up owner | Resume worker-oriented flow from bead metadata using the same pool template in v1 | Owner session only; dedicated PR handler | Best current starting point while preserving resumability without adding new pack surface too early | Resolved |
| D-5 | Beads storage baseline | Keep `bd` + Dolt for v1 | File store baseline; custom exec store baseline | Mature runtime path with known workflow compatibility | Resolved |
| D-6 | Shared-store posture | Treat redirects/shared store as a core v1 operating model | Redirect-compatible only; ignore redirects until later | The user wants shared storage to be foundational rather than a later compatibility layer | Resolved |
| D-7 | Contributor/maintainer routing | Make routing first-class in v1 and verify it is safe/overrideable | Compatibility-only rollout; ignore native role-aware routing | This is crucial to prevent unsafe maintainer behavior on work repos | Resolved |
| D-8 | Controller-side helper roles | Keep controller mandatory, defer deacon/refinery recreation | Rebuild full town roles immediately | The user wants selective infrastructure, not whole-system parity | Resolved |
| D-9 | Pool-worker completion model | Drain and reclaim active workers; resume via metadata | Keep finished workers hanging around as active sessions | Better match for ephemeral worker intent and existing pool lifecycle direction | Resolved |
| D-10 | Work-repo default push behavior | Allow feature-branch push by default on work rigs, but never push/merge to `main` | Local-only by default; merge/refinery submission | The user is comfortable with branch pushes and wants useful automation without violating main-branch trust boundaries | Resolved |

## Traceability

| Spec Element | Source | Notes |
|--------------|--------|-------|
| Goals | user dialogue + planning session | Derived from stated desire for selective autonomy, many rigs, and trust-separated workflows |
| Constraints | user dialogue + `codebase-context.tmp` | Includes repo ownership rules, many-rig scaling, and storage/runtime concerns |
| Pack family design | user choice + `docs/guides/shareable-packs.md` | User selected three-pack split; Gas City pack guidance supports local reusable packs |
| Storage model | user dialogue + Beads/Gas City research | Combines Gas City `bd` baseline with Beads redirect/shared-store and Dolt capabilities |
| Work-repo worker flow | user choice + `mol-polecat-work` exploration | Existing formula provides reusable worktree/branch metadata patterns, but final refinery handoff is intentionally replaced |
| Session lifecycle section | user question + Gas City pool/session docs | Added specifically to answer what happens after a pool worker is "done" |
| Non-Negotiables | user dialogue | Encodes trust boundaries and safety expectations explicitly |
| Decision D-1 | request_user_input choice | User selected the three-pack split |
| Decision D-3 | request_user_input choice | User selected prepare-branch flow for work repos |
| Decision D-4 | request_user_input choice | User selected resume-worker follow-up as the starting model |
| Decision D-6 | request_user_input choice + Beads docs | User elevated shared redirects/shared storage to a core v1 concern after research |
| Decision D-7 | request_user_input choice + Beads docs | User made contributor/maintainer routing first-class and explicitly called out safe override behavior as critical |
| Decision D-10 | request_user_input choice | User allows feature-branch pushes on work repos but not pushes or merges to `main` |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shared redirect topology is more complex than simple per-rig local stores | Early implementation could become brittle if storage assumptions are implicit | Make redirect/shared-store support explicit in pack and script design; test with redirected worktrees early |
| Resume-worker review follow-up may feel awkward in practice | The first PR-fixup workflow could be clumsy or confusing | Keep room for a later PR-handler role if real usage proves the need |
| Work-repo automation remains too weak to feel valuable | Users may feel the pool worker stops too early | Preserve branch/worktree metadata so later PR automation can layer on cleanly |
| Policy drift between packs and city config | Unsafe automation could reappear through bad defaults | Keep risky behavior disabled by default and require explicit rig overrides for enabling it |

## Testing

- Validate pack composition in a sample city with:
  - one personal rig
  - one work rig
- Validate that work rigs can start suspended and stay dormant until resumed.
- Validate that worker formulas on work rigs never perform direct-to-main
  behavior.
- Validate that a work rig configured with the `work` pack cannot execute a
  direct push-to-main or merge-to-main worker flow through config/formula
  wiring.
- Validate that worktree + branch metadata is sufficient for a later worker
  session to continue after simulated PR feedback.
- Validate a redirected/shared Beads topology with at least one canonical store
  and one redirected worktree or clone.
- Validate that `.beads/` and other runtime artifacts stay out of tracked Git
  history under the intended local ignore strategy.

## Open Questions

- [ ] Should v1 include explicit contributor-routing setup commands and docs, or
  what is the smallest safe setup surface to make that routing bulletproof?
- [ ] What is the smallest useful v1 order set for work rigs that adds value
  without surprising autonomy?
