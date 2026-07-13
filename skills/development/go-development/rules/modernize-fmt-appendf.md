---
title: Replace []byte(fmt.Sprint*...) with fmt.Append*
impact: MEDIUM
impactDescription: avoids extra string allocation in formatting path
tags: modernize, fmt, allocation
enforcement: automated
---

## Replace []byte(fmt.Sprint*...) with fmt.Append*

In Go 1.19+, use append-based formatting helpers for byte-slice formatting paths.

**Bad:**

```go
b := []byte(fmt.Sprintf("user=%s", name))
b2 := []byte(fmt.Sprintln("user", name))
```

**Good:**

```go
b := fmt.Appendf(nil, "user=%s", name)
b2 := fmt.Appendln(nil, "user", name)
```

Apply this only where resulting byte-slice behavior is unchanged.
