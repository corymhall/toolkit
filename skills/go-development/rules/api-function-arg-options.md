---
title: Prefer option structs or option functions for complex call signatures
impact: HIGH
impactDescription: improves readability and API evolution safety
tags: api, options, readability
enforcement: review-only
---

## Prefer option structs or option functions for complex call signatures

When argument count or optionality grows, switch to options.

**Bad:**

```go
func NewClient(endpoint string, timeout time.Duration, retries int, tls bool, token string) *Client { ... }
```

**Good:**

```go
type ClientOptions struct {
	Timeout time.Duration
	Retries int
	TLS     bool
	Token   string
}

func NewClient(endpoint string, opts ClientOptions) *Client { ... }
```

Keep required parameters positional and optional behavior grouped in options.
