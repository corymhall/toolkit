# Workstation theme selection

`config.json` is the single selected palette and installation-path configuration.
It is available at `~/.config/seasons/config.json` through the normal dotfile link.
`bin/seasons` delegates to `~/plugins/seasons-theme.nvim/bin/seasons`, where palettes,
generators, and switcher behavior are maintained.

```bash
seasons list
seasons set autumn:maple-ember --dry-run
seasons set autumn:maple-ember
seasons status
```

Neovim opts into this selection from `config/nvim/init.lua`. Existing editors
follow changes on focus or resume unless a manual colorscheme has been selected.

The switcher manages Ghostty, Pi, Codex CLI, and Rex.
Rex imports the shared Ghostty output. Live reload limitations are printed by the
command. Codex desktop appearance, Kitty, and shell prompts are not managed.

Backups, locks, and staged Rex imports are local ignored files. Keep backups
private because application configs can include sensitive settings. The tool
preserves unrelated settings and does not replace full app configurations.
