---
title: Log errors at handling boundaries only once
impact: CRITICAL
impactDescription: avoids duplicate noisy logs and preserves signal
tags: errors, logging, observability
enforcement: review-only
---

## Log errors at handling boundaries only once

Do not log and return the same error at multiple layers.

**Bad:**

```go
if err := repo.Save(ctx, rec); err != nil {
	log.Printf("save failed: %v", err)
	return fmt.Errorf("save record: %w", err)
}
```

**Good:**

```go
if err := repo.Save(ctx, rec); err != nil {
	return fmt.Errorf("save record: %w", err)
}
```

Log where policy is decided (for example request boundary, worker boundary, or CLI entrypoint).
