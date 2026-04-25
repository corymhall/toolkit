# Toolkit

Codex plugins for AI-assisted software engineering workflows.

## Install

Add this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add corymhall/toolkit
```

Then open the Codex plugin directory and install the plugins you want from the
`toolkit` marketplace.

To update later:

```bash
codex plugin marketplace upgrade toolkit
```

Codex installs plugin contents into its local plugin cache. Updates are picked
up through the normal marketplace upgrade flow when a plugin's manifest version
changes.

## Plugins

| Plugin | What It Adds |
|--------|--------------|
| [Engineering Review](plugins/engineering-review/) | Code review, PR review, Go development, Neovim plugin development, and reviewer role prompts. |
| [Provider Issue Workbench](plugins/provider-issue-workbench/) | Pulumi provider issue triage, Pulumi and Terraform repro staging, bridge parity investigation, and workaround analysis. |
| [Pulumi Audit](plugins/pulumi-audit/) | Pulumi test rationalization audit workflow, references, and helper scripts. |
| [Codex Workflows](plugins/codex-workflows/) | General Codex planning, repo readiness audit, git-spice stack management, and multi-model evaluation. |

## Local Development

If you are working from a local clone, register the checkout itself as the
marketplace:

```bash
git clone https://github.com/corymhall/toolkit.git
cd toolkit
scripts/install-local-plugins.sh
```

The local install script registers the checkout as the `toolkit` marketplace
and refreshes local Codex reviewer role links used by the review plugin. It
does not force-install individual plugins; use the Codex plugin directory for
that.

## Acknowledgements

- [max-sixty/worktrunk](https://github.com/max-sixty/worktrunk) — worktree lifecycle and hook-based automation
- [obra/superpowers](https://github.com/obra/superpowers) — thinking and review patterns that still influence the repo
- [steveyegge/gastown](https://github.com/steveyegge/gastown) — reference material that informed earlier experiments

## License

MIT
