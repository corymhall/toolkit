---
title: Remove obsolete //+build comments when //go:build exists
impact: LOW
impactDescription: reduces duplicated build-tag maintenance
tags: modernize, build-tags, hygiene
enforcement: automated
---

## Remove obsolete //+build comments when //go:build exists

Keep the canonical `//go:build` form and remove redundant legacy `//+build` lines.

**Bad:**

```go
//go:build linux && amd64
//+build linux,amd64
```

**Good:**

```go
//go:build linux && amd64
```

Confirm tags are equivalent before deletion.
