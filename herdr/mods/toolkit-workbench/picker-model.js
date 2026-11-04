import { liveTabs, mainAgents, owner, sessionStatus } from "./model.js";

const rank = { done: 0, error: 0, blocked: 1, working: 2, idle: 3, unknown: 4 };

// Match each word as a subsequence, preserving domain order rather than sorting
// by fuzzy score. The work picker retains its explicit status priority.
export function matches(text, query) {
  const source = text.toLowerCase();
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => {
      let at = 0;
      for (const letter of word) {
        at = source.indexOf(letter, at);
        if (at < 0) return false;
        at++;
      }
      return true;
    });
}

export function workRows(state, world, origin) {
  return liveTabs(world)
    .map((tab) => {
      const session = owner(state, tab.id);
      const main = session?.main === tab.id;
      const ownAgents = world.agents.filter(
        (a) =>
          a.tab === tab.id && world.panes.some((p) => p.tab === tab.id && p.terminal === a.address),
      );
      const status = main
        ? sessionStatus(session, world)
        : Object.keys(rank).find((s) => ownAgents.some((a) => a.status === s)) || "idle";
      const project = session?.project || tab.folder?.split("/").pop() || "Home";
      const title = main
        ? session.title
        : tab.named
          ? tab.name
          : tab.folder?.split("/").pop() || tab.name;
      return {
        id: tab.id,
        tab: tab.id,
        space: tab.space,
        machine: tab.machine,
        path: tab.folder,
        name: `${project} / ${title}`,
        kind: "work",
        status,
        detail: [
          tab.id === origin ? "current" : "",
          main ? (session.tracked ? "tracked" : "dismissed") : "auxiliary",
          tab.machine || "",
          tab.folder,
        ]
          .filter(Boolean)
          .join(" · "),
        agents: main ? mainAgents(session, world) : ownAgents,
      };
    })
    .sort((a, b) => (rank[a.status] ?? 4) - (rank[b.status] ?? 4));
}

export function openRows(rows, state, world) {
  const localTabs = new Set(
    liveTabs(world)
      .filter((tab) => !tab.machine)
      .map((tab) => tab.id),
  );
  const folders = [
    ...Object.values(state.sessions)
      .filter((s) => !s.machine && s.tabs.some((id) => localTabs.has(id)))
      .map((s) => s.folder),
    ...world.panes.filter((p) => localTabs.has(p.tab)).map((p) => p.cwd),
  ].filter(Boolean);
  const opened = new Set(
    folders.map(
      (folder) =>
        rows
          .filter((row) => folder === row.path || folder.startsWith(row.path + "/"))
          .sort((a, b) => b.path.length - a.path.length)[0]?.id,
    ),
  );
  return rows.map((row) => ({
    ...row,
    detail: `${opened.has(row.id) ? "open · " : ""}${row.detail}`,
  }));
}

export function selectedRow(rows, id) {
  return rows.find((r) => r.id === id) || rows[0] || null;
}

// Screen/command output is display-only. Strip escape sequences and controls;
// never feed previews back into a terminal or use them to infer agent state.
/* eslint-disable no-control-regex -- terminal previews intentionally strip control bytes */
export function plain(text) {
  return String(text)
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
