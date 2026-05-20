# Triage Session Review

Window reviewed: `2026-03-16` through `2026-05-15`

## Purpose

This document reviews recent issue-triage sessions in the `2026-03-16` through
`2026-05-15` window and asks three questions:

1. Was the first substantive triage answer effectively the final answer?
2. Did the user ask for more analysis, and how many additional turns did that
   take?
3. How different was the end state from the first substantive answer?

The goal is not to grade every assistant message. It is to understand where
first-pass triage was stable, where it drifted, and what kinds of issues caused
that drift.

## Method

- Session source: `~/.codex/sessions`
- Inclusion rule:
  - include sessions that were explicit issue-triage requests
  - keep the old `triage`-selected cohort and the newer
    `triage-provider-issue` cohort separate
  - exclude meta sessions about triage-skill design, eval harnesses, pooled
    triage workers, or benchmark/rubric work
  - for the newer skill, exclude subagent-only sessions and root sessions that
    loaded the skill incidentally while doing non-triage work
- "First substantive triage answer" means the first assistant message that
  clearly committed to a routing or diagnosis, not a setup/progress message
- "Additional turns" means user turns after that first substantive answer

This means the main session review below is still the original
`triage`-selected cohort. A separate `triage-provider-issue` cohort is added
later in this document so the results stay comparable without being mixed.

## Scope Summary

- Total window reviewed: `2026-03-16` through `2026-05-15`
- Sessions that touched the `triage` skill: `24`
- Actual issue-triage sessions reviewed: `14`
- Strongly stable first answer: `8`
- Partially stable but narrowed later: `1`
- Materially revised: `5`
- Turned into implementation sessions: `4`

Implementation sessions in this review means the thread moved beyond triage and
into writing code, adding tests, preparing a PR, or otherwise carrying the fix
itself instead of stopping at diagnosis and maintainer next steps.

## Session Review

### `pulumi-gitlab#1162`

- First answer: `awaiting-upstream`; straight bridged, inherited upstream
  Terraform GitLab behavior
- Additional user turns: `4`
- Stability: partial
- What changed:
  - ownership stayed upstream-shaped
  - confidence narrowed from "upstream issue/MR likely explains this" to
    "related upstream fix, but not proven for this exact Pulumi import case"
  - later turns mostly translated the answer into a clearer maintainer comment,
    added links, and added a workaround

### `pulumi-aws#6289`

- First answer: `awaiting-upstream`, not bridge-owned
- Additional user turns: `1`
- Stability: high
- What changed:
  - almost no diagnostic drift
  - later work mainly reformatted the answer into a maintainer comment and made
    the objection to a Pulumi-only workaround more explicit

### `pulumi-aws-native#2936`

- First answer: `local-fix`; no clean existing open tracker
- Additional user turns: `35`
- Stability: low
- What changed:
  - this is the largest drift case in the review
  - the session moved from "new local runtime bug" toward a split view:
    refresh/import/state contamination, nested create-only path handling,
    overlap with `#2915`, and a new import-specific issue `#2941`
  - the thread then stopped being mostly triage work and expanded into repro
    tests, manual integration repros, issue creation, board inspection, and
    epic planning
- Takeaway:
  - this session is better understood as a triage session that became a larger
    investigation and planning thread

### `pulumi-aws-native#2940`

- First answer: local refresh bug triggered by an upstream schema change
- Additional user turns: `3`
- Stability: high
- What changed:
  - mechanism stayed the same
  - later turns tightened it into a duplicate/root-mechanism match for `#2390`
  - then the session moved into comment drafting and label updates

### `pulumi-aws#6334`

- First answer: repo-local overlay fix; move default to Node 22 now and track
  Node 24 separately
- Additional user turns: `4`
- Stability: high
- What changed:
  - triage conclusion stayed stable
  - later work mostly turned the diagnosis into a PR, a follow-up issue, and a
    quick source-of-truth check for `lambdaMixins.ts`

### `pulumi-aws#6373`

- First answer: duplicate / `awaiting-upstream`
- Additional user turns: `2`
- Stability: low to medium
- What changed:
  - the duplicate claim did not hold
  - ownership still stayed upstream-shaped
  - the final framing was narrower and better: this was about update request
    shaping that unnecessarily resent `ReferencedGroupId`, making AWS authorize
    against the referenced security group during a description-only update

### `pulumi-mongodbatlas#991`

- First answer: `awaiting/bridge`
- Additional user turns: `14`
- Stability: low
- What changed:
  - the user pushed on policy: bridge attribution was too strong without the
    required bridge issue or discriminator repro path
  - the session then turned into a discussion of how the triage skill itself
    should treat `awaiting/bridge`
  - workaround guidance appeared later, but the original confident disposition
    did not survive cleanly

### `pulumi-gcp#3666`

- First answer: strongest attribution to upstream Terraform Google
- Additional user turns: `40`
- Stability: low
- What changed:
  - user pushback correctly centered on the Pulumi-vs-Terraform discriminator:
    would the recommendation change if Terraform did not reproduce?
  - the session then moved into actual repro work and ultimately prepared an
    upstream fix direction
  - final state still leaned upstream, but only after much stronger evidence

