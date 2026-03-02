---
title: Prefer slices.Sort for ordered basic-type slices
impact: MEDIUM
impactDescription: simplifies sort code in Go 1.21+
tags: modernize, slices, sort
enforcement: automated
---

## Prefer slices.Sort for ordered basic-type slices

Replace `sort.Slice` comparators with `slices.Sort` for basic ordered types.

**Bad:**

```go
sort.Slice(nums, func(i, j int) bool { return nums[i] < nums[j] })
```

**Good:**

```go
slices.Sort(nums)
```

Use comparator-based APIs when custom ordering is required.
