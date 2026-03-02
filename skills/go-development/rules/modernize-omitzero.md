---
title: Evaluate omitempty to omitzero for struct fields
impact: HIGH
impactDescription: can improve JSON intent but may change behavior
tags: modernize, json, tags
enforcement: automated
---

## Evaluate omitempty to omitzero for struct fields

For struct-typed fields, `omitempty` may be ineffective; `omitzero` can be a better fit in newer Go.

**Bad:**

```go
type Payload struct {
	Meta Metadata `json:"meta,omitempty"`
}
```

**Good:**

```go
type Payload struct {
	Meta Metadata `json:"meta,omitzero"`
}
```

Treat this as behavior-affecting; review carefully and isolate in its own commit.
