---
title: Export the minimum public API
impact: CRITICAL
impactDescription: smaller surface area, safer refactors
tags: api, packages, encapsulation
enforcement: review-only
---

## Export the minimum public API

Export only types/functions required by external packages.

**Bad (unnecessary exported internals):**

```go
package cache

type Entry struct { // internal detail but exported
	Key   string
	Value []byte
}

func NormalizeKey(k string) string { // internal helper but exported
	return strings.TrimSpace(strings.ToLower(k))
}
```

**Good (internals unexported):**

```go
package cache

type entry struct {
	key   string
	value []byte
}

func normalizeKey(k string) string {
	return strings.TrimSpace(strings.ToLower(k))
}

func (c *Client) Set(k string, v []byte) {
	k = normalizeKey(k)
	// ...
}
```

Export less to preserve future flexibility.
