---
title: Prefer unsafe.Add over uintptr pointer arithmetic
impact: HIGH
impactDescription: safer and clearer unsafe pointer math
tags: modernize, unsafe, memory
enforcement: automated
---

## Prefer unsafe.Add over uintptr pointer arithmetic

When using unsafe pointer offsets, prefer helper functions.

**Bad:**

```go
p2 := unsafe.Pointer(uintptr(p) + uintptr(n))
```

**Good:**

```go
p2 := unsafe.Add(p, n)
```

Keep unsafe usage tightly scoped and well-commented.
