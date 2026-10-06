# Herdr Neovim Links

This Pi UI module makes local `file://` links in normal Pi chat messages and
Pi's built-in `read`, `edit`, and `write` tool titles open in Herdr Neovim. The
visible chat text stays unchanged; the display-only renderer changes each link
target to `herdr-nvim://`. On macOS, the accompanying URL handler opens the file
in the Neovim pane immediately to the right of Pi or creates that pane when no
right-hand Neovim is available.

## Requirements

- macOS 13 or newer
- Ghostty with OSC 8 hyperlink support
- Herdr and Neovim available on `PATH`
- Pi and Neovim running as panes in the same Herdr tab
- Xcode command-line tools or Xcode for `swiftc` and `codesign`

The module is inert outside Pi's interactive TUI and outside Herdr.

## Install the native and Neovim integrations

From a local toolkit checkout:

```bash
extensions/pi-ui/herdr-nvim-links/install.sh
```

The explicit installer:

1. builds and ad-hoc signs
   `~/Applications/HerdrNvimURLHandler.app`;
2. registers the app as the handler for `herdr-nvim://`;
3. unless `--native-only` is passed, links the bundled Neovim runtime package
   at `~/.local/share/nvim/site/pack/toolkit/start/herdr-nvim`.

It refuses to replace a Neovim package that is not a symlink or an app with a
different bundle identifier. It does not edit Neovim configuration files.
Restart Neovim after installation so the runtime can start and advertise its
RPC server. Reload or restart Pi after activating Pi UI.

To manage the Neovim integration through a plugin manager instead, install only
the native app:

```bash
extensions/pi-ui/herdr-nvim-links/install.sh --native-only
```

For lazy.nvim, add an eager local plugin so the RPC address is available before
a file link is clicked:

```lua
{
  name = 'herdr-nvim',
  dir = '~/personal/toolkit/extensions/pi-ui/herdr-nvim-links/nvim',
  lazy = false,
}
```

Install the toolkit package with `pi install git:github.com/corymhall/toolkit`,
or install the local checkout while developing:

```bash
pi install /absolute/path/to/toolkit
```

## Behavior

For each click, the link contains the source Herdr pane, workspace, tab, working
directory, Herdr socket, file URL, and an optional line number. The native helper
then:

1. re-lists panes and verifies the source pane still belongs to the encoded tab;
2. asks Herdr for the immediate right neighbor;
3. verifies that neighbor's foreground process is `nvim`;
4. opens the file through the RPC address advertised in the pane's
   `nvim_server` metadata token;
5. revalidates the layout and focuses the right pane.

If the right neighbor is absent or is not Neovim, the helper splits the Pi pane
to the right, labels the new pane `neovim`, and runs Neovim there with the file.
It never injects editor keystrokes. If Neovim is present but has no advertised
RPC server, the handler reports an error instead of manipulating that editor or
creating a surprising duplicate pane.

The helper accepts only an absolute local `file://` URL and validated Herdr
identifiers. URI values are passed as structured process arguments; the only
shell command constructed is the quoted `nvim` launch sent to a newly created
Herdr pane.

## Current boundary

The module uses Pi's display-only Markdown transformer for normal user,
assistant, and thinking messages. It handles explicit Markdown links, angle
bracket autolinks, reference destinations, and bare absolute local `file://`
URLs. It does not change URLs in code or raw HTML.

Pi 1.0.1+ provides `registerToolRenderer()`. The module composes with the
existing `read`, `edit`, and `write` call and result renderers, including toolkit
cards, without replacing tool definitions. Registration happens before Pi
rebuilds history during `/reload`. Links from other custom message and tool
renderers are unchanged.

## Troubleshooting

Test Launch Services registration without clicking a Pi link:

```bash
open 'herdr-nvim://open?file=file%3A%2F%2F%2Ftmp%2Fexample.txt&sourcePane=w1%3Ap1&workspace=w1&tab=w1%3At1&cwd=%2Ftmp'
```

A real test URL must use live Herdr identifiers and, for non-default Herdr
sessions, the corresponding `socket` query parameter. Handler failures appear
in a macOS alert. In Neovim, `:checkhealth` and `:messages` show startup warnings;
`:help herdr-nvim` documents the runtime integration.

To uninstall:

```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u \
  ~/Applications/HerdrNvimURLHandler.app
rm -rf ~/Applications/HerdrNvimURLHandler.app
rm ~/.local/share/nvim/site/pack/toolkit/start/herdr-nvim
```
