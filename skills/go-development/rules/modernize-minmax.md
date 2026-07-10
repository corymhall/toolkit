---
title: Replace simple min/max conditionals with builtins
impact: HIGH
impactDescription: simpler intent and less conditional boilerplate
tags: modernize, minmax, readability
enforcement: automated
---

## Replace simple min/max conditionals with builtins

In Go 1.21+, replace straightforward conditional min/max assignments with builtin `min`/`max`.

**Bad:**

```go
if a < b {
	limit = a
} else {
	limit = b
}
```

**Good:**

```go
limit = min(a, b)
```

Do not apply to float logic when NaN behavior differences are observable.
