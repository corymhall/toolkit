---
title: Use t.Context in tests instead of manual cancellable background contexts
impact: MEDIUM
impactDescription: simpler test lifecycle management in Go 1.24+
tags: modernize, testing, context
enforcement: automated
---

## Use t.Context in tests instead of manual cancellable background contexts

In tests, prefer `t.Context()` when available.

**Bad:**

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()
```

**Good:**

```go
ctx := t.Context()
```

Apply only when no custom cancel lifecycle is required.