### `pulumi-aws#6247`

- First answer: already fixed by upgrade; not a current open bug
- Additional user turns after the actual triage report: `0`
- Stability: high
- What changed:
  - diagnostic conclusion did not change
  - the only correction was process: the agent acted on GitHub before returning
    a triage report, then later supplied the report when asked

### `pulumi-aws#6252`

- First answer: `local-fix`; provider-local enum/schema drift
- Additional user turns: `7`
- Stability: high
- What changed:
  - the triage conclusion stayed stable
  - the session expanded into implementation, commit, and PR creation

### `pulumi-aws#6273`

- First answer: `awaiting-feedback`; likely reporter version/environment issue,
  not a provider bug
- Additional user turns: `0`
- Stability: high
- What changed:
  - essentially nothing
  - this is one of the cleanest triage-only examples in the review

### `pulumi-awsx#1926`

- First answer: `local-fix`; local AWSX refresh/rehydration regression
- Additional user turns: `31`
- Stability: high
- What changed:
  - root-cause attribution stayed local
  - the thread later became fix/test-design work rather than just triage

### `pulumi-aws#6167`

- First answer: likely provider-local migration/state-upgrade issue
- Additional user turns: `8`
- Stability: low to medium
- What changed:
  - after deeper repro work, the session ended in a much more cautious place:
    could not reproduce on current `HEAD`, so the best user-facing answer was
    to ask for more state/version details
  - this is a good example of a plausible first theory that did not survive
    testing strongly enough

### `pulumi-aws-native#2798`

- First answer: `local-fix`; nested write-only passthrough bug
- Additional user turns: `7`
- Stability: high
- What changed:
  - ownership stayed local
  - later turns mostly connected it to broader umbrella issues and project
    structure rather than changing the core diagnosis

## Findings

Across the `14` actual issue-triage sessions reviewed:

- Strongly stable first answer: `8`
- Partially stable but narrowed later: `1`
- Materially revised: `5`
- Turned into implementation sessions: `4`

### What tends to hold up well

- Repo-local bugs with clear source-of-truth evidence
  - example: `pulumi-aws#6252`
  - example: `pulumi-awsx#1926`
- Already-fixed-by-upgrade or version-boundary answers
  - example: `pulumi-aws#6247`
  - example: `pulumi-aws#6273`
- Native-provider refresh/input-ownership issues when the local mechanism is
  directly inspectable
  - example: `pulumi-aws-native#2940`

### What tends to drift

- Bridged-provider ownership calls where static inspection looks persuasive but
  the real deciding factor is a Terraform discriminator
  - example: `pulumi-gcp#3666`
  - example: `pulumi-mongodbatlas#991`
- Duplicate claims made from "same area" rather than "same actual failure mode"
  - example: `pulumi-aws#6373`
- Explanations that treat a leading hypothesis as more proven than the issue
  text or repro evidence really supports
  - example: `pulumi-aws-native#2936`
  - example: `pulumi-aws#6167`

### A recurring pattern

User pushback was usually productive. The sessions with the biggest movement did
not drift because the agent wandered. They drifted because the user forced a
higher evidentiary bar:

- "Would this still be your recommendation if Terraform did not reproduce?"
- "Is this actually a duplicate, or just the same general area?"
- "Are we sure that upstream fix solves this exact case?"
- "The issue does not mention refresh. Are we assuming too much?"

In other words, the unstable cases often trace back to premature compression,
not lack of repository reading.

### Which sessions turned into implementation

These `4` sessions clearly crossed from triage into implementation work:

- `pulumi-aws#6252`
  - local fix, commit, and PR creation
- `pulumi-aws#6334`
  - default-runtime change, follow-up issue, regeneration, tests, and PR
- `pulumi-awsx#1926`
  - moved into fix/test-design work after the local bug call
- `pulumi-aws-native#2936`
  - added repo-native repro tests and manual integration repro scaffolding,
    even though the session also expanded into issue and project planning

Several other sessions expanded beyond pure diagnosis into comment drafting,
label updates, or GitHub issue/project maintenance, but did not cross into
actual code or test changes.

## Separate Cohort: `triage-provider-issue`

This cohort was rerun separately after noticing that the original review was
old-skill-oriented. It is not a clean apples-to-apples replacement for the
earlier cohort:

- the newer skill appeared in many more sessions overall
- many of those were subagent sessions, automation/meta-work, or non-triage
  sessions that loaded the skill incidentally
- several of the included asks were broader than "triage this issue" and more
  like "research the root cause and create tests if needed"

### Scope Summary

- Sessions that touched `triage-provider-issue` in the window: `54`
- Root or root-like sessions reviewed as actual issue-analysis/triage: `8`
- Strongly stable first answer: `7`
- Materially revised: `1`
- Turned into implementation sessions: `4`

### Sessions Reviewed

#### `pulumi-terraform-bridge#2618`

- First answer: bridge-local root cause in SDKv2 `Check`; Terraform defaults
  were getting reapplied when checked inputs were rebuilt, which polluted
  `RawConfig` for omitted values
