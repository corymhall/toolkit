# GitHub Tools Extension Plan

## Goal

Bring the high-value read workflows from the official GitHub MCP server into Pi
while authenticating through the user's local `gh` session. This avoids the
single-resource-owner limitation of fine-grained personal access tokens while
preserving the toolkit's bounded output, untrusted-content labeling, and compact
tool cards.

This document is a restart aid for work that may span multiple context
compactions. Re-check the current repository and user intent before treating an
implementation detail here as fixed.

## Evidence From Saved Pi Sessions

An Evaler scan across 234 saved Pi sessions found at least:

- 294 `github_search` calls
  - 125 issue searches
  - 117 code searches
  - 52 pull-request searches
- 397 Bash calls containing `gh` across 50 sessions
  - 133 `gh api`
  - 90 `gh pr view`
  - 38 `gh issue view`
  - 31 `gh run ...`
  - 26 `gh pr list`
  - 14 `gh pr diff`
  - 14 `gh pr checks`
- 314 GitHub URLs passed to `fetch_content`
  - 227 blob URLs
  - 21 tree URLs
  - 18 issue URLs
  - 1 pull-request URL
- 61 recorded `fetch_content` failures because GitHub issue, pull-request,
  Actions, or other unsupported GitHub URLs were supplied.

These counts are lower bounds because Evaler's aggregate responses were
truncated.

Representative evidence:

- Session `01a0c541-6dc6-72ba-a5f4-6da93c34e8d5`, turn 7: issue triage used
  `github_search` to identify related reports and `gh issue view` for complete
  issue bodies and comments.
- Session `01a0cfa4-ee10-7200-b4f6-25db7df09475`, turn 2: PR investigation
  used `gh pr view`, review comments, check runs, and failed job logs to trace a
  CI failure.
- Session `01a08246-36f4-720f-b2a0-0fb605ced7f1`, turns 21-22: review follow-up
  used raw `gh api` calls for review comments, reviews, status checks, and
  replies.
- Session `01a0c541-6dc6-72ba-a5f4-6da93c34e8d5`, turn 1, items
  `item_98000023aff77856144244f64700178260cbfa88eaf17b787cc90ceddc1c8d75`
  and `item_9b7612a49f633cec13e76c49ce883e329ca14ac057494b3f8231dae8d1531eba`:
  pasted GitHub URLs failed because `fetch_content` accepted only repository,
  blob, and tree URLs.

The recurring workflow is:

```text
github_search
-> identify issue or PR
-> gh issue view / gh pr view
-> gh api for comments, reviews, files, checks, or status
-> gh run view for failed CI logs
```

## Settled Decisions

- Extend `extensions/web-access`; it already owns GitHub authentication,
  argument-safe `gh` execution, untrusted-content labels, bounded output,
  private complete-output files, timing, and tool cards.
- Keep `github_search`. Exact GitHub search is materially more complete than the
  MCP server's semantic issue search and is heavily used with repository,
  owner, path, and language scope.
- Keep local `gh` as the fallback for uncommon endpoints and operations tied to
  local branches, commits, pushes, or hooks.
- Add focused read tools for issues, pull requests, and Actions.
- Route pasted issue, pull-request, and Actions URLs to the corresponding read
  implementation.
- Keep GitHub writes out of the initial implementation. Existing `gh` workflows
  handle PR creation, issue editing, review replies, and other mutations with
  explicit user intent.
- Do not expose a generic arbitrary GitHub API proxy.

## Proposed Tools

### `github_issue`

```ts
{
  owner: string;
  repo: string;
  number: number;
  view?: "summary" | "comments" | "all";
  limit?: number;
}
```

Normalize issue title, body, state, author, labels, assignees, milestone,
timestamps, URL, comments, and linked pull-request information when available.

### `github_pull_request`

