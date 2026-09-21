---
name: notion-docs
description: Search, read, comment on, create, and update Notion documentation through the Notion connection in executor. Use for Notion page URLs, IDs, titles, comments, workspace documentation, or creating a document under a specific parent. Do not use for file uploads, database administration, Notion agents, or broad workspace automation.
compatibility: Requires the executor MCP server with an authenticated Notion connection.
---

# Notion Docs

Use the Notion connection through executor. Discover actions with `executor_search_notion_com`. Before calling `executor_execute`, read `executor_skills` with `name: "execute"`. Inspect the selected tool's live schema and call its returned path through executor. Do not assume a connection address or tool argument shape.

## Find and Read Pages

Prefer a supplied page URL or ID. Discover the page-fetch tool and fetch it directly, including discussions when relevant.

When only a title or topic is available, discover the content-search tool and search with one focused query. Prefer workspace search.

Use `ai_search` only when semantic search or connected sources are relevant. Search is not exact identity resolution. Compare titles, URLs, and parent context, and ask the user to choose when multiple plausible pages remain.

Fetch the selected result before making claims about its content. In the answer, identify source pages by title and returned URL. Fetch only the pages needed for the request, and do not save workspace documentation in repository files unless the user asks.

## Review Comments

Fetch unresolved page and block discussions when review context matters. Discover the comments tool and inspect its filters for block discussions and resolved state.

Use a returned discussion URL or ID to retrieve one discussion. Preserve the distinction between page comments, inline discussions, authors, and resolved state.

Create or reply to a comment only when the user explicitly asks. Before an inline comment, fetch the current page and make `selection_with_ellipsis` specific enough to identify one location.

## Create Documents

Before writing, fetch the exact parent and verify its title and URL. Ask when the destination is ambiguous. Inspect the current tool schema through executor before constructing a write.

Create the page with the discovered page-creation tool, an explicit `parent`, a title property, and Notion Markdown content. Use `allow_async: true` for large documents and poll the returned task with the discovered async-task tool using its suggested delay, if the live tools support this workflow.

An explicit request to create a document authorizes that write after the parent and content are clear. After creation, fetch the new page, verify its title and parent, and return its URL.

## Update Existing Pages

Do not update, replace, move, duplicate, or delete existing content unless the user explicitly asks. Fetch the current page immediately before an update.

Prefer focused `update_content` or `insert_content` operations. Treat `replace_content` and `allow_deleting_content` as destructive: state what will be replaced and get confirmation unless the user's request already specifies that exact replacement.

Inspect the live schema through executor before a write because the hosted tool surface can change.

After an update, fetch the page again and verify the requested result.

## Authentication and Failures

If executor reports missing or expired authorization, ask the user to reconnect Notion in executor. Do not inspect token files or print credentials. Do not start a new authorization flow unless the user asks. If discovery tools are missing, refresh the executor tool list before concluding that Notion is unavailable.
