---
name: notion-docs
description: Search, read, comment on, create, and update Notion documentation through the official hosted Notion MCP server with mcporter. Use for Notion page URLs, IDs, titles, comments, workspace documentation, or creating a document under a specific parent. Do not use for file uploads, database administration, Notion agents, or broad workspace automation.
compatibility: Requires Node.js with npx, network access, and an authenticated `notion` server in mcporter.
---

# Notion Docs

Use the configured official Notion MCP server through `mcporter`:

```bash
npx mcporter list notion --brief
```

## Find and Read Pages

Prefer a supplied page URL or ID. Fetch it directly:

```bash
npx mcporter call 'notion.notion-fetch(id: "<page-url-or-id>", include_discussions: true)'
```

When only a title or topic is available, search first:

```bash
npx mcporter call 'notion.notion-search(query: "<one focused query>", content_search_mode: "workspace_search")'
```

Use `ai_search` only when semantic search or connected sources are relevant. Search is not exact identity resolution. Compare titles, URLs, and parent context, and ask the user to choose when multiple plausible pages remain.

Fetch the selected result before making claims about its content. In the answer, identify source pages by title and returned URL. Fetch only the pages needed for the request, and do not save workspace documentation in repository files unless the user asks.

## Review Comments

Fetch unresolved page and block discussions when review context matters:

```bash
npx mcporter call 'notion.notion-get-comments(page_id: "<page-id>", include_all_blocks: true, include_resolved: false)'
```

Use a returned discussion URL or ID to retrieve one discussion. Preserve the distinction between page comments, inline discussions, authors, and resolved state.

Create or reply to a comment only when the user explicitly asks. Before an inline comment, fetch the current page and make `selection_with_ellipsis` specific enough to identify one location.

## Create Documents

Before writing, fetch the exact parent and verify its title and URL. Ask when the destination is ambiguous. Inspect the current tool schema before constructing a write:

```bash
npx mcporter list notion --schema
```

Create the page with `notion.notion-create-pages`, an explicit `parent`, a title property, and Notion Markdown content. Use `allow_async: true` for large documents and poll the returned task with `notion.notion-get-async-task` using its suggested delay.

An explicit request to create a document authorizes that write after the parent and content are clear. After creation, fetch the new page, verify its title and parent, and return its URL.

## Update Existing Pages

Do not update, replace, move, duplicate, or delete existing content unless the user explicitly asks. Fetch the current page immediately before an update.

Prefer focused `update_content` or `insert_content` operations. Treat `replace_content` and `allow_deleting_content` as destructive: state what will be replaced and get confirmation unless the user's request already specifies that exact replacement.

Inspect the live schema before a write because the hosted tool surface can change:

```bash
npx mcporter list notion --schema
```

After an update, fetch the page again and verify the requested result.

## Authentication and Failures

If mcporter reports `401` or missing authorization, report that `npx mcporter auth notion` is required. Do not inspect token files or print credentials. Do not start a new authorization flow unless the user asks to configure or reconnect Notion.
