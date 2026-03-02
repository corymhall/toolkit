---
title: Replace search loops with slices.Contains or ContainsFunc
impact: MEDIUM
impactDescription: clearer membership checks with less loop boilerplate
tags: modernize, slices, readability
enforcement: automated
---

## Replace search loops with slices.Contains or ContainsFunc

For membership checks, prefer `slices.Contains`/`slices.ContainsFunc` in Go 1.21+.

**Bad:**

```go
found := false
for _, v := range xs {
	if v == target {
		found = true
		break
	}
}
```

**Good:**

```go
found := slices.Contains(xs, target)
```

Check side effects in predicate/target expressions before replacement.
