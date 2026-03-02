---
title: Prefer reflect.TypeFor when type is known at compile time
impact: MEDIUM
impactDescription: clearer type intent and fewer runtime constructions
tags: modernize, reflect, types
enforcement: automated
---

## Prefer reflect.TypeFor when type is known at compile time

Use `reflect.TypeFor[T]()` for static-type lookups in Go 1.22+.

**Bad:**

```go
t := reflect.TypeOf((*MyType)(nil)).Elem()
```

**Good:**

```go
t := reflect.TypeFor[MyType]()
```

Do not apply when the runtime type is dynamic.
