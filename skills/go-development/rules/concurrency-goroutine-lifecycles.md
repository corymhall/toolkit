---
title: Define goroutine ownership, shutdown, and wait paths
impact: HIGH
impactDescription: prevents leaks hangs and orphaned background work
tags: concurrency, goroutines, lifecycle
enforcement: review-only
---

## Define goroutine ownership shutdown and wait paths

Before launching goroutines, define who owns cancellation and who waits for completion.

**Bad:**

```go
go worker.Run()
```

**Good:**

```go
wg.Add(1)
go func() {
	defer wg.Done()
	defer close(done)
	worker.Run(ctx)
}()
```

Document lifecycle semantics and verify goroutines stop on context cancellation.
If the repo uses Go 1.25+, `WaitGroup.Go` is a good simplification.
