---
name: high-signal-docs
description: Write or revise human-facing documentation for high information density, causal explanations, coherent lists, and properly scoped examples. Use explicitly when the user wants documentation without AI word vomit, vague thoroughness, arbitrary checklists, or rare cases presented as universal guidance.
disable-model-invocation: true
---

# High-Signal Docs

Optimize for decision velocity and information density per sentence. Eliminate AI word vomit, generic thoroughness, and unnecessary prose.

## 1. Top-Load the Output (3-Tier Layering)

- **Tier 1 (Top / 0–30s read):** Executive Summary, Decision Matrix/Table, or PR Reviewer Checklist.
- **Tier 2 (Middle / 2–5m read):** Actionable guidance, design pattern cards, and concrete code snippets.
- **Tier 3 (Bottom / Appendix):** Research autopsies, historical PR evidence, and background context.

## 2. Compression Test

Replace a sentence mentally with “check everything,” “be careful,” or “follow best practices.” If little meaning is lost, delete it or rewrite it with specific conditions, consequences, and actions.

## 3. The Causal Chain Formula

A rule or warning should explain the underlying mechanism:

> When **[condition]** occurs, **[consequence]** follows because **[mechanism]**. Therefore **[action]**.

## 4. Keep Lists Coherent & Capped

- Give every list a strict membership rule. Test it by mentally inserting an unrelated bullet—if it doesn't look out of place, rewrite the list.
- Keep main-path lists to a maximum of 3-5 high-signal bullets. Move rare edge cases to an Appendix section.

## 5. Deletion Pass & Anti-Slop Check

Before finishing, run an explicit deletion pass:

1. **Delete Preamble & Meta-Commentary:** Remove claims about being safe, thorough, robust, or comprehensive that add no concrete mechanism or evidence.
2. **Remove Redundant Restatements:** Delete sentences that merely restate a heading or adjacent sentence.
3. **No Unsolicited Polish:** Only recommend edits that materially fix incorrect logic, change a reader's decision, or remove friction.
4. **Separate Policy from Evidence:** Move raw data dumps or research autopsies to an appendix.
