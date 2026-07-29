---
name: notion-docs
description: Use the authenticated Notion CLI (`ntn`) to find, read, and link Notion pages, review unresolved comments, inspect page hierarchy, synchronize Notion documents to local Markdown, and create documents under a specific parent. Use for Notion page URLs, IDs, titles, comments, local document sync, or page trees. Do not use for Notion Workers, file uploads, database administration, or broad API automation.
---

# Notion Docs

Use the `ntn` CLI to perform documentation operations with explicit page identity, hierarchy, and write targets.

---

## Master Command Reference

| Task | Command | Key Flags / Notes |
| :--- | :--- | :--- |
| **Search Page by Title** | `jq -n --arg q "$query" '{query:$q, filter:{property:"object", value:"page"}}' \| ntn api v1/search` | Fuzzy search; compare titles and parents |
| **Get Page Metadata** | `ntn api "v1/pages/$PAGE_ID" -X GET` | Returns canonical workspace `url` |
| **Get Page Content** | `ntn pages get "$PAGE_ID"` | Outputs Markdown; use `--json` to check completeness |
| **List Unresolved Comments** | `ntn api "v1/comments" -X GET block_id=="$BLOCK_ID" page_size==100` | Paginate when the complete discussion set matters |
| **List Direct Sub-Pages** | `ntn api "v1/blocks/$PAGE_ID/children" -X GET page_size==100` | Filter blocks by `type == "child_page"` |
| **Create Markdown Page** | `ntn pages create --parent "page:$PARENT_ID" --json < file.md` | Requires leading H1 as title |
| **CLI Diagnostics** | `ntn doctor` | Diagnose auth or config boundaries |

---

## Workflows

### 1. Resolving Pages
- **URL Extraction:** Extract the 32-hex character ID from Notion URLs (hyphens optional). Ignore query parameters.
- **Title Search:** If only a title is provided, run `ntn api v1/search`. If multiple pages match, ask the user to pick.
- **Canonical Links:** Always use the `url` property returned by `v1/pages/$PAGE_ID` for clickable links. Do not reconstruct custom URLs.

### 2. Reading Content
- Fetch page content with `ntn pages get "$PAGE_ID"`.
- **Completeness Check:** Use `ntn pages get "$PAGE_ID" --json` when completeness matters. Do not claim an exact read if `truncated` is true or `unknown_block_ids` is non-empty.
- **Formatting:** Identify source pages by title and canonical URL in output responses.

### 3. Reviewing Comments
- List unresolved comments for the relevant page or block. Follow `has_more` and `next_cursor` when the complete discussion set matters.
- Ask users to leave comments unresolved until they have been processed. Retrieve a parent block with `ntn api "v1/blocks/$BLOCK_ID" -X GET` when inline context matters.
- Preserve the distinction between a comment's author, discussion ID, parent, and text.
- Treat a `403` as a missing read-comment capability, not proof that no comments exist.

### 4. Inspecting Page Structure
- Fetch block children using `v1/blocks/$BLOCK_ID/children`.
- Paginate using `start_cursor==<next_cursor>` while `has_more` is true.
- **Recurse:** Recurse into `child_page` blocks for page trees, and into container blocks (`has_children: true`) for complete layout trees. Track visited IDs to prevent cycles.

### 5. Synchronizing Local Markdown
- Establish an explicit page-to-file mapping. Use supplied paths and existing titles as evidence; ask when a mapping is materially ambiguous.
- Read every mapped page with `ntn pages get "$PAGE_ID" --json`. Require `truncated: false` and an empty `unknown_block_ids` list before claiming an exact sync.
- Preserve wording and document structure. Normalize only transport-specific markup: repository-standard H1 titles, Markdown line breaks, mapped page mentions as relative links, and generated sub-page navigation that is not body content.
- Change only mapped files. Do not remove local annexes merely because they are absent from the requested Notion tree.
- If both Notion and local files changed and the source of truth is unclear, ask which side wins. Report the source URLs and local paths that were synchronized.

### 6. Creating and Editing Pages
- **Parent Validation:** Verify the parent ID, title, and canonical URL before creation. Always pass `--parent "page:$PARENT_ID"`.
- **Content Source:** Pass Markdown via stdin rather than inline shell arguments. Ensure the leading H1 is the page title.
- **Edits and Destructive Operations:** Do not edit, replace, or trash pages unless explicitly instructed. `ntn pages edit` overwrites page content and child blocks.

### 7. CLI Debugging
- If CLI commands fail, run `ntn <command> --help` or `ntn doctor`.
- Never print or expose tokens or credentials in logs or chat output.
