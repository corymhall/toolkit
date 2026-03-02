---
title: Wrap errors with boundary context
impact: CRITICAL
impactDescription: faster debugging and safer error classification
tags: errors, observability, reliability
enforcement: mixed
---

## Wrap errors with boundary context

Wrap errors when crossing package or IO boundaries.

**Bad (context lost):**

```go
func LoadConfig(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return parse(b)
}
```

**Good (context preserved with %w):**

```go
func LoadConfig(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config %q: %w", path, err)
	}
	if err := parse(b); err != nil {
		return fmt.Errorf("parse config %q: %w", path, err)
	}
	return nil
}
```

Use `errors.Is` / `errors.As` at decision points.
Use `%w` only when callers should match/unwrap the original error.
Prefer placing `%w` at the end of the message for readability.
