---
name: explain-pr
description: Generate a visual local webpage that explains a GitHub PR as a decision and behavior change, not a defect-finding review. Use when the user asks to understand a PR, asks what a PR is doing, wants a walkthrough, wants a plan-review-style assessment, or wants root problem, before/after examples, tradeoffs, compatibility risks, proof gaps, and reviewer questions.
---

# Explain PR

Produce a visual, reviewer-facing webpage that explains a GitHub PR.

This skill is not for posting GitHub comments and is not primarily a code-defect
review. It helps a human reviewer understand the problem, the chosen solution
shape, the tradeoffs, and the behavioral or compatibility risks before deciding
whether deeper code review is needed.

Use `review-pr` when the user wants draft or posted GitHub review comments. Use
`request-review` when the user wants findings-first technical review.

## Inputs

Accept:

- a GitHub PR URL
- a PR number in the current repo
- "this PR" when the active checkout clearly points at a PR branch

If the PR cannot be identified from local context, ask for the URL or number.

## Gather Context

Use `gh` for GitHub context:

```bash
gh pr view <number> --json title,body,author,baseRefName,headRefName,headRefOid,files,additions,deletions,commits,reviewDecision
gh pr diff <number>
gh pr checks <number>
```

For GitHub URLs, derive owner, repo, and number, then use `gh api` or `gh pr
view --repo <owner>/<repo>` as needed.

Read the PR description first, but do not treat it as complete or neutral.
Compare it against the changed files and tests. If the PR references an issue,
design note, release note, or linked discussion that is central to the stated
problem, fetch that too.

Keep setup read-only. Do not rebase, merge, checkout, reset, or edit files
unless the user separately asks for implementation work.

## Analysis Lens

Focus on decisions and consequences:

- What root problem is this PR solving?
- What behavior or workflow existed before?
- What model does the PR introduce after?
- Which decision did the PR make, and what alternatives did it reject?
- What becomes easier, stricter, lazier, earlier, later, broader, narrower, or
  more generated?
- What could break for users, maintainers, generated SDKs, integrations, or
  existing state?
- What evidence proves the model, and what remains unproven?

Prefer concrete visuals over prose:

- real snippets from the PR over line references
- before/after examples over abstract descriptions
- diagrams, timelines, and flow cards over paragraphs
- tables and matrices over bullet lists
- small user-code, schema, state, config, CLI, or pseudocode examples over file
  narration

Use file paths and line references only as supporting labels for snippets or
evidence, not as the primary explanation.

Do not spend the brief walking file-by-file unless the file structure is itself
part of understanding the decision.

## Pulumi Provider Lens

When the PR is in a Pulumi provider, bridge, SDK, or related tooling repo, also
classify the touched layer:

- upstream provider behavior or patches
- Pulumi provider runtime behavior
- bridge mapping, schema generation, or token/default fixups
- generated SDK/API surface
- lifecycle behavior such as preview, update, refresh, import, diff, check,
  replacement, or provider configuration
- examples, docs, CI, or release tooling

Call out compatibility surfaces that human reviewers commonly need to
pressure-test:

- schema shape, token names, enum/value changes, `oneOf` changes, requiredness,
  defaults, aliases, autonaming, and deleted outputs
- generated SDK source or binary compatibility
- existing stack upgrade behavior and state migration
- import/refresh behavior versus new-create behavior
- provider-vs-bridge-vs-upstream ownership boundaries
- generated or mechanical diffs that should not distract from the decision

## Webpage Output

Create a self-contained local HTML file and give the user the URL or absolute
file path. Markdown is only for the short final status message.

Use a page structure like this, adapting to the PR:

- **Hero**: title, PR number, author, base/head, size badges, and one-sentence
  read.
- **Problem Exhibit**: the root problem with a concrete before example. Use a
  snippet, state shape, API call, CLI output, lifecycle trace, or diagram.
- **Before / After**: side-by-side cards showing old and new behavior. Prefer
  real examples from the PR over paraphrase.
- **How It Works**: a visual flow, timeline, dependency graph, or short
  pseudocode block that explains the mechanism.
- **Decision Table**: chosen approach, tradeoff, rejected alternative, reviewer
  pressure point.
- **Compatibility Map**: user-visible, maintainer-visible, generated,
  lifecycle, and operational risks.
- **Proof Board**: tests, examples, generated outputs, CI checks, and the exact
  behavior each proves.
- **Gaps And Questions**: visual callouts for unresolved assumptions and the
  questions a human reviewer should answer before approving.

Prefer:

- split-screen before/after panels
- sequence diagrams with CSS boxes or inline SVG
- matrix tables for compatibility and proof
- collapsible sections for mechanical generated diffs
- syntax-highlighted or clearly styled code snippets
- badges for layers touched, risk level, and proof strength

Avoid:

- long paragraphs
- file-by-file diff narration
- raw line-reference lists without snippets
- dumping the whole PR diff into the page

The page should be useful when opened independently later. Include enough PR
metadata and links that the artifact is self-contained.

## HTML Implementation

Default to a single HTML file under `/tmp`, such as
`/tmp/explain-pr-<owner>-<repo>-<number>.html`. Inline CSS and small scripts so
the page can be opened directly.

If the page benefits from local serving, start a simple server from `/tmp` on a
fixed localhost port and report the URL:

```bash
cd /tmp && python3 -m http.server 8432 --bind 127.0.0.1
```

If that port is busy, try `8433`, `8434`, and so on. Do not leave unnecessary
servers running after the task if the user only needs the file.

Use HTML escaping for snippets. If embedding patch or PR data into a script tag,
serialize through JSON and replace literal `<`, `>`, and `&` with Unicode
escapes so `</script>` in source code cannot break the page.

## Boundaries

- Do not post GitHub comments.
- Do not convert the brief into a findings-first code review unless the user
  asks.
- Do not return the main walkthrough as Markdown unless the user explicitly asks
  for text-only output.
- Do not hide uncertainty. If intent cannot be inferred from the PR, say what is
  unclear and which issue, doc, or author question would resolve it.
- If the PR appears mechanically generated, still explain the source-of-truth
  change that produced it.
