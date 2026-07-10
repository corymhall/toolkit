---
title: Prefer strings.Cut or bytes.Cut patterns over Index plus slicing
impact: MEDIUM
impactDescription: clearer split logic and fewer manual index checks
tags: modernize, strings, bytes
enforcement: automated
---

## Prefer strings.Cut or bytes.Cut patterns over Index plus slicing

For delimiter split flows, use `Cut` instead of `Index` + manual slicing.

**Bad:**

```go
i := strings.Index(s, ":")
if i >= 0 {
	left := s[:i]
	_ = left
}
```

**Good:**

```go
left, _, ok := strings.Cut(s, ":")
if ok {
	_ = left
}
```

Apply only when side effects and control flow remain equivalent.
