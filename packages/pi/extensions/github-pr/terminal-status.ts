import { checkSummary, clean, counts, type Tracked } from "./model.ts";
import { followsHead } from "./working-set.ts";
import { observationKey } from "./auto-watch.ts";

import { BackgroundTerminalStatus, type ProgramStatus } from "../program-status.ts";
export type { ProgramStatus, StatusTerminal } from "../program-status.ts";

/** Only enabled subscriptions and explicit waits affect terminal attention.
 * Opted-out passive observations must not turn an idle agent into a blocked one. */
export function ciProgramStatus(
  entries: Iterable<Tracked>,
  now = Date.now(),
): ProgramStatus | undefined {
  const reports: ProgramStatus[] = [];
  for (const entry of entries) {
    const watch = entry.watch;
    if (!watch || watch.status === "cancelled" || watch.status === "paused") continue;
    if (
      watch.status === "ended" &&
      (!watch.outcome || ["superseded", "closed", "merged"].includes(watch.outcome.kind))
    )
      continue;
    const snapshot = entry.snapshot;
    if (snapshot && (snapshot.head !== watch.head || snapshot.lifecycle !== "open")) continue;
    let report: ProgramStatus;
    if (entry.error) {
      report = { state: "blocked", message: `CI status unavailable. ${entry.error}` };
    } else if (watch.status === "ended" && ["timeout", "error"].includes(watch.outcome!.kind)) {
      report = { state: "blocked", message: watch.outcome!.summary };
    } else if (!snapshot) {
      report = { state: "working", message: "waiting for CI checks" };
    } else if (watch.status === "watching" && now - snapshot.observedAt > 120_000) {
      report = { state: "blocked", message: "CI status is stale" };
    } else {
      const c = counts(snapshot.checks);
      if (c.failed || c.blocked || c.cancelled)
        report = { state: "blocked", message: checkSummary(snapshot) };
      else if (
        snapshot.target.kind === "run" &&
        snapshot.runStatus === "completed" &&
        snapshot.conclusion !== "success"
      ) {
        report = {
          state: "blocked",
          message: `workflow ${snapshot.conclusion || "unknown"}`,
        };
      } else if (
        (watch.status === "watching" &&
          !(followsHead(watch) && entry.receipt?.completed === observationKey(snapshot))) ||
        c.pending
      ) {
        // The wait itself owns confirmation, including the two-observation grace
        // period and workflow completion. Visible green jobs aren't enough.
        report = { state: "working", message: checkSummary(snapshot) };
      } else if (
        (snapshot.target.kind === "run" && snapshot.conclusion === "success") ||
        (c.passed > 0 && c.passed + c.skipped === snapshot.checks.length)
      ) {
        report = { state: "done", message: "CI passed" };
      } else report = { state: "blocked", message: "checks settled without a passing result" };
    }
    reports.push(report);
  }
  // One aggregate record avoids Rex/client-specific precedence among children.
  const rank = { blocked: 0, working: 1, done: 2, idle: 3, error: 0, clear: 4 };
  reports.sort((a, b) => rank[a.state] - rank[b.state]);
  if (!reports.length) return undefined;
  const selected = reports[0];
  return {
    ...selected,
    message: clean(
      `${selected.message}${reports.length > 1 ? ` · ${reports.length - 1} other CI target(s)` : ""}`,
    )
      .replace(/\s+/g, " ")
      .slice(0, 400),
  };
}

/** CI contributes attention to the shared terminal compositor. */
export class CiTerminalStatus extends BackgroundTerminalStatus {
  update(entries: Iterable<Tracked>, now = Date.now()): void {
    this.updateStatus(ciProgramStatus(entries, now));
  }
}
