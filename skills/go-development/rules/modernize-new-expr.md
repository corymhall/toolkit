---
title: Use new(expr) wrappers when targeting Go 1.26+
impact: LOW
impactDescription: simplifies pointer helper wrappers
tags: modernize, allocation, pointers
enforcement: automated
---

## Use new(expr) wrappers when targeting Go 1.26+

When Go 1.26+ is available, simplify wrappers that only return `&x`.

**Bad:**

```go
func intPtr(x int) *int { return &x }
```

**Good:**

```go
func intPtr(x int) *int { return new(x) }
```

Adopt only in toolchains that support `new(expr)`.
