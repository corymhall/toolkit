---
title: Keep CLI command design explicit and propagate command context
impact: MEDIUM
impactDescription: predictable cancellation behavior and cleaner command composition
tags: api, cli, context
enforcement: review-only
---

## Keep CLI command design explicit and propagate command context

Prefer subcommands for multi-action CLIs and pass command context through execution paths. In `main`, keep command wiring thin and delegate lifecycle work to a concrete `app`, `runner`, or `service` type that owns its dependencies.

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

Preferred shape for `main` packages:

```go
func run(ctx context.Context, stdout io.Writer, args []string) error {
	runner := Runner{
		clock: systemClock{},
		fs:    osFS{},
		proc:  realProc{},
		out:   stdout,
	}
	return runner.Run(ctx, args)
}
```

Keep flag/config wiring and process-exit policy in binary entrypoints, not reusable libraries. Avoid package-global callbacks like `var killFn = os.FindProcess` in CLI code; inject process, clock, filesystem, and network dependencies into the concrete runner instead.
