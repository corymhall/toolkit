---
title: Propagate context.Context through call chains
impact: HIGH
impactDescription: controllable cancellation, timeout, and resource cleanup
tags: concurrency, context, cancellation
enforcement: mixed
---

## Propagate context.Context through call chains

Accept `context.Context` as the first parameter for request-scoped work.

**Bad (no cancellation path):**

```go
func (s *Service) FetchUser(id string) (User, error) {
	return s.repo.GetUser(id)
}
```

**Good (context propagated):**

```go
func (s *Service) FetchUser(ctx context.Context, id string) (User, error) {
	return s.repo.GetUser(ctx, id)
}
```

Use `ctx` for deadlines/cancellation, not for optional parameters.
