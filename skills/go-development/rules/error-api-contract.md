---
title: Keep error APIs stable explicit and actionable
impact: CRITICAL
impactDescription: predictable error handling and safer caller behavior
tags: errors, api, contracts
enforcement: mixed
---

## Keep error APIs stable explicit and actionable

Design error surfaces so callers can make reliable decisions.

**Bad:**

```go
func Parse(input string) (Result, *ParseError) { ... }
```

**Good:**

```go
func Parse(input string) (Result, error) { ... }
```

Keep `error` as final return value. Use lowercase error strings without terminal punctuation.
