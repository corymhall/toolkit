# Herdr workbench

This directory owns the personal Herdr-app layout, native sidebar mod, GitHub
collector, installation, and service procedures. This is Herdr-app plus hc,
not the older herdr TUI plugin API.

Read the installed `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`, and the relevant
parts of `gpui-kit.d.ts` before changing runtime integration. They are generated
by the installed app and must not be edited or vendored here.

- Preserve the agreed behavior in `design/SPEC.md`.
- `mods/toolkit-workbench/model.js` owns tracking and main/auxiliary policy.
  Session IDs are independent of the currently designated main tab.
- `mods/toolkit-workbench/close.js` owns the confirmed Close sequence and
  rechecks ownership between acknowledged effects. Its tests must never invoke
  live terminal commands.
- Herdr owns agent status and terminal lifetime. Do not infer agent status
  from Git, PRs, timers, or terminal output.
- The collector owns display-only GitHub data. Keep collection out of render.
- `scripts/picker.py` owns local discovery and Worktrunk effects; `picker.js`
  owns native dialogs. No runtime dependency on Rex, Television, or old plugins.
  Keep filesystem mutations in explicit, logged jobs. Never resubmit a job to
  recover or continue it. Worktrunk hook approvals must not be bypassed.
- Removal needs typed confirmation and fresh scope checks between effects.
  Protect primary/locked checkouts, the invoking tab, mixed-folder panes, and
  independently paneled terminal-ancestry boundaries. Use synthetic Herdr in tests.
- Never use tab.settle for dismissal. Viewing a result does not untrack work.
- Close requires a user-confirmed, explicit scope, revalidated before effects.
  Protect graduated sessions and their terminal descendants. Stop and show
  errors after partial failures; do not blindly retry destructive commands.
- Never change shipped layouts or mods. Toolkit assets have unique names.
- Never install, activate layouts, start services, create worktrees, or close
  terminals as part of validation.
- Keep credentials, session snapshots, runtime IDs, caches, and service plists
  out of Git. Test with synthetic fixtures.
- The installer refuses collisions and must not edit user settings or keys.
  Do not add Herdr behavior to the shared skill installer.

Checks:

- `mise run herdr:test`: pure policy, installer, and collector tests.
- `mise run herdr:lint`: formatting, lint, shell, and Go vet.
- `mise run herdr:check`: native sidebar, Close, and picker render checks in
  disposable app homes. Herdr's headless virtual-list bridge currently panics;
  the check adapter renders the same rows eagerly. Verify native scrolling live.
  Requires the installed Herdr-app binary.
- `mise run validate`: complete repository gate, including static Herdr checks.

Native checks validate materialization, not painted layout or interactive
behavior. Verify a live activation visually and inspect `herdr-app status`
before declaring deployment successful. Re-list live IDs before any action.