```ts
{
  owner: string;
  repo: string;
  number: number;
  view:
    | "summary"
    | "files"
    | "diff"
    | "commits"
    | "comments"
    | "reviews"
    | "checks";
  limit?: number;
}
```

Cover the recurring `gh pr view`, `gh pr diff`, pull-file pagination, review and
conversation comments, reviews, checks, and commit-status calls.

### `github_actions`

```ts
{
  owner: string;
  repo: string;
  view: "run" | "jobs" | "job_logs" | "failed_logs";
  runId?: number;
  jobId?: number;
  tailLines?: number;
}
```

For failed logs, preserve complete logs privately and return bounded tails
organized by job.

## GitHub URL Dispatch

- `/issues/<number>` -> `github_issue` summary
- `/pull/<number>` -> `github_pull_request` summary
- `/actions/runs/<id>` -> `github_actions` run summary
- Existing repository, blob, and tree behavior remains.

A single pasted URL should return a useful bounded summary. Richer views remain
explicit tool calls.

## Security And Output Constraints

- Invoke `gh` with structured subprocess arguments rather than shell command
  strings.
- Treat all GitHub content as untrusted remote data.
- Bound model-visible comments, files, patches, diffs, and logs.
- Save complete successful output to private temporary files with mode `0600`.
- Keep Pi's standard 50 KB / 2,000-line visible bound.
- Validate owner, repository, issue, pull-request, run, and job identifiers.
- Preserve abort signals and request timeouts.
- Normalize API output so large or irrelevant GitHub response fields do not
  consume model context.
- Require explicit user intent and appropriate policy before any future write
  tools are considered.

## Implementation Status

- `github_issue` and `/issues/<number>` URL dispatch are implemented in the
  current working tree, with focused Node and Bun tests. `mise run validate`
  passed after this slice was implemented.
- `github_pull_request` summary, files, conversation comments, submitted and
  inline review comments, checks, commit statuses, and `/pull/<number>` URL
  dispatch are implemented and validated in the current working tree.
- Pull-request diff and commit views are implemented and validated in the
  current working tree.
- Actions run, jobs, individual job logs, failed-job logs, and Actions-run URL
  dispatch are implemented and validated in the current working tree.

## Implementation Order

1. Add `github_issue` and issue URL dispatch. (Implemented and validated.)
2. Add `github_pull_request` summary, files, comments, reviews, and checks. (Implemented and validated.)
3. Add pull-request diff and commit views. (Implemented and validated.)
4. Add `github_actions` run, jobs, job logs, and failed-log retrieval. (Implemented and validated.)
5. Re-run Evaler usage analysis before considering write tools.

## Current Repository State At Plan Creation

The working tree already contains related routing changes:

- `extensions/web-access/index.ts` clarifies that `github_search` is intended for
  exact or exhaustive GitHub searches.
- `skills/github/github-search-cli/SKILL.md` and
  `skills/github/github-search-cli/agents/openai.yaml` place executor and
  `github_search` ahead of CLI fallback.
- `~/.pi/agent/AGENTS.md` contains GitHub routing guidance outside this Git
  repository.
- `mise run validate` passed after those changes.

Always inspect `git status` and the current diff before continuing.

## Required Repository Updates

For each implemented slice:

- Add focused implementation tests, including invalid input, private repository
  access where mockable, output bounds, and untrusted-content labeling.
- Update `extensions/web-access/README.md`.
- Update the root `README.md` when the user-visible tool surface changes.
- Update package smoke-test expectations when package resources change.
- Update tool registration and tool-card rendering tests.
- Run `mise run validate` after extension, skill, installer, or package metadata
  changes.

## Open Design Questions

- Whether three focused tools are preferable to one discriminated `github_read`
  tool after field experience.
- Exact limits for comments, files, patches, diffs, and logs.
- Whether URL dispatch should always return a summary or infer richer views from
  URL fragments and query parameters.
- Whether Actions eventually deserves a dedicated extension if its log and
  artifact handling grows substantially.
