# Evidence Checklist

Use this checklist before changing a row from ambiguous to final.

## Minimum Evidence

- The exact behavior under test is stated clearly.
- The introducing PR has been read.
- The concrete guarded code path or workaround is named.
- The current repo has been checked to see whether that fix still exists.
- The likely owner is identified.
- The likely replacement coverage, if any, is identified.

## Strong Evidence

The row is usually strong enough for a final disposition when:

- the introducing PR names the real owner
- the guarded patch or transform is visible in the current repo
- or the guarded workaround is clearly gone
- or upstream coverage is concrete and named

## Weak Evidence

The row should usually stay provisional when:

- the behavior under test is still vague
- the introducing PR is only a repro, not a fix
- the code path cannot be found
- the original workaround may have been removed, but that is not verified
- “probably upstream” is only an intuition

## Suggested Working States

These are helpful collaborative states before the final row is locked:

- `Needs more evidence`
- `Likely local keep`
- `Likely upstream-owned`
- `Likely delete candidate`
- `Likely rewrite cheaper`
- `Awaiting maintainer judgment`

These are not final report dispositions. They are temporary reasoning states for the conversation.

## Questions To Ask The User

Ask the user to weigh in when:

- multiple plausible owners remain
- the current test is expensive and local value is debatable
- broad confidence coverage is desired, but the kept representative is unclear
- a move-upstream plan would create follow-on work in another repo

