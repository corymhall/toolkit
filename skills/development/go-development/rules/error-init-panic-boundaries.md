---
title: Keep init panic and process exit policy at explicit boundaries
impact: CRITICAL
impactDescription: prevents hidden crashes and preserves library composability
tags: errors, panic, init
enforcement: review-only
---

## Keep init panic and process exit policy at explicit boundaries

Libraries should return errors. Binaries decide exit behavior.

**Bad:**

```go
func InitConfig(path string) {
	if err := load(path); err != nil {
		log.Fatal(err)
	}
}
```

**Good:**

```go
func InitConfig(path string) error {
	if err := load(path); err != nil {
		return fmt.Errorf("load config %q: %w", path, err)
	}
	return nil
}
```

Reserve `panic` for impossible invariants or unrecoverable corruption paths.
