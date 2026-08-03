---
name: notion-docs
description: Use the authenticated Notion CLI (`ntn`) to find, read, and link Notion pages, inspect a page's direct or recursive sub-page structure, and create Markdown documents under a specific Notion parent. Use for company-doc requests involving Notion URLs, page IDs, page titles, destination pages, or page trees. Do not use for Notion Workers, file uploads, database administration, or broad API automation.
---

# Notion Docs

Use `ntn` for ordinary documentation work while keeping page identity, hierarchy,
and write destinations explicit.

## Resolve Pages

Prefer a supplied page ID or URL. Extract the 32 hexadecimal page ID from a
Notion URL (hyphens are optional); do not treat unrelated query parameters as the
page ID.

When only a title or location name is available, search by title:

```bash
jq -n --arg query "$query" \
  '{query:$query, filter:{property:"object", value:"page"}, page_size:100}' |
  ntn api v1/search
```

Search is fuzzy. Compare titles and parent metadata, and ask the user to choose
when multiple plausible pages remain. Follow `has_more` and `next_cursor` when a
complete result set matters.

Retrieve page metadata when identity or a link matters:

```bash
ntn api "v1/pages/$page_id" -X GET
```

Use the returned `url` as the canonical workspace link; do not reconstruct a URL
from an ID or substitute `public_url`. Use the title property from `properties`
when the display title is needed.

## Read Pages

Read ordinary page content as Markdown:

```bash
ntn pages get "$page_id"
```

If the command warns that Markdown was truncated, rerun with `--json`, inspect
`unknown_block_ids`, and disclose any content that could not be read. Do not
claim a complete summary from truncated output.

Fetch only the content needed for the request. A request for structure does not
require reading every descendant page body. Do not save company documentation
in repository files unless the user asks for a local artifact.

In the answer, identify the source page by title and canonical URL. For a
multi-page result, link each page whose metadata was retrieved rather than
returning bare IDs.

## Inspect Page Structure

List a page or block's children with:

```bash
ntn api "v1/blocks/$block_id/children" -X GET page_size==100
```

Continue with `start_cursor==<next_cursor>` until `has_more` is false.

- For immediate sub-pages, report blocks whose `type` is `child_page`, using the
  block ID and `child_page.title`.
- For all descendant pages, recursively list each child page's children.
- For a complete block layout, also recurse into non-page blocks with
  `has_children: true`; this avoids skipping content nested in columns, toggles,
  or other containers.
- Keep the distinction between real child pages and links, mentions, bookmarks,
  databases, or data sources. Include the latter only when the requested layout
  calls for them.
- Prevent cycles or duplicate traversal by tracking visited block/page IDs.

Return a compact indented tree. Retrieve each listed page's metadata when the
user wants clickable links.

## Create Documents

Before writing, resolve the exact parent page and verify its title and canonical
URL. Do not omit `--parent` and accidentally create at an unintended workspace
location. If the destination is ambiguous, ask before creating anything.

Prepare Markdown with the intended title as its leading H1. Pass an existing
requested artifact or a temporary file outside the repository through stdin
rather than placing a long document in a shell argument:

```bash
ntn pages create --parent "page:$parent_id" --json < "$document_path"
```

An explicit user request to create the document authorizes the write once the
parent and content are clear; do not add a redundant confirmation. After
creation, use the returned ID to retrieve the page metadata, verify the title
and parent, and return its canonical `url`. Remove temporary local content when
it is no longer needed.

Do not edit, replace, move, or trash existing content unless explicitly asked.
`ntn pages edit` replaces page content and can affect nested objects, so inspect
its current help and the target page before any such request.

## Handle CLI Differences and Failures

The CLI and API are beta. Before guessing unsupported syntax, inspect the local
command:

```bash
ntn <command> --help
ntn api ls
ntn api <path> --help
ntn api <path> --docs -X <METHOD>
ntn api <path> --spec -X <METHOD>
```

On authentication or workspace errors, run `ntn doctor` and report the failing
boundary. Never print or inspect token values or credential files, and do not
start an interactive login unless the user asks.
