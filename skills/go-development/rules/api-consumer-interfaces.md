---
title: Define interfaces at call sites, not providers
impact: CRITICAL
impactDescription: simpler APIs, easier testing, fewer accidental abstractions
tags: api, interfaces, design
enforcement: review-only
---

## Define interfaces at call sites, not providers

Per Go Code Review Comments, interfaces generally belong in the consumer package. Start with concrete types and explicit constructors, then create small interfaces only in the package that consumes behavior. Avoid exporting broad provider-defined interfaces "just in case", and do not reach for package-global function vars as a shortcut around dependency ownership.

**Bad (provider-owned interface forces broad contract):**

```go
// package store
package store

type Store interface {
	GetUser(ctx context.Context, id string) (User, error)
	PutUser(ctx context.Context, u User) error
	DeleteUser(ctx context.Context, id string) error
}
```

**Good (consumer defines only what it needs):**

```go
// package billing
package billing

type userReader interface {
	GetUser(ctx context.Context, id string) (User, error)
}

type Service struct {
	users userReader
}
```

Keep contracts narrow and local to usage. Prefer a concrete dependency field until a real consumer needs substitution.
