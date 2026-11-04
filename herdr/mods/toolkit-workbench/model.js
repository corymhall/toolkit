// Pure workbench policy. Herdr owns live tabs, terminals and agent reports.
export const stateKey = "toolkit.workbench.v1";
export const pathKey = (machine, folder) => JSON.stringify([machine ?? null, folder]);
const base = (path) => (path || "").replace(/\/+$/, "").split("/").pop() || "Home";
export function initialState(value) {
  if (value && value.version !== 1) throw new Error("Unsupported workbench state version");
  return { version: 1, sessions: {}, projectOrder: [], workOrder: [], ...value };
}
export function ordered(values, order, key = (v) => v.id) {
  const ranks = new Map(order.map((id, i) => [id, i]));
  return values
    .map((v, i) => ({ v, rank: ranks.get(key(v)) ?? order.length + i }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.v);
}
export function liveTabs(world) {
  return world.spaces.flatMap((space) =>
    space.tabs.map((tab) => ({
      ...tab,
      space: space.id,
      machine: space.machine ?? null,
      folder: world.panes.find((p) => p.tab === tab.id && p.cwd)?.cwd || space.folder,
    })),
  );
}
export function owner(state, tab) {
  return Object.values(state.sessions).find((s) => s.tabs.includes(tab));
}
export function reconcile(previous, world, metadata = {}) {
  const state = initialState(JSON.parse(JSON.stringify(previous)));
  const tabs = liveTabs(world);
  const terminalById = new Map(world.terminals.map((t) => [t.address, t]));
  for (const tab of tabs) {
    const existing = owner(state, tab.id);
    if (existing) continue; // Explicit membership survives cwd changes and focus.
    const meta = metadata[pathKey(tab.machine, tab.folder)];
    const folder = meta?.worktree || tab.folder;
    let parent;
    for (const p of world.panes.filter((p) => p.tab === tab.id)) {
      let address = terminalById.get(p.terminal)?.parent;
      const seen = new Set();
      while (address && !seen.has(address)) {
        seen.add(address);
        const parentTab = world.panes.find((pane) => pane.terminal === address)?.tab;
        parent = parentTab && owner(state, parentTab);
        if (parent) break;
        address = terminalById.get(address)?.parent;
      }
      if (parent) break;
    }
    parent ||= Object.values(state.sessions).find(
      (s) =>
        s.machine === tab.machine && s.folder === folder && tabs.some((t) => s.tabs.includes(t.id)),
    );
    if (parent) parent.tabs.push(tab.id);
    else
      state.sessions[tab.id] = {
        id: tab.id,
        main: tab.id,
        tabs: [tab.id],
        machine: tab.machine,
        folder,
        title: tab.named ? tab.name : base(folder),
        project: meta?.repo || base(folder),
        projectId: pathKey(tab.machine, meta?.commonDir || folder),
        tracked: true,
      };
  }
  // Enrich fallback identities once the collector has resolved Git, without
  // changing an established main/auxiliary relationship.
  for (const session of Object.values(state.sessions)) {
    const main = tabs.find((t) => t.id === session.main);
    const meta = metadata[pathKey(session.machine, main?.folder || session.folder)];
    if (meta?.commonDir) {
      const oldProject = session.projectId;
      session.projectId = pathKey(session.machine, meta.commonDir);
      if (oldProject !== session.projectId) {
        state.projectOrder = [
          ...new Set(state.projectOrder.map((id) => (id === oldProject ? session.projectId : id))),
        ];
      }
      session.project = meta.repo;
      session.folder = meta.worktree || session.folder;
    }
    if (main?.named) session.title = main.name;
  }
  return state;
}
export function visibleSessions(state, world, mode = "activity") {
  const tabs = new Set(liveTabs(world).map((t) => t.id));
  return ordered(
    Object.values(state.sessions).filter(
      (s) => s.tabs.some((id) => tabs.has(id)) && (mode === "full" || s.tracked),
    ),
    state.workOrder,
  );
}
export function mainAgents(session, world) {
  const mainTerminals = new Set(
    world.panes.filter((p) => p.tab === session.main).map((p) => p.terminal),
  );
  return world.agents.filter((a) => a.tab === session.main && mainTerminals.has(a.address));
}
export function sessionStatus(session, world) {
  const agents = mainAgents(session, world);
  return (
    ["blocked", "done", "working", "idle"].find((s) => agents.some((a) => a.status === s)) ||
    (agents.length ? "unknown" : "idle")
  );
}
export function canDismiss(session, world) {
  return mainAgents(session, world).every((a) => a.status === "idle");
}
export function track(state, world, id, tracked) {
  const next = initialState(JSON.parse(JSON.stringify(state))),
    s = next.sessions[id];
  if (!s) throw new Error("Session no longer exists");
  if (!tracked && !canDismiss(s, world)) throw new Error("Main-tab agents must be idle to dismiss");
  s.tracked = tracked;
  return next;
}
export function graduate(state, tabId) {
  const next = initialState(JSON.parse(JSON.stringify(state))),
    parent = owner(next, tabId);
  if (!parent || parent.main === tabId) throw new Error("Only auxiliary tabs can graduate");
  parent.tabs = parent.tabs.filter((id) => id !== tabId);
  // The original main tab can later become auxiliary. Its tab ID may still
  // name the parent session, so graduation must not overwrite that session.
  let sessionId = tabId;
  while (next.sessions[sessionId]) sessionId = `session:${sessionId}`;
  next.sessions[sessionId] = {
    ...parent,
    id: sessionId,
    main: tabId,
    tabs: [tabId],
    tracked: true,
    title: "New session",
  };
  return next;
}
export function makeMain(state, sessionId, tabId) {
  const next = initialState(JSON.parse(JSON.stringify(state))),
    s = next.sessions[sessionId];
  if (!s?.tabs.includes(tabId)) throw new Error("Tab must belong to the session");
  s.main = tabId;
  return next;
}
export function reorder(state, type, source, target, after = false) {
  const next = initialState(JSON.parse(JSON.stringify(state)));
  const values =
    type === "project"
      ? [...new Set(Object.values(state.sessions).map((s) => s.projectId))]
      : Object.keys(state.sessions);
  if (!values.includes(source) || !values.includes(target))
    throw new Error("Unknown reorder target");
  if (type !== "project" && state.sessions[source].projectId !== state.sessions[target].projectId)
    throw new Error("Work stays in its project");
  if (source === target) return next;
  const field = type === "project" ? "projectOrder" : "workOrder";
  const ids = ordered(values, next[field], (id) => id).filter((id) => id !== source);
  ids.splice(ids.indexOf(target) + Number(after), 0, source);
  next[field] = ids;
  return next;
}
export function closePlan(state, world, id) {
  const session = state.sessions[id];
  if (!session) throw new Error("Session no longer exists");
  const tabs = liveTabs(world).filter((t) => session.tabs.includes(t.id));
  if (!tabs.length) throw new Error("Session is no longer available");
  const protectedTabs = new Set(
    Object.values(state.sessions)
      .filter((s) => s.id !== id)
      .flatMap((s) => s.tabs),
  );
  const protectedTerminals = new Set(
    world.panes
      .filter((p) => protectedTabs.has(p.tab))
      .map((p) => p.terminal)
      .filter(Boolean),
  );
  const included = new Set(
    world.panes
      .filter((p) => tabs.some((t) => t.id === p.tab))
      .map((p) => p.terminal)
      .filter(Boolean),
  );
  // Child chains cannot cross another tracked session, even after graduation.
  for (let changed = true; changed;) {
    changed = false;
    for (const t of world.terminals)
      if (
        t.parent &&
        included.has(t.parent) &&
        !included.has(t.address) &&
        !protectedTerminals.has(t.address)
      ) {
        included.add(t.address);
        changed = true;
      }
  }
  const finished = new Set(
    world.terminals.filter((t) => t.state === "finished").map((t) => t.address),
  );
  const terminals = [...included]
    .filter((id) => !finished.has(id))
    .sort((a, b) => a.localeCompare(b));
  const warnings = world.terminals
    .filter((t) => included.has(t.address) && t.status && t.status !== "idle")
    .map((t) => t.address);
  return {
    session: id,
    main: session.main,
    tabs: tabs.map((t) => t.id).sort((a, b) => a.localeCompare(b)),
    terminals,
    warnings,
    signature: JSON.stringify([
      session.main,
      tabs.map((t) => t.id).sort((a, b) => a.localeCompare(b)),
      terminals,
    ]),
  };
}
export function metadataFor(session, world, cache) {
  const main = liveTabs(world).find((t) => t.id === session.main);
  return cache?.entries?.[pathKey(session.machine, main?.folder || session.folder)] || null;
}
export function stale(metadata, now = Date.now()) {
  return (
    !metadata ||
    metadata.gitError ||
    metadata.prError ||
    now - Date.parse(metadata.checkedAt || "") > 150000 ||
    !Number.isFinite(Date.parse(metadata.checkedAt || ""))
  );
}
