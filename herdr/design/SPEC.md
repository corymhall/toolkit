# Workbench design

The sidebar is a working-memory aid for explicitly tracked work, grouped by
repository. There is one unified tree, not separate Spaces and Agents panels.
The selected design is the familiar tree. The original browser gallery and
private Rex snapshot are not runtime dependencies.

## Identity and membership

- A project is a Git repository, identified by machine and Git common directory.
  A worktree belongs under its original repository, not its directory basename.
- A tracked session has a stable ID, an explicit main tab, and auxiliary tabs.
- The first discovered tab in a folder is the default main. Additional tabs
  in that folder are auxiliary. Agent-created tabs follow parent-terminal
  ancestry when available. A different worktree defaults to a new session.
- A person can graduate an auxiliary tab into a separate tracked session,
  including another session in the same folder.
- A person can change which owned tab is main. A missing main is shown
  explicitly rather than silently substituting an auxiliary tab.
- Explicit membership is preserved if a terminal changes directory.

## Activity and Full

Activity lists tracked sessions. Opening a new folder or worktree tracks it.
Opening an already-known folder through the sidebar picker reactivates its
default session. Merely selecting work in Full does not reactivate it.

Full lists all known live work and expandable auxiliary tabs. Auxiliary tabs
have Make main and Graduate actions. Neither view hides work because an
agent finished or because the person read its result.

Dismiss uses a tray/down-arrow icon. It changes Activity membership only.
It leaves every terminal running, persists until explicit reactivation, and
is disallowed if any main-tab agent reports anything except idle.

Close is a separate X. It confirms the exact affected tabs and terminal
count. It closes the main tab, owned auxiliary tabs, and unpaneled descendant
terminals. Independently graduated work and its descendants are protected.
It leaves worktree files and saved agent history on disk. Running agents cause
a warning, not a disabled Close button. Scope changes require confirmation again.

## Presentation

- Repository dropdown headings, indented work rows, no search field.
- A single eye toggle in the sidebar header switches Activity and Full. The
  highlighted eye means Activity. No duplicate tab bar above the terminal area.
- Main-tab agent state uses a distinct shape and theme color. Working uses
  a native spinner, never a fast redraw timer.
- Git dirtiness, PR lifecycle/number, review, checks, and stale-data indicators
  use compact icon badges with hover explanations.
- Auxiliary and subagent states never contribute to the work row or dismissal.
- Manual project ordering and work ordering within a project persist.
  No automatic time-based or urgency-based sorting.

## Native navigation and project browser

The Work picker searches all live tabs, including dismissed and auxiliary work,
with pane/terminal previews and main-tab-only status aggregation. Selection
preserves Activity membership. Successful picker navigation records the tab left
behind for an explicit previous-tab toggle.

The + browser discovers local repositories and scratch roots, browses their
worktrees/directories, and opens the existing default main session when possible.
Opening through this browser reactivates work. Native forms replace Television,
while Worktrunk retains lifecycle ownership. Creation uses the freshly fetched
origin default branch and the existing pre-switch/pre-start/post-start/post-switch
sequence. Setup failure preserves the checkout and diagnostic terminal.

Removal has integrated-branch, keep-branch, and explicit force modes. Each needs
a typed yes and a fresh confirmed scope. Primary/locked worktrees, the invoking
tab, and mixed-folder work are protected. Independently paneled sessions form
terminal-ancestry boundaries. Partial failure stops further effects, preserves
remaining files, and never automatically retries. This is filesystem removal,
separate from sidebar Close and Dismiss.

Finite background jobs retain logs and outcomes when the dialog closes. Opening
a picker again inspects the previous job rather than resubmitting it. Browsing,
previews, filesystem work, and jobs stay outside the sidebar render path.

## Ownership

Herdr-core owns terminals. Herdr-app owns spaces, native tabs, panes, and agent
reports. The mod owns only the session grouping and personal tracking state.
The collector owns only cached Git/GitHub facts. Tests use synthetic names and
paths rather than personal session captures.
