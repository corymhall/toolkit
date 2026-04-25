# Agent Instructions

## Plugin Management

This repo is organized around Codex plugins under `plugins/<plugin-name>/`.
Each plugin owns its `.codex-plugin/plugin.json`, skills, references, scripts,
assets, and any plugin-specific support files.

When changing plugin contents:

- Keep edits inside the owning plugin whenever possible.
- Do not add new top-level skill directories such as `general/skills`.
- Do not recreate the old `~/.agents/skills` symlink workflow.
- Do not manage installed plugin cache entries by hand; Codex owns
  `~/.codex/plugins/cache`.
- Use native marketplace registration and upgrade behavior.

The marketplace file lives at `.agents/plugins/marketplace.json`. Keep plugin
entries in a stable, intentional order. Local installs should use:

```bash
scripts/install-local-plugins.sh
```

That script registers this checkout as the local `toolkit` marketplace and
maintains Codex reviewer agent-role symlinks in `~/.codex/agents`. It must not
force-enable plugins or symlink plugin cache directories.

## Version Bumps

Plugin version changes are the update signal for native Codex installs. Before
finishing a change that touches files under `plugins/<plugin-name>/`, bump that
plugin's patch version:

```bash
scripts/bump-plugin-versions.py
```

The helper detects changed plugin directories and updates each changed
plugin's `.codex-plugin/plugin.json` version. For review or CI-style checks,
use:

```bash
scripts/bump-plugin-versions.py --check
```

Bump only the plugin bundles whose contents changed. Do not bump every plugin
for unrelated edits.

After editing skills, validate them:

```bash
for skill in plugins/*/skills/*; do
  python3 /Users/chall/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$skill"
done
```

Also validate plugin and marketplace JSON:

```bash
jq empty .agents/plugins/marketplace.json plugins/*/.codex-plugin/plugin.json
```

## Evaluation Lens

When adapting skills, formulas, or workflows from other agent systems, first
read:

- `docs/codex-evaluation-lens.md`

Do not assume a successful external workflow should be copied directly.
Evaluate it through that Codex-oriented lens before proposing or implementing
changes.

Prefer:

- worktrunk for worktree lifecycle
- tmux for session management
- one main Codex session owning implementation, with sidecar delegation only
  when it materially helps