- Additional user turns: `23`
- Stability: high
- What changed:
  - the root-cause call held up
  - the user then explicitly asked for brainstorming, tests, and a fix path
  - the session became implementation and ultimately produced bridge changes

#### `pulumi-awsx#1926`

- First answer: `local-fix`; local AWSX refresh/rehydration regression
- Additional user turns: `31`
- Stability: high
- What changed:
  - root-cause attribution stayed local
  - the session moved into fix and test-shape discussion rather than changing
    the diagnosis

#### `pulumi-awsx#1928`

- First answer: `local-fix`; `awsx.ec2.Vpc` accepted a `region` input but only
  forwarded it to the root VPC, not the child resources that still used the
  default provider
- Additional user turns: `13`
- Stability: high
- What changed:
  - the local-owner call held
  - later work focused on documentation history, implementation shape, and PR
    review follow-through

#### `pulumi-aws-native#2936`

- First answer: `local-fix`; no clean existing open tracker
- Additional user turns: `35`
- Stability: low
- What changed:
  - same major drift as in the old-skill-oriented cohort
  - the session moved from a single new bug call to a split view involving
    import contamination, nested create-only handling, overlap with `#2915`,
    and the new import-specific issue `#2941`
  - it then expanded into repro tests, manual integration repros, issue
    creation, and project planning

#### `pulumi-aws#6321`

- First answer: upstream-owned, already fixed in Terraform AWS provider
  `v6.8.0`; Pulumi behavior depended on which Pulumi AWS line the reporter was
  on
- Additional user turns: `1`
- Stability: high
- What changed:
  - essentially none
  - later work just turned the answer into a maintainer comment plus labels

#### `pulumi-aws#6317`

- First answer: not a current `awaiting-upstream` case; the upstream fix was
  already in Pulumi versions `>= v7.13.0`, so the right next step was likely
  `awaiting-feedback`
- Additional user turns: `2`
- Stability: high
- What changed:
  - no meaningful diagnostic drift
  - later work converted the answer into a GitHub response and label action

#### `pulumi-aws-native#2933`

- First answer: not an `aws-native` bug; this was an upstream AWS SDK shared
  config parsing limitation around quoted SSO session names
- Additional user turns: `0`
- Stability: high
- What changed:
  - nothing material
  - this is one of the cleanest one-shot examples in the newer cohort

#### `pulumi-aws#6338`

- First answer: not a Pulumi resource bug; likely upstream AWS SDK v2 shared
  config parsing or AWS CLI config-shape incompatibility in provider
  credential validation
- Additional user turns: `2`
- Stability: high
- What changed:
  - ownership stayed upstream-shaped
  - later turns mainly tightened the maintainer-facing wording and added
    version-parity context

### What Looks Different In The Newer Skill Cohort

- Fewer routing reversals in the sampled sessions
  - only `pulumi-aws-native#2936` materially changed its first answer
- More sessions intentionally crossed into implementation
  - `#2618`, `#1926`, `#1928`, and `#2936`
- More asks were broader than pure triage
  - the newer skill was often loaded for "root cause plus next step" work, not
    only for a triage label recommendation

That makes the newer cohort look better on first-answer stability, but it also
means the sample is not directly comparable to the older one. The newer skill
was acting more like an orchestrator for investigation and helper-skill
switches, so a higher implementation rate was expected.

## Practical Conclusions

### 1. First-pass triage is often directionally right

Most sessions did not need a wholesale reversal. Even in the drift cases, the
first answer was often pointing at the right subsystem family.

### 2. The weak point is confidence calibration

The most common failure was not "wrong owner from scratch." It was:

- too-strong duplicate claim
- too-strong bridge/upstream routing without the required discriminator
- too-strong implication that a related upstream fix likely resolves the exact
  downstream report

### 3. A meaningful minority turned into implementation sessions

Four sessions turned into:

- implementation (`#6252`, `#6334`, `#1926`)
- repro engineering that also produced local test artifacts (`#2936`)
- project-board or epic planning (`#2936`)

That matters when evaluating "final answer drift." Once a session crosses into
implementation or repro engineering, the literal last assistant message is often
about downstream action rather than the original triage conclusion.

The newer `triage-provider-issue` cohort reinforced that point even more
strongly. In that smaller sample, half of the reviewed sessions turned into
implementation or repro-engineering work because the asks were broader and the
skill is designed to keep going through helper-skill handoffs when the next
step is clear.

### 4. The cleanest forcing function is the discriminator question

The best single check that repeatedly improved answer quality was:

> Would the routing recommendation change if Terraform did not reproduce?

Or the native-provider equivalent:

> What evidence would actually change owner/routing here?

That question reliably exposed when a static inspection answer was still one
step too early.

## Suggested Follow-up

If this analysis is meant to inform skill changes, the most obvious tightening
points are:

- require stronger wording discipline around duplicate claims
- require explicit acknowledgment when a mechanism is still a leading
  hypothesis rather than proven
- make the Pulumi-vs-Terraform discriminator more central in bridged-provider
  routing
- distinguish "same root area" from "same issue"
- keep triage reports separate from later implementation/planning work when
  evaluating outcome stability
