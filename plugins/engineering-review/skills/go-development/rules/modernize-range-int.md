---
title: Prefer for-range over integers for simple counted loops
impact: MEDIUM
impactDescription: reduces loop boilerplate in Go 1.22+
tags: modernize, loops, readability
enforcement: automated
---

## Prefer for-range over integers for simple counted loops

Use `for i := range n` when loop bounds and body semantics are simple and stable.

**Bad:**

```go
for i := 0; i < n; i++ {
	work(i)
}
```

**Good:**

```go
for i := range n {
	work(i)
}
```

Apply only when `n` and loop variables are not mutated in ways that alter semantics.
