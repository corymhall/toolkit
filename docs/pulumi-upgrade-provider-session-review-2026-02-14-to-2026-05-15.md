# Pulumi Upgrade Provider Session Review

Window reviewed: 2026-02-14 through 2026-05-15

Scope: Codex session files under `~/.codex/sessions` that appeared to be real
provider upgrade runs using `pulumi-upgrade-provider` or its plugin-qualified
equivalent. I excluded sessions whose primary task was maintaining the skill,
changing the `upgrade-provider` tool, or reviewing unrelated CI/tooling changes.

## Questions

This review uses the same lens as the triage review, adapted for upgrade work:

1. Did the initial upgrade task complete as the answer?
2. Did the user ask for more analysis or follow-up? How many additional user
   turns did that take?
3. How different was the final state from the initial upgrade ask?
4. Did the session turn into implementation follow-through beyond the basic
   upgrade PR?
5. Did the session turn into skill, tooling, or process improvement work?

## Summary

Reviewed upgrade sessions: 15

No-follow-up, one-shot-ish upgrade sessions: 6

Sessions with at least one user follow-up after the initial request: 9

Sessions that turned into implementation follow-through beyond the initial
upgrade run: 7

Sessions that turned into skill updates: 3

Sessions where the final answer materially drifted from the initial upgrade
ask: 5

The user's expectation that most upgrade-provider sessions are one-shot is
partly true for the happy path, but not true across the full observed set. The
skill often gets the agent to the right first action quickly, but provider
upgrades frequently expose second-order work: patch rebases, removed upstream
resources, CI fallout, generated-code diffs, review comments, and occasionally
new skill guidance.

The important distinction is that most follow-up was not "more analysis because
the agent's first answer was wrong." It was usually normal upgrade execution
expanding into the next blocker after `upgrade-provider` surfaced it.

## Outcome Buckets

One-shot-ish successful upgrades:

- `pulumi-aws` on 2026-04-16: completed the upgrade PR after a patch rebase fix.
- `pulumi-fastly`: completed the upgrade PR after local submodule and Go path
  setup issues.
- `pulumi-azure`: completed the upgrade PR after patch rebase, token mapping,
  and plugin install handling.
- `pulumi-aiven`: completed the upgrade PR after removing stale mappings for
  upstream-deleted resources.
- `pulumi-alicloud`: completed the upgrade PR after removing stale CS mappings
  for upstream-deleted resources.
- `pulumi-aws` on 2026-04-30: completed the upgrade PR after a narrow module
  mapping unblocker.

Upgrade sessions with ordinary PR or CI follow-through:

- `pulumi-aws` on 2026-03-30: started as an upgrade PR and finished as the same
  PR after a bridge fix was merged and the branch was rebased.
- `pulumi-docker`: upgrade PR was opened, then the user asked to inspect CI and
  commit a fix for example module SDK versioning.
- `pulumi-databricks`: upgrade PR was opened, then the session handled review
  comments, lint cleanup, and pushed a follow-up commit.
- `pulumi-cloudngfwaws`: major upgrade work continued into patch-retirement
  discussion, local trust/setup handling, review comment handling, docs
  consistency, and push follow-through.
- `pulumi-gcp`: upgrade work continued into docs patch analysis and a follow-up
  issue about docs migration behavior.

Upgrade sessions that exposed reusable skill lessons:

- `pulumi-f5bigip`: upgrade work surfaced vendored dependency and upstream
  directory mismatch behavior. The session ended with a skill update.
- `pulumi-rancher2`: upgrade work exposed ignored upstream `replace` directive
  behavior and unknown revision failures. The session ended with a skill update.
- `pulumi-harness`: upgrade work exposed duplicate .NET `Get` suffix collisions.
  The session ended with a skill update.

High-drift session:

- `pulumi-cloudflare`: started as an upgrade but exposed a docs/codegen invoke
  form regression. The final useful output included an upstream Pulumi issue and
  PR body update rather than a simple completed upgrade.

## Session Table

