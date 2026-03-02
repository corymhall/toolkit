---
title: Make test failures actionable and helpers explicit
impact: HIGH
impactDescription: faster debugging and less flaky review feedback
tags: testing, failures, helpers
enforcement: mixed
---

## Make test failures actionable and helpers explicit

Failure output should stand alone without reading test internals.

**Bad:**

```go
if got != want {
	t.Fatal("mismatch")
}
```

**Good:**

```go
if got != want {
	t.Errorf("Normalize(%q) got %q want %q", in, got, want)
}
```

Use `t.Helper()` in reusable helpers. Use `t.Fatal` only when continuation is meaningless.
