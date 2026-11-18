import { fingerprint, observationKey } from "./auto-watch.ts";
import { counts, type Tracked, type Watch } from "./model.ts";

/** Both subscription modes follow new heads; bounded waits remain commit-pinned. */
export const followsHead = (watch: Watch): boolean => !!(watch.automatic || watch.subscription);
export type TargetState =
  | "failed"
  | "blocked"
  | "running"
  | "passed"
  | "completed"
  | "superseded"
  | "stale"
  | "paused"
  | "off"
  | "closed"
  | "merged";

/** Shared by the panel, structured status, and all-green delivery. */
export function targetState(entry: Tracked, now: number): TargetState {
  const { watch, snapshot } = entry;
  if (watch?.status === "paused") return "paused";
  if (!watch || watch.status === "cancelled") return "off";
  if (entry.error || (snapshot && now - snapshot.observedAt > 120_000)) return "stale";
  if (!snapshot) return "running";
  if (snapshot.lifecycle !== "open") return snapshot.lifecycle;
  if (watch.status === "ended" && watch.outcome?.kind === "superseded") return "superseded";
  if (snapshot.head !== watch.head) return "running";
  const c = counts(snapshot.checks);
  if (c.failed) return "failed";
  if (c.blocked) return "blocked";
  if (watch.status === "ended" && ["timeout", "error"].includes(watch.outcome?.kind || ""))
    return "blocked";
  if (snapshot.target.kind === "run") {
    if (snapshot.runStatus !== "completed") return "running";
    if (["failure", "timed_out"].includes(snapshot.conclusion || "")) return "failed";
    if (snapshot.conclusion === "success" && watch.outcome?.kind === "passed") return "passed";
    if (!c.pending && watch.status === "ended") return "completed";
  }
  if (c.pending || !snapshot.checks.length) return "running";
  const confirmed = followsHead(watch)
    ? entry.receipt?.completed === observationKey(snapshot)
    : watch.status === "ended" && watch.outcome?.kind === "passed";
  if (!confirmed) return watch.status === "ended" ? "completed" : "running";
  return c.passed > 0 &&
    c.passed + c.skipped === snapshot.checks.length &&
    (snapshot.target.kind !== "run" || snapshot.conclusion === "success")
    ? "passed"
    : "completed";
}

export function workingEntries(entries: Iterable<Tracked>, current?: string): Tracked[] {
  return [...entries]
    .filter((e) => e.target.url === current || (e.watch && e.watch.status !== "cancelled"))
    .sort((a, b) => (a.watch?.order ?? Infinity) - (b.watch?.order ?? Infinity));
}

export function structuredTarget(entry: Tracked, now: number, current?: string) {
  const snapshot = entry.snapshot;
  const priority = { failed: 0, blocked: 1, pending: 2, cancelled: 3, passed: 4, skipped: 5 };
  const checks = [...(snapshot?.checks ?? [])].sort(
    (a, b) => priority[a.state] - priority[b.state],
  );
  return {
    target: entry.target,
    current: entry.target.url === current,
    label: entry.watch?.label,
    order: entry.watch?.order,
    mode: entry.watch?.subscription
      ? "subscription"
      : entry.watch?.automatic
        ? "automatic"
        : entry.watch
          ? "wait"
          : "passive",
    status: entry.watch?.status ?? "off",
    state: targetState(entry, now),
    head: snapshot?.head ?? entry.watch?.head,
    watchedHead: entry.watch?.head,
    observedAt: snapshot?.observedAt,
    ageSeconds: snapshot ? Math.max(0, Math.floor((now - snapshot.observedAt) / 1000)) : undefined,
    deadline: entry.watch?.deadline,
    title: snapshot?.title.slice(0, 200),
    checkCounts: counts(snapshot?.checks ?? []),
    checksOmitted: Math.max(0, checks.length - 5),
    checks: checks.slice(0, 5).map((check) => ({
      key: fingerprint(check.key),
      execution: check.execution.slice(0, 100),
      name: check.name.slice(0, 160),
      state: check.state,
      url: check.url && check.url.length <= 256 ? check.url : undefined,
    })),
    outcome: entry.watch?.outcome
      ? {
          kind: entry.watch.outcome.kind,
          summary: entry.watch.outcome.summary.slice(0, 500),
        }
      : undefined,
    error: entry.error?.slice(0, 500),
  };
}
