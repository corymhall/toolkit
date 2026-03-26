---
name: request-review
description: Kick off a manual code or implementation review using Codex-native reviewer agents, then synthesize the findings into a concise report. Use when you want an ad hoc review of a diff, branch, file set, or spec-vs-implementation scope.
---

# Request Review

## Overview

Run a manual review without entering a larger workflow.

This skill is the small manual entry point for ad hoc review. It launches
reviewer agents, gathers their findings, and synthesizes the result for the
user. It does not own issue creation, code fixes, or workflow checkpoint logic.

If the user wants to review a GitHub PR and draft or post review comments, use
`review-pr` instead.

## When to Use

- Review the current diff before commit
- Review a branch against a spec or plan
- Review a file set with a particular lens
- Review a PR locally for technical quality before using `review-pr`
- Get an extra set of eyes on in-progress implementation work

## Do Not Use For

- Workflow-owned implementation review stages
- Automatic issue creation or remediation
- GitHub review comment posting
- A large interactive "what should we do next?" tree

## Inputs

Accept review requests in any of these shapes:

- current diff
- branch or ref range
- file list or directory
- spec path plus implementation scope
- PR URL/number for local analysis only

If the user is vague, make a reasonable default:

- no explicit target -> review the current git diff
- explicit spec file -> run spec-alignment review as well
- behavior or test changes -> include test review

Open `references/target-shapes.md` for the supported target patterns.

## Review Lenses

Prefer Codex-native custom agents from the repo-level `agents/` directory when
they are installed in Codex. If they are not installed yet, emulate the same
lenses by spawning normal Codex reviewer subagents with equivalent prompts.

Open `references/reviewer-lenses.md` for the mapping from request shape to
reviewer set.

### Default reviewer set

- always run `general_reviewer`
- add `spec_alignment_reviewer` when spec/plan/task contract exists
- add `test_reviewer` when behavior changes or tests are relevant

### Optional reviewer set

- add `error_handling_reviewer` when failure handling or operational risk is
  important
- add domain-specific reviewers later when a domain skill or custom agent
  exists

### Optional extra perspective

Add at most one extra non-Codex generic review lane when:

- the user asks for it explicitly
- the change is risky enough that an additional independent perspective is worth
  the extra latency

This lane is additive. Do not duplicate the full Codex reviewer set with
multiple outside runtimes.

## Process

### 1. Determine target and lenses

Figure out:

- what code or scope should be reviewed
- whether there is a spec/plan/task contract
- which reviewer lenses are actually needed
- whether `review-pr` is the better fit

If the user asks for PR comment drafting/posting, hand off to `review-pr`
instead of continuing here.

### 2. Gather scope directly

Do not build a giant discovery workflow.

Gather the minimum necessary review inputs directly:

- current diff or git range when reviewing local work
- explicit files/directories when the user names them
- spec/plan/task docs when the user wants implementation-vs-spec review
- PR metadata/diff when reviewing a PR locally

Keep scope gathering practical and local to the request.

### 3. Launch reviewer agents

Run the selected reviewer lanes in parallel when practical.

Preferred reviewer lanes:

- `general_reviewer`
- `spec_alignment_reviewer`
- `test_reviewer`
- `error_handling_reviewer` when requested or obviously relevant

Rules:

- each reviewer should stay narrow and opinionated
- reviewer lanes are read-only
- reviewer lanes should focus on findings, not code edits
- parent session owns the synthesis

### 4. Synthesize

Produce a concise synthesis with:

- blocking findings
- important non-blocking findings
- disagreements or ambiguities across reviewer lanes
- residual risks or test gaps

If there were no meaningful findings, say so explicitly and mention any
remaining uncertainty.

### 5. Stop after the review

Do not automatically:

- create beads
- fix the implementation
- update specs
- post GitHub comments

If the user wants to act on the findings:

- use `review-pr` for PR comments
- use `receiving-code-review` when implementing feedback
- otherwise continue with normal implementation work

## Output Format

Use this shape unless the user asks for something else:

```markdown
# Review Summary

## Scope
- [what was reviewed]
- [review lenses used]

## Findings

### Blocking
- [finding]

### Important
- [finding]

### Residual Risk
- [risk or test gap]

## Recommended Next Step
- [one clear next step]
```

## Principles

- Keep the entry point small
- Prefer narrow reviewer agents over a giant reviewer prompt
- Use Codex-native reviewer lanes as the main engine
- Treat external review as optional extra perspective
- Stop after reporting; remediation is a separate step
