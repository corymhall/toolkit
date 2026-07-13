---
title: Prefer standard iterators over Len/At style loops where supported
impact: MEDIUM
impactDescription: improves readability and often removes index plumbing
tags: modernize, iterators, loops
enforcement: automated
---

## Prefer standard iterators over Len/At style loops where supported

When a standard type exposes iterator helpers, prefer range-over-iterator patterns.

**Bad:**

```go
for i := 0; i < x.Len(); i++ {
	use(x.At(i))
}
```

**Good:**

```go
for elem := range x.All() {
	use(elem)
}
```

Apply only when the concrete type supports equivalent iterator APIs.
