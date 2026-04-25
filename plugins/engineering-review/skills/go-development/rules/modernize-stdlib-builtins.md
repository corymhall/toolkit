---
title: Apply supplemental stdlib and built-in cleanups beyond modernize analyzers
impact: HIGH
impactDescription: clearer intent and less custom maintenance
tags: modernize, stdlib, refactor
enforcement: mixed
---

## Apply supplemental stdlib and built-in cleanups beyond modernize analyzers

Prefer modern language/std packages over hand-rolled utilities where equivalent.
Apply this rule only when the target module/toolchain supports the replacement APIs.

- `min`, `max`, and `clear` require Go 1.21+.
- `slices` and `maps` helpers require modern toolchains; verify availability for the repo's minimum Go version.

**Bad (custom helpers for common operations):**

```go
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func reset(m map[string]int) {
	for k := range m {
		delete(m, k)
	}
}
```

**Good (built-ins and stdlib helpers):**

```go
func chooseCap(a, b int) int {
	return max(a, b)
}

func reset(m map[string]int) {
	clear(m)
}
```

Also consider `slices.Clone`, `slices.Equal`, `maps.Clone`, and `maps.Equal` when semantics match.
Use `modernize-minmax` for analyzer-aligned `min`/`max` transformations.
