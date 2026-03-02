---
title: Avoid package/name stutter and ambiguous names
impact: MEDIUM
impactDescription: easier API discovery and review speed
tags: naming, readability, api
enforcement: mixed
---

## Avoid package/name stutter and ambiguous names

Choose names that read naturally with package qualifiers.

**Bad (stutter + vague symbols):**

```go
package cache

type CacheClient struct{}

func (c *CacheClient) DoThing(x string) {}
```

**Good (clear and concise):**

```go
package cache

type Client struct{}

func (c *Client) Set(key string, value []byte) {}
```

Aim for names that make call sites self-explanatory.
