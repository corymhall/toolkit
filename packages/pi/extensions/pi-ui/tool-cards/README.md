# Tool Cards

The Pi UI Tool Cards module uses Pi 1.0.1+ renderer registration to display
built-in tools, including `codemode`, as bordered cards:

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
The toolkit's Web Access and command runner extensions reuse the same public card
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

## Codemode

Collapsed codemode cards show actions rather than JavaScript or argument JSON:

```text
┌──────────────────────────────────────────────────────────┐
│  Tool calls · 1 failed                                   │
│  ✓ Edit  README.md                                  7ms  │
│  ✗ Run  npm run test:pi-ui                          3.7s  │
│    ℹ pass 45                                             │
│    ℹ fail 1                                              │
│    Error: Theme not initialized                          │
│  Ctrl+O to show script and full output                    │
└──────────────────────────────────────────────────────────┘
```

Each row names the action and its target, with status and available duration or
model cost. Failed child calls appear in the batch heading even when the script
itself completed successfully. Running commands show recent progress; completed
commands show recognized test outcomes, and failures show bounded error context
or the output tail. Routine successful reads and edits occupy one row.

Large batches show the latest eight routine actions and up to eight failures,
with an expansion notice for omitted actions. Script failures and scripts with
no nested calls retain an output preview. Word counts and the script source are
absent from collapsed cards.

Expansion reveals highlighted JavaScript and Pi's complete native result,
including arguments, errors, model costs, and output. Execution events provide
readable targets and command previews. Bounded display summaries are saved in
codemode result details so new cards retain these across reloads; full nested
results are not copied. Older history falls back to Pi's argument previews and
stored error text. Truncated old previews can omit a target.

## Behavior

The module registers presentation through `pi.registerToolRenderer()` and
leaves tool definitions and execution with Pi. Execution events supply timing
metadata. Renderers register when Pi loads Pi UI so `/reload` rebuilds historical
calls with the card renderer. Other tool renderers compose through `next()`;
expanded file and Bash results use the downstream native renderer.
Local file links retain their normal `file://` targets.

Pi exposes one expansion state for the complete transcript. `Ctrl+O` therefore
expands or collapses all tool rows. Pi does not currently expose a public API to
focus, click, or expand one historical tool row independently.

Cards render in the interactive transcript and Pi's HTML exports. RPC, JSON,
and print execution uses Pi's tool implementations directly.
