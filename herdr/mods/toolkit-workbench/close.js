import { closePlan, liveTabs, owner } from "./model.js";

// Keep effects outside policy so partial failure and scope changes can be
// exercised without terminating real terminals. The caller owns confirmation.
// readState/readWorld return fresh synchronous snapshots. kill/closeTab resolve
// only after acknowledgement; verify must reject if any confirmed work remains.
export async function executeClose(confirmed, io) {
  const first = closePlan(io.readState(), io.readWorld(), confirmed.session);
  if (first.signature !== confirmed.signature) return { changed: first };

  const initial = io.readWorld();
  const paneTerminals = new Set(initial.panes.map((p) => p.terminal));
  const parents = new Map(initial.terminals.map((t) => [t.address, t.parent]));
  const depth = (address) => {
    const seen = new Set();
    while (address && !seen.has(address)) {
      seen.add(address);
      address = parents.get(address);
    }
    return seen.size;
  };
  const descendants = confirmed.terminals
    .filter((id) => !paneTerminals.has(id))
    .sort((a, b) => depth(b) - depth(a));

  // Revalidate after every await. Another window may graduate a tab while an
  // earlier command is in flight. That changes ownership, not just visibility.
  const guard = () => {
    const state = io.readState(),
      world = io.readWorld();
    const session = state.sessions[confirmed.session];
    if (
      session?.machine &&
      !world.machines.some((m) => m.name === session.machine && m.layout === "ready")
    ) {
      throw new Error("Machine is unavailable");
    }
    if (
      !session ||
      session.main !== confirmed.main ||
      confirmed.tabs.some((id) => owner(state, id)?.id !== confirmed.session)
    ) {
      throw new Error("Session ownership changed while closing");
    }
    const live = liveTabs(world).filter((tab) => session.tabs.includes(tab.id));
    if (live.length) {
      const current = closePlan(state, world, confirmed.session);
      if (
        current.tabs.some((id) => !confirmed.tabs.includes(id)) ||
        current.terminals.some((id) => !confirmed.terminals.includes(id))
      ) {
        throw new Error("New tabs or terminals appeared while closing");
      }
    }
    return world;
  };

  try {
    for (const address of descendants) {
      const current = guard();
      if (current.terminals.some((t) => t.address === address && t.state === "live"))
        await io.kill(address);
    }
    // The main tab stays available until its helpers have closed successfully.
    for (const id of [...confirmed.tabs.filter((id) => id !== confirmed.main), confirmed.main]) {
      const current = guard();
      if (liveTabs(current).some((tab) => tab.id === id)) await io.closeTab(id);
    }
    guard();
    await io.verify(confirmed, descendants);
    return { closed: true };
  } catch (error) {
    throw new Error(
      `${error.message || error}. Some earlier terminals or tabs may already be closed. Inspect Full and hc ls before retrying.`,
    );
  }
}
