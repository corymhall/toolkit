---
title: Use table-driven tests for behavior matrices
impact: HIGH
impactDescription: better coverage with less duplication
tags: testing, table-driven, maintainability
enforcement: mixed
---

## Use table-driven tests for behavior matrices

For multiple input/output scenarios, use table-driven tests.

**Bad (duplicated test logic):**

```go
func TestNormalizeA(t *testing.T) {
	if got := Normalize(" A "); got != "a" { t.Fatalf("got %q", got) }
}
func TestNormalizeB(t *testing.T) {
	if got := Normalize("B"); got != "b" { t.Fatalf("got %q", got) }
}
```

**Good (single loop, clear cases):**

```go
func TestNormalize(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "trim+lower", in: " A ", want: "a"},
		{name: "already-lower", in: "b", want: "b"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Normalize(tt.in); got != tt.want {
				t.Fatalf("Normalize(%q)=%q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
```

Add edge cases and failure paths to the table.
If subtests call `t.Parallel()` on Go <=1.21, copy per-iteration values explicitly.
Prefer failure messages that include function name, input, got, and want values.
Use `testing-failures-helpers` for helper and `t.Error` vs `t.Fatal` policy.
