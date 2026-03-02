---
title: Avoid mutable package-level state in library APIs
impact: HIGH
impactDescription: safer reuse and easier testing and concurrency control
tags: api, global-state, design
enforcement: review-only
---

## Avoid mutable package-level state in library APIs

Package-level mutable state creates hidden coupling.

**Bad:**

```go
var defaultClient = NewClient()

func SetTimeout(d time.Duration) {
	defaultClient.timeout = d
}
```

**Good:**

```go
type Client struct { timeout time.Duration }

func NewClient(timeout time.Duration) *Client { return &Client{timeout: timeout} }
```

If defaults are required, keep explicit constructors and document concurrency behavior.
