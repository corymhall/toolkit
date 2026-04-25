---
title: Use SemVer and explicit deprecation messaging
impact: MEDIUM
impactDescription: predictable upgrades and fewer breaking surprises
tags: release, semver, deprecation
enforcement: review-only
---

## Use SemVer and explicit deprecation messaging

Release policy:

- publish SemVer tags/releases
- use deprecation notices for transition windows (`vim.deprecate` when applicable)
- document migration steps for breaking changes
- keep minimum Neovim version requirements explicit
