---
title: Avoid mutable package-level state and function seams
impact: HIGH
impactDescription: explicit dependency ownership, safer tests, and clearer lifecycle control
tags: api, global-state, design
enforcement: review-only
---

## Avoid mutable package-level state and function seams

Package-level mutable state and swappable function vars create hidden coupling. They hide dependencies, make tests share process-wide state, and are especially awkward in `main` packages and lifecycle-heavy code.

**Bad:**

```go
var nowFn = time.Now
var readFileFn = os.ReadFile

func loadConfig(path string) (Config, error) {
	data, err := readFileFn(path)
	if err != nil {
		return Config{}, err
	}
	return Config{LoadedAt: nowFn(), Raw: data}, nil
}
```

**Good:**

```go
type Clock interface {
	Now() time.Time
}

type FileSystem interface {
	ReadFile(string) ([]byte, error)
}

type Loader struct {
	clock Clock
	fs    FileSystem
}

func NewLoader(clock Clock, fs FileSystem) Loader {
	return Loader{clock: clock, fs: fs}
}

func (l Loader) Load(path string) (Config, error) {
	data, err := l.fs.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	return Config{LoadedAt: l.clock.Now(), Raw: data}, nil
}
```

Prefer a concrete owner type with methods. If tests need substitution, inject fake deps into that type. Treat package-global function vars as a last-resort legacy seam only when constructor-based ownership is impossible, and document why the global exists plus how tests must restore it safely.
