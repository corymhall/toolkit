---
title: Write comments and docs that explain behavior and contracts
impact: HIGH
impactDescription: reduces misuse and speeds onboarding and review
tags: style, docs, comments
enforcement: mixed
---

## Write comments and docs that explain behavior and contracts

Document exported APIs and non-obvious behavior with concrete semantics.

**Bad:**

```go
// Process does processing.
func Process(ctx context.Context, req Request) error { ... }
```

**Good:**

```go
// Process validates req, performs remote writes, and returns an error when
// writes fail or ctx is canceled.
func Process(ctx context.Context, req Request) error { ... }
```

Document context, concurrency, cleanup, and error behavior when relevant.
