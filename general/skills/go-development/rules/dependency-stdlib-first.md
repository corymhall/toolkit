---
title: Prefer the standard library before adding dependencies
impact: MEDIUM
impactDescription: lower supply-chain risk and maintenance overhead
tags: dependencies, architecture, security
enforcement: mixed
---

## Prefer the standard library before adding dependencies

Add third-party packages only when they provide substantial value unavailable in stdlib.

**Bad (extra dependency for trivial helper):**

```go
import "github.com/acme/strkit"

func NormalizeEmail(v string) string {
	return strkit.TrimLower(v)
}
```

**Good (stdlib solution):**

```go
func NormalizeEmail(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}
```

If adding dependencies, document why and constrain version churn.
