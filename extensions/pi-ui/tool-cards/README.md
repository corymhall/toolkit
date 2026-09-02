# Tool Cards

The Pi UI Tool Cards module replaces the default built-in tool display with
bordered, compact cards:

```text
┌─────────────────────────────────────────────────────────┐
│  ➔ Bash ✓ |                                             │
│  ─────────────────────────────────────────────────────  │
│  $ mise run build                                       │
│  ─────────────────────────────────────────────────────  │
│  build output                                           │
│  ... 49 more lines, press Ctrl+O to expand              │
│  ─────────────────────────────────────────────────────  │
│  ◷ 1.53s · ⏹ 1200s · ✎ ~719 words                       │
└─────────────────────────────────────────────────────────┘
```

Bash cards show the last five output lines while collapsed. Multi-line commands
without heredocs are highlighted as complete Bash scripts, so shell block
keywords and syntax keep their context across lines. Heredoc bodies use
language-aware syntax colors when the destination path, stdin consumer, or
delimiter identifies a language. For example, `script.py`, `python <<'EOF'`,
and `<<'PYTHON'` select Python. Markdown body arguments and `.md` destinations
select Markdown. Generic `EOF` bodies and Git commit messages stay plain text;
the renderer does not guess from body content. Complex shell-word delimiters
keep the previous shell-only rendering.

Collapsed `read`, `write`, `grep`, `find`, and `ls` calls use a three-line
compact card with the call detail and execution metadata on one row. `grep` is
labeled `Search`, `ls` is labeled `List`, and call details use concise `Path:`
or `Query:` fields.
Expanded calls return to the full card so Pi's native result renderer has room.
The toolkit's Web Access and Herdr command extensions reuse the same public card
component for their custom tools.

Press the configured `app.tools.expand` key, `Ctrl+O` by default, to expand or
collapse tool output.
Expansion stays inside the card and uses Pi's native result renderer, including
its normal diffs, syntax highlighting, truncation notices, and file links.
Cards use only the active Pi theme: `accent` and `toolTitle` for headings,
`bashMode` for the shell prompt, `toolOutput` for output, `muted` for the
expansion notice, and standard border and status colors. They keep the neutral
terminal surface instead of painting the complete card with a success or error
background. No Droid theme or extension-specific palette is required.

## Behavior

The module changes presentation only. It delegates execution to Pi's
built-in implementations for `bash`, `read`, `edit`, `write`, `grep`, `find`,
and `ls`. It keeps Pi's cancellation, output truncation, file mutation queues,
and session behavior.

The overrides register when Pi loads Pi UI so `/reload` rebuilds historical
calls with the card renderer. Pi uses the first extension registration for a
duplicate tool name, so an override must load before Pi UI to take precedence.
The Herdr Neovim Links module decorates compact `read`, `edit`, and `write`
cards through their shared render-time event.

Pi exposes one expansion state for the complete transcript. `Ctrl+O` therefore
expands or collapses all tool rows. Pi does not currently expose a public API to
focus, click, or expand one historical tool row independently.

Card and compact rendering apply only in interactive TUI mode. In RPC, JSON,
and print modes, the registered definitions still delegate to Pi's normal tool
implementations.
