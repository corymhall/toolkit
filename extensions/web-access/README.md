# Web Access extension

A deliberately narrow Pi extension with two tools:

- `web_search`: OpenAI `web_search` through Pi's OpenAI Codex subscription login.
- `fetch_content`: constrained GitHub reads through `gh api`, or direct HTTP(S) fetching with local Readability-to-Markdown conversion.

It does not contain skills and does not use third-party search or extraction fallbacks. In particular, it does not use Jina Reader, Gemini, Parallel, Brave, Exa, Tavily, or Perplexity.

## Requirements

- Sign into the `openai-codex` provider using Pi's `/login` command.
- Install and authenticate GitHub CLI (`gh auth login`) for GitHub URLs.
- Install this package's npm dependencies.

## Supported GitHub URLs

- `https://github.com/owner/repo`
- `https://github.com/owner/repo/blob/ref/path/to/file`
- `https://github.com/owner/repo/tree/ref/path/to/directory`

Repository URLs return the root listing and README. Only public repositories are accepted, even when `gh` is authenticated for private repositories. The extension never clones or executes repository content. Branch names containing `/` are not currently supported in GitHub web URLs because the ref/path boundary is ambiguous.

## Security boundaries

- Direct HTTP fetching rejects credential-bearing URLs and common non-public address ranges, including loopback, private, link-local, multicast, and documentation networks.
- Validated DNS addresses are pinned to the HTTP connection, and every redirect destination is separately validated and pinned.
- Responses are limited to 5 MB and final tool output stays within Pi's standard 50 KB/2,000-line truncation.
- Remote content is explicitly labeled as untrusted in tool results.
- These controls reduce risk but do not make remote content immune to prompt injection. Run Pi in an OS sandbox when exploring adversarial material.
