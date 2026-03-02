---
title: Keep imports explicit grouped and collision-safe
impact: HIGH
impactDescription: prevents ambiguity and improves navigation and review speed
tags: style, imports, readability
enforcement: mixed
---

## Keep imports explicit grouped and collision-safe

Group imports consistently and avoid ambiguous import forms.

**Bad:**

```go
import . "net/http"
import _ "github.com/acme/lib"
import "github.com/acme/very/long/path/foo_service_go_proto"
```

**Good:**

```go
import (
	"net/http"

	foopb "github.com/acme/very/long/path/foo_service_go_proto"
)
```

Avoid `import .`. Restrict blank imports to explicit side-effect use in binaries/tests.
