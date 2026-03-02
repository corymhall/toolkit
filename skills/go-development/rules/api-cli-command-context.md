---
title: Keep CLI command design explicit and propagate command context
impact: MEDIUM
impactDescription: predictable cancellation behavior and cleaner command composition
tags: api, cli, context
enforcement: review-only
---

## Keep CLI command design explicit and propagate command context

Prefer subcommands for multi-action CLIs and pass command context through execution paths.

**Bad:**

```go
RunE: func(cmd *cobra.Command, args []string) error {
	return service.Run(context.Background(), args)
}
```

**Good:**

```go
RunE: func(cmd *cobra.Command, args []string) error {
	return service.Run(cmd.Context(), args)
}
```

Keep flag/config wiring in binary entrypoints, not reusable libraries.
