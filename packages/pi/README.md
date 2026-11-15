# Pi extensions

This package owns the first-party Pi extensions under `extensions/`. Its manifest declares
loaded entry points and runtime dependencies. Public skills are managed separately at the
repository root.

From the repository root:

```sh
npm ci
pi install ./packages/pi
```

Workstation installation registers this package automatically while preserving unrelated Pi
packages and settings. Use `/reload` in an existing session to load source and manifest changes.

This package owns its mise tasks and npm scripts. Run `mise run //packages/pi:test`
or `mise run //packages/pi:check` from the root, or `mise run test` here.
Root `validate` aggregates all package checks and behavioral tests. Each extension
owns its README and focused tests.
