---
name: explain-pr
description: Generate a visual local webpage that explains a GitHub PR as a decision and behavior change, not a defect-finding review. Use when the user asks to understand a PR, asks what a PR is doing, wants a walkthrough, wants a plan-review-style assessment, or wants root problem, before/after examples, tradeoffs, compatibility risks, proof gaps, and reviewer questions.
disable-model-invocation: true
---

# Explain PR

Generate a visual local HTML webpage that explains a GitHub PR as a decision, architecture, and behavior change.

> ℹ️ **Output Rule:** Generates a self-contained local HTML page (`/tmp/explain-pr-<owner>-<repo>-<num>.html`). **Does not post GitHub comments** and is **not** a code-defect bug audit.

---

## Webpage Layout Component Matrix

Construct the self-contained HTML document using these 8 visual sections:

| Component | Content & Visual Style | Purpose |
| :--- | :--- | :--- |
| **1. Hero Header** | Title, PR #, Author, Base $\rightarrow$ Head, Size badges | Immediate context & scope |
| **2. Problem Exhibit** | Concrete BEFORE example (code snippet, API call, trace, or state shape) | Establishes root problem being solved |
| **3. Before / After** | Side-by-side split panels comparing old vs new behavior | Shows direct system behavioral change |
| **4. How It Works** | Flow diagram, timeline, or short pseudocode block | Explains underlying mechanism |
| **5. Decision Table** | Matrix: Chosen approach vs Rejected alternatives vs Tradeoffs | Explains architectural choices |
| **6. Compatibility Map** | Badges for User, Maintainer, SDK, and Lifecycle risks | Highlights breaking / migration risks |
| **7. Proof Board** | Table of tests run, CI checks, and what each proves | Establishes verification confidence |
| **8. Reviewer Questions** | Visual callouts for unresolved assumptions or questions | Directs reviewer attention |

---

## Pulumi Provider Specific Checklist

When explaining a PR in a Pulumi provider, SDK, or bridge repo, explicitly analyze:
- [ ] **Layer Touched:** Upstream patch vs Provider runtime vs Bridge mapping vs Generated SDK.
- [ ] **Schema & API Compatibility:** Token names, enum changes, requiredness, `oneOf`, default values, deleted outputs.
- [ ] **State & Lifecycle Risk:** Existing stack upgrade behavior, state migrations, import/refresh vs new-create behavior.

---

## HTML Generation & Local Server Guide

1. **File Location:** Save single self-contained HTML file to `/tmp/explain-pr-<owner>-<repo>-<number>.html`.
2. **Inline Styling:** Include CSS and SVGs inline so the file opens cleanly in any browser without external assets.
3. **Local HTTP Server Launch:**

```bash
# Launch local server via background tmux session (if port 8432 is busy, try 8433, 8434...)
tmux new-session -d -s explain-pr-server \
  'cd /tmp && python3 -m http.server 8432 --bind 127.0.0.1'
```

4. **Response Output:** Return a Markdown message containing the local URL (`http://127.0.0.1:8432/explain-pr-owner-repo-num.html`) and absolute file path.
