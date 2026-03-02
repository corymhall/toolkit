---
title: Replace explicit map loops with maps helpers
impact: HIGH
impactDescription: clearer intent and less custom loop code
tags: modernize, maps, stdlib
enforcement: automated
---

## Replace explicit map loops with maps helpers

Use `maps.Copy`/`maps.Insert`/`maps.Collect` when toolchain support and behavior match.

**Bad:**

```go
for k, v := range src {
	dst[k] = v
}
```

**Good:**

```go
maps.Copy(dst, src)
```

Check nil-map and collision semantics before converting complex loops.
