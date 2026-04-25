---
title: Replace HasPrefix and TrimPrefix pairs with CutPrefix
impact: MEDIUM
impactDescription: reduces double-work prefix/suffix handling
tags: modernize, strings, bytes
enforcement: automated
---

## Replace HasPrefix and TrimPrefix pairs with CutPrefix

In Go 1.20+, prefer `CutPrefix`/`CutSuffix` over paired checks and trims.

**Bad:**

```go
if strings.HasPrefix(s, p) {
	after := strings.TrimPrefix(s, p)
	use(after)
}
```

**Good:**

```go
if after, ok := strings.CutPrefix(s, p); ok {
	use(after)
}
```

Use equivalent `bytes` helpers when handling byte slices.
