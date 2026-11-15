# Review pane

`/review` opens Neovim Diffview in a right-hand Rex split and attaches Commentry to the Pi agent running this chat. `/review origin/main` supplies a diff base. The model can call `open_review` when asked to open the review pane after finishing work.

Your request authorizes opening the pane without an additional confirmation. Commentry attachment can deliver pending comments and changes the selected agent for this project. No sessions or worktrees are created. Commands target the inherited Rex session and block, never the user's current focus.

Repeated calls for the same Pi session, directory and diff base focus the existing pane without changing its editor contents. Close that pane to recreate it. Different bases get separate panes. The new pane receives 60 percent of the split.

Requires Rex, Neovim with Diffview configured, and the Commentry CLI on PATH. Plugin readiness is not verified. If attachment succeeds but editor startup fails, Commentry remains attached. Lost split responses are recovered by the pane's deterministic label on the next call.

Local activation is separate from the package manifest. Run `pi install /absolute/path/to/toolkit/extensions/review-pane/index.ts`, then reload Pi, when you want to enable it.
