// Synthetic public fixture, never a snapshot of a person's terminal sessions.
export function fixture() {
  return {
    spaces: [
      {
        id: "space",
        machine: null,
        folder: "/work/provider",
        tabs: [
          { id: "main", name: "Fix import", named: true },
          { id: "helper", name: "Tests", named: true },
          { id: "other", name: "Upgrade", named: true },
        ],
      },
    ],
    panes: [
      { pane: "p1", terminal: "t1", tab: "main", cwd: "/work/provider" },
      { pane: "p2", terminal: "t2", tab: "helper", cwd: "/work/provider" },
      { pane: "p3", terminal: "t3", tab: "other", cwd: "/work/provider/.worktrees/upgrade" },
    ],
    agents: [
      { address: "t1", tab: "main", pane: "p1", status: "idle" },
      { address: "t2", tab: "helper", pane: "p2", status: "working" },
      { address: "kid", tab: "main", pane: "none", status: "working" },
    ],
    terminals: [
      { address: "t1", status: "idle", state: "live" },
      { address: "t2", parent: "t1", status: "working", state: "live" },
      { address: "kid", parent: "t1", status: "working", state: "live" },
      { address: "grandchild", parent: "kid", status: "working", state: "live" },
      { address: "t3", status: "idle", state: "live" },
    ],
    machines: [{ name: null, layout: "ready" }],
  };
}
