# Compact Tool Renderer

This Pi extension replaces the default built-in tool cards with compact,
Amp-style rows:

```text
$ mise run build ▸
✓ Explored src/index.ts · 180 lines ▸
✓ Edited src/index.ts · +12 -3 ▸
```

Press the configured `app.tools.expand` key, `Ctrl+O` by default, to expand or
collapse tool output. Rows use semantic status colors, normal theme text for the
call, and muted text for metadata. They omit the disclosure marker when no
useful output is available. Expansion uses Pi's native result renderer,
including its normal diffs, syntax highlighting, truncation notices, and file
links.

## Behavior

The extension changes presentation only. It delegates execution to Pi's
built-in implementations for `bash`, `read`, `edit`, `write`, `grep`, `find`,
and `ls`. It keeps Pi's cancellation, output truncation, file mutation queues,
and session behavior.

The overrides register when Pi loads the extension so `/reload` rebuilds
historical calls with the compact renderer. Pi resolves duplicate tool names by
extension load order; a tool override loaded after this extension takes
precedence. Toolkit's Herdr Neovim link extension decorates compact `read`,
`edit`, and `write` rows through their shared render-time event.

Pi exposes one expansion state for the complete transcript. `Ctrl+O` therefore
expands or collapses all tool rows. Pi does not currently expose a public API to
focus, click, or expand one historical tool row independently.

Compact rendering applies only in interactive TUI mode. In RPC, JSON, and print
modes, the registered definitions still delegate to Pi's normal tool
implementations.
