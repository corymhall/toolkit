---
title: Replace interface{} with any where it improves readability
impact: MEDIUM
impactDescription: clearer generic intent with no behavior change
tags: modernize, types, readability
enforcement: automated
---

## Replace interface{} with any where it improves readability

Use `any` instead of `interface{}` when targeting Go 1.18+.

**Bad:**

```go
func Decode(v interface{}) error { return nil }
```

**Good:**

```go
func Decode(v any) error { return nil }
```

This is stylistic; batch separately from semantic refactors.
