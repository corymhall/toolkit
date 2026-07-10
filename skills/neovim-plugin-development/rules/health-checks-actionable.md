---
title: Provide actionable checkhealth diagnostics
impact: MEDIUM
impactDescription: faster user triage and fewer support round-trips
tags: health, diagnostics, support
enforcement: review-only
---

## Provide actionable checkhealth diagnostics

Ship `lua/<plugin>/health.lua` with checks for:

- minimum Neovim version
- required plugin/tool dependencies
- setup invocation and major misconfiguration

Health output should explain what is wrong and what to do next.
