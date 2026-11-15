# Cendre Medium

Cendre Medium matches the medium-depth palette from
[`Aejkatappaja/cendre`](https://github.com/Aejkatappaja/cendre), as used by the
local Ghostty and Herdr themes.

| Role | Dark | Light companion |
| --- | --- | --- |
| Background | `#1d1917` | `#e9e3e0` |
| Foreground | `#e6d5c2` | `#382b1c` |
| Accent | `#ea9875` | `#9c5130` |
| Added | `#43b16a` | `#007330` |
| Removed | `#d25780` | `#a72f5c` |
| Code font | Monaspace Argon | Monaspace Argon |
| Bundled code theme | Gruvbox Dark Medium | Gruvbox Light Medium |
| Contrast | 50 | 45 |

The dark variant uses Cendre Medium's canonical colors. Cendre is intentionally
dark-only, so the light companion is a Codex-specific adaptation rather than an
upstream Cendre palette. It preserves each source color's OKLCH hue and chroma,
then changes lightness for a light surface: 0.92 background, 0.30 foreground,
0.52 accent, 0.48 added, and 0.50 removed.

Both variants use opaque windows. Codex restricts syntax highlighting to
bundled code themes, so the paired Gruvbox family provides the closest bundled
warm syntax base across both appearances.

Use [`dark.txt`](dark.txt) and [`light.txt`](light.txt) with the matching import
controls in **Codex > Settings > Appearance**.
