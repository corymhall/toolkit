---
title: Return errors instead of panicking in libraries
impact: CRITICAL
impactDescription: caller-controlled failure policy and safer reuse
tags: errors, api, reliability
enforcement: review-only
---

## Return errors instead of panicking in libraries

Library code should report recoverable failures via `error`.

**Bad (library panic):**

```go
func ParsePort(v string) int {
	p, err := strconv.Atoi(v)
	if err != nil {
		panic(err)
	}
	return p
}
```

**Good (library returns error):**

```go
func ParsePort(v string) (int, error) {
	p, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("parse port %q: %w", v, err)
	}
	return p, nil
}
```

Reserve `panic` for programmer bugs or unrecoverable process-internal invariants.
Use `error-init-panic-boundaries` to keep process-exit policy in binary entrypoints.
