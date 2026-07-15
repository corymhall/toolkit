---
name: github-search-cli
description: Use GitHub CLI search safely with issues, pull requests, code, and org or repo qualifiers. Use when an agent needs `gh search issues`, `gh search prs`, or `gh search code`, especially when queries include `repo:`, `org:`, quoted phrases, labels, state filters, or when a malformed GitHub search query would waste time.
---

# GitHub Search CLI

## Overview

Build `gh search` commands so GitHub parses qualifiers as qualifiers, not as
literal text inside one big search phrase.

## Command Rules

- Prefer flags for scope where the CLI provides them: `--repo owner/name`,
  `--owner org`, or `--language go`.
- If you use `--repo owner/name` or `--owner org`, do not also include a
  `repo:` or `org:` qualifier in the positional query.
- Keep free-text terms as the positional query. Do not put `org:...`,
  `repo:...`, `is:...`, or `label:...` inside a single shell-quoted string
  unless you have verified that exact form works with this `gh` version.
- In particular, do not write `gh search issues 'repo:owner/name words'` or
  `gh search prs 'repo:owner/name "quoted phrase"'`; this local CLI has
  repeatedly sent those as malformed repository names. Use
  `gh search issues --repo owner/name 'words'` instead.
- Quote only phrases that must stay together inside the query, and keep
  qualifiers outside that phrase.
- For all open and closed issues or PRs, omit `--state` when supported, or run
  separate `--state open` and `--state closed` searches. Do not use
  `--state all` unless `gh search <type> --help` on this machine shows it is
  accepted.
- Keep `gh search prs --json` fields to the search API's supported set. This
  local `gh` does not expose `mergedAt` from `gh search prs`; never include it
  in search output fields. Use `closedAt` or `updatedAt` in search results,
  then run `gh pr view <number> --json mergedAt,mergedBy,mergeCommit` for merge
  details on a specific candidate PR.
- If the first search fails with an invalid query, simplify once to a scoped
  search plus one or two terms, then add filters back incrementally.
- When exhaustive results matter, prefer direct repo queries from a known
  target list over broad org-wide search ordering.

## Patterns

Use repo scoping with flags:

```bash
gh search issues --repo pulumi/pulumi-aws 'timeout waiter' --json number,title,state,url --limit 20
gh search prs --repo pulumi/pulumi-terraform-bridge 'v3.130.0' --json number,title,state,url,closedAt,updatedAt,labels --limit 50
gh search code 'RegisterResourceRequest path:docs/architecture' --repo pulumi/pulumi --json path,url --limit 20
```

For org-wide PR or issue searches, keep scope and type separate from the text:

```bash
gh search prs --owner pulumi 'pulumi-terraform-bridge v3.130.0' --json repository,number,title,url,state,closedAt,updatedAt,labels --limit 200
```

If `--owner` is unavailable for the local `gh`, use a qualifier as a separate
token:

```bash
gh search prs org:pulumi 'pulumi-terraform-bridge v3.130.0' --json repository,number,title,url,state,closedAt,updatedAt,labels --limit 200
```

Avoid this shape; it has repeatedly made GitHub treat the qualifier as part of
a quoted literal query:

```bash
gh search prs 'org:pulumi is:pr "pulumi-terraform-bridge" "v3.130.0"'
```
