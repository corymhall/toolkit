---
title: Prefer SplitSeq and FieldsSeq for streaming substring iteration
impact: MEDIUM
impactDescription: avoids intermediate slice allocation in Go 1.24+
tags: modernize, strings, iterators
enforcement: automated
---

## Prefer SplitSeq and FieldsSeq for streaming substring iteration

When only iterating results, use sequence APIs instead of materializing slices.

**Bad:**

```go
for _, part := range strings.Split(s, ",") {
	use(part)
}
```

**Good:**

```go
for part := range strings.SplitSeq(s, ",") {
	use(part)
}
```

Use this when a full slice is not needed later.
