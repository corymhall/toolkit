---
title: Avoid loop-variable capture bugs in goroutines and closures
impact: HIGH
impactDescription: prevents heisenbugs and data races
tags: concurrency, loops, closures
enforcement: mixed
---

## Avoid loop-variable capture bugs in goroutines and closures

Copy per-iteration values when closures run asynchronously.
Go 1.22 fixed `range` loop variable semantics, but this bug still appears in classic index loops and older toolchains.

**Bad (captures shared index variable):**

```go
for i := 0; i < len(ids); i++ {
	go func() {
		_ = worker.Process(ids[i])
	}()
}
```

**Good (captures per-iteration value explicitly):**

```go
for i := 0; i < len(ids); i++ {
	go func(idx int) {
		_ = worker.Process(ids[idx])
	}(i)
}
```

For Go <=1.21 code that uses `for range`, keep explicit per-iteration copies before launching closures.
