---
title: Run a baseline Neovim plugin verification suite before completion
impact: MEDIUM
impactDescription: fewer regressions and clearer evidence for reviewers
tags: verification, quality, delivery
enforcement: mixed
---

## Run a baseline Neovim plugin verification suite before completion

Run a repeatable baseline and report command outcomes.

**Baseline:**

```bash
stylua --check .
selene .
nvim --headless "+checkhealth <plugin-name>" +qa
# plus project test command(s)
```

If a command is unavailable, document it and run the strongest available substitute.