| Session | Initial task | User follow-up turns | Final state | Drift |
| --- | --- | ---: | --- | --- |
| `pulumi-aws`, 2026-03-30 | Upgrade provider and prepare PR | 2 | Same upgrade PR completed after bridge fix and rebase | Low |
| `pulumi-aws`, 2026-04-16 | Upgrade provider and PR | 0 | Upgrade PR completed after patch rebase | Low |
| `pulumi-f5bigip` | Upgrade provider | 16 | Upgrade investigation led to vendored dependency guidance and skill update | High |
| `pulumi-cloudflare` | Upgrade provider | 23 | Codegen/docs regression isolated; upstream issue created and PR body updated | High |
| `pulumi-rancher2` | Upgrade provider | 7 | Unknown revision traced to ignored upstream `replace`; skill updated | High |
| `pulumi-fastly` | Upgrade provider | 0 | Upgrade PR completed | Low |
| `pulumi-docker` | Upgrade provider | 2 | Upgrade PR plus CI fix for example module SDK versioning | Medium |
| `pulumi-azure` | Upgrade provider | 0 | Upgrade PR completed after normal blocker fixes | Low |
| `pulumi-harness` | Upgrade provider | 9 | Duplicate .NET `Get` suffix issue analyzed; skill updated | High |
| `pulumi-aiven` | Upgrade provider | 0 | Upgrade PR completed after stale mapping cleanup | Low |
| `pulumi-databricks` | Upgrade provider | 5 | Upgrade PR plus review response, comment, lint fix, and push | Medium |
| `pulumi-gcp` | Upgrade provider | 6 | Upgrade path led to docs migration issue follow-up | Medium |
| `pulumi-cloudngfwaws` | Major upgrade | 7 | Upgrade PR plus review/doc consistency follow-through | Medium |
| `pulumi-alicloud` | Upgrade provider | 0 | Upgrade PR completed after stale mapping cleanup | Low |
| `pulumi-aws`, 2026-04-30 | Upgrade provider | 0 | Upgrade PR completed after module mapping unblocker | Low |

## Direct Answers

Was the first upgrade path the answer?

Mostly yes. In the straightforward sessions, the skill-selected path of running
`upgrade-provider`, fixing its blocker, and preparing a PR was the answer. Even
in several follow-up sessions, the first path remained correct; the later work
was PR hygiene, CI cleanup, or review response.

Where the first path was not enough, the failure mode was usually not bad
triage. The upgrade run exposed a deeper compatibility issue that only became
visible after generation, build, or CI:

- vendored dependency version mismatches,
- ignored upstream `replace` directives,
- stale mappings for upstream-deleted resources,
- generated duplicate SDK method names,
- docs/codegen behavior changes,
- module mapping gaps for newly introduced upstream packages.

Did the user ask for more analysis?

Yes in 9 of 15 sessions. The distribution was skewed: 6 sessions had no
follow-up, 4 had modest follow-up of 2 to 7 user turns, and 5 became substantial
debugging or process sessions.

How different was the final answer from the first answer?

Low drift in 7 sessions. The final answer was essentially "the upgrade PR is
ready," with normal details about what was fixed.

Medium drift in 4 sessions. The final answer was still upgrade-related, but it
included extra implementation work such as CI fixes, review comments, docs
follow-through, or branch updates.

High drift in 4 sessions. The final result became a reusable skill update or an
upstream/tooling issue rather than only an upgrade PR.

How many turned into implementation sessions?

By the stricter definition of "beyond the normal upgrade run," 7 sessions turned
into implementation follow-through:

- `pulumi-aws` 2026-03-30,
- `pulumi-docker`,
- `pulumi-databricks`,
- `pulumi-gcp`,
- `pulumi-cloudngfwaws`,
- `pulumi-cloudflare`,
- `pulumi-harness`.

If opening an upgrade PR itself counts as implementation, then nearly all of the
included sessions are implementation sessions. That broader definition is less
useful here because the skill's normal job is already implementation-oriented.

## Skill Implications

The current skill appears to work for the happy path. The biggest opportunity is
not to make it more elaborate up front. The useful improvements are small
diagnostic gates around known blocker classes:

- When `upgrade-provider` fails in Go module resolution, explicitly inspect
  upstream `go.mod`, `replace` directives, vendored paths, and Pulumi-side
  module mapping before trying broad dependency churn.
- When generated mappings reference resources that no longer exist upstream,
  prefer deleting stale mappings after confirming upstream removal instead of
  preserving Pulumi-side compatibility blindly.
- When SDK generation fails with duplicate names, inspect generated schema/token
  collisions and language-specific name transforms before assuming a codegen
  bug.
- When docs or examples change unexpectedly, separate "upgrade PR blocker" from
  "tooling regression worth a follow-up issue" so the upgrade does not become an
  unbounded investigation by default.
- Treat review/CI follow-up as normal after the PR exists, but keep it separate
  from the core upgrade workflow so one-shot upgrade runs stay lightweight.

## Recommendation

Do not make the main `pulumi-upgrade-provider` skill substantially heavier. The
observed sessions support a lightweight default path with a small set of
blocker-specific references.

The skill should optimize for:

- fast PR production for normal upgrades,
- narrow blocker diagnosis when the tool stops,
- explicit escalation points when a blocker becomes codegen, docs, or SDK
  semantics work,
- recording reusable blocker classes after they recur.

The one-shot path should remain the default. The skill's value is highest when it
keeps the agent from wandering during the uncommon but expensive blocker cases.
