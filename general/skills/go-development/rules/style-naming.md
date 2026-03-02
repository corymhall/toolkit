---
title: Use concise consistent naming and initialism casing
impact: HIGH
impactDescription: clearer APIs and faster code review
tags: style, naming, readability
enforcement: mixed
---

## Use concise consistent naming and initialism casing

Prefer contextual names with consistent casing rules.

**Bad:**

```go
type HttpUrlParser struct{}

func (receiver *HttpUrlParser) GetURLValue() string { return "" }
```

**Good:**

```go
type URLParser struct{}

func (p *URLParser) URL() string { return "" }
```

Keep receiver names short and consistent (`p`, `s`, `c`). Avoid unnecessary underscores.
