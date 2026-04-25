---
title: Remove redundant loop-variable shadowing in range loops
impact: MEDIUM
impactDescription: reduces noise after Go 1.22 loop semantics
tags: modernize, loops, readability
enforcement: automated
---

## Remove redundant loop-variable shadowing in range loops

In Go 1.22+, `for range` variables are per-iteration, so `x := x` is usually redundant.

**Bad:**

```go
for _, item := range items {
	item := item
	use(item)
}
```

**Good:**

```go
for _, item := range items {
	use(item)
}
```

Keep explicit shadowing only for compatibility with Go <=1.21 branches.
