# Codex App Themes

This directory contains reusable theme presets for the Codex desktop app.
The currently applied values live in [`../config.toml`](../config.toml) under
the `[desktop]`, `[desktop.appearanceLightChromeTheme]`, and
`[desktop.appearanceDarkChromeTheme]` tables.

Codex theme imports are snapshots rather than installed, named themes. Editing
a preset in this directory does not change the app until it is imported again.

## Apply a preset

1. Open **Codex > Settings > Appearance**.
2. Under **Dark theme**, choose **Import** and paste the complete contents of
   the preset's `dark.txt`.
3. Under **Light theme**, choose **Import** and paste the complete contents of
   the preset's `light.txt`.
4. Confirm the corresponding values changed in `../config.toml` and commit the
   config and preset files together.

Import each variant into its matching section. Codex rejects a dark share
string in the light importer and vice versa.

## Create or update a preset

1. Adjust the colors, fonts, contrast, and bundled code theme in
   **Settings > Appearance**.
2. Use **Copy theme** separately for the dark and light variants.
3. Save the complete `codex-theme-v1:` strings as `dark.txt` and `light.txt`
   inside a named directory.
4. Record upstream palettes, deliberate deviations, and bundled syntax-theme
   choices in that directory's `README.md`.
5. Test both import strings before committing them.

The Codex app currently accepts custom application colors but restricts code
syntax highlighting to its bundled themes. The terminal CLI uses a separate
`.tmTheme` mechanism under `$CODEX_HOME/themes`; those files are not app-theme
presets.
