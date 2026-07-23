---
name: high-signal-docs
description: Write or revise human-facing documentation for high information density, causal explanations, coherent lists, and properly scoped examples. Use explicitly when the user wants documentation without AI word vomit, vague thoroughness, arbitrary checklists, or rare cases presented as universal guidance.
disable-model-invocation: true
---

# High-Signal Docs

Optimize for information gained per sentence, not apparent thoroughness or
minimum word count.

Before drafting, identify what the reader needs to know or do and why. If the
reason for a rule or warning is unclear, ask the user instead of filling the gap
with generic caution.

## Compression Test

Replace a sentence mentally with “check everything,” “be careful,” or “follow
best practices.” If little meaning is lost, delete it or rewrite it with the
specific condition, consequence, and action.

Long inventories of lifecycle stages, concerns, or qualities are not precise
merely because they name many things.

## Explain Why

A rule or warning should explain the mechanism that makes it matter. Prefer:

> When **condition** occurs, **consequence** follows because **mechanism**.
> Therefore **action**.

Do not merely name an area to inspect or “call out.” Necessary causal explanation
is valuable even when it takes more words.

## Keep Lists Coherent

Give every list a clear membership rule. Each item should make it apparent why
it belongs and what changes because of it.

Try inserting an unrelated but plausible bullet. If it would not look out of
place, the list lacks an organizing principle and should be rewritten.

Explicit, exhaustive reference lists are fine when their domain is clear. Avoid
open-ended collections of things that might matter.

## Scope Examples Honestly

Do not promote one memorable incident into universal guidance. Keep the common
path short. Put rare but important cases in a separate section that states when
the case applies and why it differs.

Use examples to clarify a rule, not to create reassuring checkboxes for every
future task.

## Deletion Pass

Before finishing:

1. Remove throat-clearing, meta-commentary, and claims about being safe,
   thorough, robust, or comprehensive that add no mechanism or evidence.
2. Remove sentences that only restate a heading or nearby sentence.
3. Challenge every list with the membership test.
4. Move uncommon scenarios out of the main path.
5. Delete or rewrite anything that does not add a needed fact, reason, action,
   constraint, or clarifying example.
