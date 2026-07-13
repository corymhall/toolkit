---
title: Keep all Go source gofmt-clean
impact: HIGH
impactDescription: consistent formatting removes low-signal review churn
tags: style, formatting, gofmt
enforcement: automated
---

## Keep all Go source gofmt-clean

Treat `gofmt` output as required, not optional.
If the repo uses `golangci-lint` v2 formatters, enforce formatting with `golangci-lint fmt --diff`.

**Bad:**

```go
if err!=nil{return err}
```

**Good:**

```go
if err != nil {
	return err
}
```

Use non-mutating checks in verification (`golangci-lint fmt --diff` or `gofmt -l`) and fail on any diff/output.
