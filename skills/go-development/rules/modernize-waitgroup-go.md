---
title: Prefer WaitGroup.Go over Add plus goroutine plus Done patterns
impact: MEDIUM
impactDescription: less boilerplate and fewer WaitGroup misuse risks
tags: modernize, sync, concurrency
enforcement: automated
---

## Prefer WaitGroup.Go over Add plus goroutine plus Done patterns

In Go 1.25+, use `wg.Go` for simple worker launches.

**Bad:**

```go
wg.Add(1)
go func() {
	defer wg.Done()
	work()
}()
```

**Good:**

```go
wg.Go(func() {
	work()
})
```

Keep explicit patterns where custom panic/error handling wrappers are required.
