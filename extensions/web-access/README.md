# Web Access extension

A deliberately narrow Pi extension with three tools:

- `web_search`: OpenAI `web_search` through Pi's OpenAI Codex subscription login.
- `github_search`: authenticated GitHub issue, pull-request, and code search through structured `gh api` queries.
- `fetch_content`: constrained GitHub reads through `gh api`, or direct HTTP(S) fetching with local Readability-to-Markdown conversion.

It does not contain skills and does not use third-party search or extraction fallbacks. In particular, it does not use Jina Reader, Gemini, Parallel, Brave, Exa, Tavily, or Perplexity.

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

## Supported GitHub URLs

- `https://github.com/owner/repo`
- `https://github.com/owner/repo/blob/ref/path/to/file`
- `https://github.com/owner/repo/tree/ref/path/to/directory`

Repository URLs return the root listing and README. Private repositories work when the authenticated `gh` account can access them. The extension never clones or executes repository content. Branch names containing `/` are not currently supported in GitHub web URLs because the ref/path boundary is ambiguous.

## Security boundaries

- Direct HTTP fetching rejects credential-bearing URLs and common non-public address ranges, including loopback, private, link-local, multicast, and documentation networks.
- Validated DNS addresses are pinned to the HTTP connection, and every redirect destination is separately validated and pinned.
- Responses are limited to 5 MB and final tool output stays within Pi's standard 50 KB/2,000-line truncation.
- Remote content is explicitly labeled as untrusted in tool results.
- GitHub search and fetching use the authenticated `gh` account and can send content from any accessible repository to the active model. A prompt-injected tool call that knows a private repository or suitable search terms therefore has the same read access.
- These controls reduce risk but do not make remote content immune to prompt injection. Run Pi in an OS sandbox when exploring adversarial material.
