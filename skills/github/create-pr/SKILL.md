---
name: create-pr
description: Create, draft, or update a GitHub pull request using a direct, technically specific, reviewer-oriented tone. Use when asked to open or create a PR, create a draft PR, draft or revise a PR title or body, or update an existing PR description. For stacked PRs, use git-spice-stack-prs for stack mechanics and this skill for each PR's title and description.
---

# Create PR

Create the smallest reviewer-facing pull request that makes the change and its
reasoning easy to understand. Match the explanation to the change: a mechanical
fix may need a few sentences, while a risky behavior change may need examples,
tradeoffs, migration guidance, or focused review questions.

Read [references/tone.md](references/tone.md) and use that tone when writing the
title and description. Treat it as engineering guidance, not a fixed template.

A request to create, open, or update a PR authorizes that GitHub operation. A
request for only a draft title or description is non-mutating; return Markdown.
A request to create a draft PR still authorizes creation. Do not add a separate
approval gate unless important ambiguity remains.

## Establish The Story

Inspect the repository instructions and PR template, the current conversation,
the complete branch diff, commit history, linked issues, existing PR body, and
actual validation evidence.

Understand enough to explain only what matters:

- what happens today and why it matters
- what behavior or workflow changes
- why this approach was chosen
- what evidence supports the important claims
- what tradeoff, compatibility boundary, migration, fallback, follow-up, or
  reviewer decision is consequential

Treat the conversation as the source of truth for intent and accepted decisions.
Use the repository to verify implementation facts. Distinguish observed
behavior, accepted decisions, proposals, and uncertainty. Do not invent issue
relationships, rationale, alternatives, metrics, validation, or certainty.

Before creating a PR, check repository status and whether the head branch
already has a PR. If uncommitted changes appear to belong in the requested PR,
do not silently omit them; resolve their intended scope first.

## Write For Reviewers

Choose a concise title that describes the outcome and follows repository
conventions.

Open the description with the problem or direct behavioral change. Follow the
causal chain from current behavior to its consequence and then to the changed
behavior. Explain implementation details at the behavioral boundary rather than
walking the diff file by file.

Use a real scenario, before/after example, output, state shape, or short list
when it makes the behavior easier to understand. For consequential changes,
state the relevant tradeoff, rejected alternative, compatibility impact,
migration, conservative fallback, deliberate limitation, or follow-up. Ask a
reviewer question only when a real decision remains.

Report validation specifically and proportionally. Distinguish tests added from
tests actually run, and name missing validation when it affects confidence. Use
closing issue keywords only when the relationship is known and intentional.

Keep ordinary descriptions in short paragraphs. Add descriptive headings only
when they help navigate a complex or risky change. Preserve required repository
template sections, but omit optional or empty boilerplate. Every visible
sentence should change the reviewer's understanding.

Avoid:

- converting the commit message or diff summary directly into the PR body
- mandatory `Summary`, `Changes`, `Testing`, `Risk`, or `Rollback` sections
- listing files without explaining behavior
- generic claims such as “improves robustness” or “enhances maintainability”
- repeating a linked issue instead of explaining the chosen change
- exhaustive logs or edge-case lists that do not affect review
- a polished recap after the useful explanation is complete

## Create Or Update The PR

For a new PR, determine the intended base, head, title, draft state, and required
metadata from the request and repository conventions. Push the current branch
when needed, but do not rewrite published history or force-push unless separately
authorized. Use a body file rather than embedding multiline Markdown in shell
arguments.

For stacked changes, let `git-spice-stack-prs` own branch relationships,
restacking, and submission. Treat a commit-derived `--fill` body as temporary
and replace it with a deliberate description using this guidance.

After creating or updating the PR, verify its title, body, base, head, draft
state, and URL. Report the URL and any metadata, validation, or reviewer decision
that still needs attention.

Do not commit changes, post review comments, or modify unrelated GitHub metadata
unless the user requested those actions.
