---
title: Choose value pointer and slice forms intentionally
impact: MEDIUM
impactDescription: clearer semantics and fewer accidental allocations or aliasing bugs
tags: language, pointers, slices
enforcement: review-only
---

## Choose value pointer and slice forms intentionally

Use pointers for mutation/shared state/large objects; otherwise prefer values.

**Bad:**

```go
func Normalize(v *string) string {
	return strings.TrimSpace(*v)
}
```

**Good:**

```go
func Normalize(v string) string {
	return strings.TrimSpace(v)
}
```

Prefer nil slices/maps as defaults unless eager allocation has semantic or performance value.
