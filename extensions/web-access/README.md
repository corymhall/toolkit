# Web Access extension

A deliberately narrow Pi extension with six tools:

- `web_search`: OpenAI `web_search` through Pi's OpenAI Codex subscription login.
- `github_search`: authenticated GitHub issue, pull-request, and code search through structured `gh api` queries.
- `github_issue`: authenticated GitHub issue summaries and comments through constrained `gh api` reads.
- `github_pull_request`: authenticated pull-request summaries, files, diffs, commits, comments, reviews, checks, and commit statuses.
- `github_actions`: authenticated workflow-run summaries, jobs, individual job logs, and failed-job logs.
- `fetch_content`: constrained GitHub reads through `gh api`, or direct HTTP(S) fetching with local Readability-to-Markdown conversion.

It does not contain skills and does not use third-party search or extraction fallbacks. In particular, it does not use Jina Reader, Gemini, Parallel, Brave, Exa, Tavily, or Perplexity.

Successful results are written to private Markdown files in the OS temp directory.
The model receives the normal bounded result. In Pi's TUI, collapsed calls use
the toolkit's compact Cendre-aware cards with `Query:` or `URL:` details and
execution metadata. GitHub searches also show `Repo:` or `Repos:` when the call
has repository scope. Expanding the cards shows only the untrusted-content
warning, title or query, source, and a clickable full-output path. Temp-file
retention follows the operating system's cleanup policy.

`fetch_content` opts into Pi's sequential tool execution. A turn containing it
runs sibling tool calls serially, trading parallel fetch throughput for
reliability after observed parallel custom-tool batch stalls. Direct HTTP reads
use a pinned `node:http`/`node:https` transport because npm Undici response
bodies can stall indefinitely when the standalone Bun-based Pi runtime consumes
them. A ref-counted 5-second deadline rejects reads even when a Web Stream's
read or cancellation promise never settles.

## Requirements

- Sign into the `openai-codex` provider using Pi's `/login` command.
- Install and authenticate GitHub CLI (`gh auth login`) for GitHub URLs.
- Install this package's npm dependencies.

## GitHub search

`github_search` accepts free-text terms separately from structured repository,
owner-account, state, label, language, and path filters. It rejects `repo:`,
`org:`, and `user:` scope embedded in the free-text query so malformed CLI
argument grouping cannot silently change the search. It returns compact JSON
metadata without issue or pull-request bodies; code results may contain bounded
text-match fragments.

Search uses the authenticated `gh` account and can return private repository
results. GitHub's REST code-search endpoint uses its legacy code search engine,
so code results can differ from searches on github.com.

## GitHub issues

`github_issue` reads one issue by owner, repository, and number. Its `summary`
view returns normalized metadata and the complete issue body. `comments` returns
the first bounded page of normalized comments, and `all` returns both. The
default comment limit is 30 and the maximum is 100. Results report when
additional comments were omitted.

## GitHub pull requests

`github_pull_request` reads one pull request by owner, repository, and number.
Its views return a summary, changed files, the unified diff, commits,
conversation comments, submitted reviews with inline review comments, or
head-commit check runs and commit statuses. Related collections return their
first bounded page. For the reviews view, the limit applies separately to
reviews and inline comments. Inline comments are returned as a flat REST list
without review-thread resolution metadata. The default limit is 30 and the
maximum is 100. Diff output relies on Pi's model-visible bound while preserving
the complete API response in the private output file.

## GitHub Actions

`github_actions` reads a workflow run, up to 100 jobs for a run, one job's logs,
or logs for up to 20 failed jobs from the returned jobs page. Log reads save the
complete retrieved output privately and return the last 200 lines per job by
default; `tailLines` accepts 1 through 2,000. Failed logs are fetched
sequentially to avoid concurrent subprocess stalls. A run with more than 100
jobs reports that its job view is bounded.

## Supported GitHub URLs

- `https://github.com/owner/repo`
- `https://github.com/owner/repo/issues/123`
- `https://github.com/owner/repo/pull/123`
- `https://github.com/owner/repo/actions/runs/123`
- `https://github.com/owner/repo/blob/ref/path/to/file`
- `https://github.com/owner/repo/tree/ref/path/to/directory`

Issue, pull-request, and Actions-run URLs return summaries without related
collections; use the corresponding GitHub tool for richer views. Repository
URLs return the root listing and README. Private repositories work when the
authenticated `gh` account can access them. The extension never clones or
executes repository content. Branch names containing
`/` are not currently supported in GitHub web URLs because the ref/path
boundary is ambiguous.

## Security boundaries

- Direct HTTP fetching rejects credential-bearing URLs and common non-public address ranges, including loopback, private, link-local, multicast, and documentation networks.
- Validated DNS addresses are pinned to the HTTP connection, and every redirect destination is separately validated and pinned.
- Responses are limited to 5 MB and final model-visible tool output stays within Pi's standard 50 KB/2,000-line truncation.
- Saved output files use mode `0600`; when model-visible output is truncated, the saved file retains the complete fetched result.
- Remote content is explicitly labeled as untrusted in tool results.
- GitHub search and fetching use the authenticated `gh` account and can send content from any accessible repository to the active model. A prompt-injected tool call that knows a private repository or suitable search terms therefore has the same read access.
- These controls reduce risk but do not make remote content immune to prompt injection. Run Pi in an OS sandbox when exploring adversarial material.
