# Haunted Violet for Codex desktop

Dark app colors follow Seasons Haunted Violet: background #100e14, ash text
#c9c2c9, amber accent #efad59, violet skills #b293d0, moss additions #a6b391,
and red removals #df858d. Preserve the dark, restrained Halloween feel.

Fonts and contrast are retained from the prior active configuration. Dark code
syntax remains the existing bundled gruvbox theme; this is not the Seasons CLI
syntax theme. Code syntax matching remains a separate review item.

`dark.txt` is the new preset. `light.txt` preserves the user's existing light
appearance and absolutely code theme; it is not a newly designed light Halloween
palette. The active light appearance was not modified.

Both files use the existing codex-theme-v1 format. Dark colors were applied to
config.toml directly, with all unrelated settings preserved. JSON and TOML were
validated. The user confirmed the dark preset imports successfully after adding an explicit
`"ui":null` in `theme.fonts`. Preserve that field in share strings even when
the TOML configuration omits it. The supplied screenshot confirms dark app
surfaces and amber links; code still uses the brighter Gruvbox palette.
The light snapshot has not been import-tested. Visual preference approval is
separate from successful import. Back up active
settings before importing either preset; imports replace appearance values.

September 8 color trial: neutral ash #bcbab7, moss #91ad68, violet #b082d8. Background and amber stay unchanged. Bundled Gruvbox syntax is unchanged.

Current September 8 hierarchy trial: main text is neutral #ccc9c4. Other app colors and bundled syntax stay unchanged.

Current September 8 reduced brightness trial: main text is #c1beb9. Other app colors and bundled syntax stay unchanged.

Current September 8 stronger brightness trial: main text is #a6a39e. User assessment on the live display takes priority over screenshot appearance. Bundled syntax stays unchanged.

Current comparison restores original amber #efad59, violet #b293d0, and moss #a6b391 with darker text #a6a39e. Bundled syntax stays unchanged.

The current comparison restores only the stronger green #91ad68. Other colors stay unchanged.
