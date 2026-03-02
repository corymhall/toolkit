---
title: Replace repeated string concatenation in loops with strings.Builder
impact: HIGH
impactDescription: reduces quadratic allocation risks
tags: modernize, performance, strings
enforcement: automated
---

## Replace repeated string concatenation in loops with strings.Builder

For loop-driven string assembly, prefer `strings.Builder`.

**Bad:**

```go
var out string
for _, x := range xs {
	out += x
}
```

**Good:**

```go
var b strings.Builder
for _, x := range xs {
	b.WriteString(x)
}
out := b.String()
```

Ensure all final reads happen after the last write phase.
