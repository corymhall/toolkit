import { checkSummary, clean, counts, type Tracked } from "./model.ts";
import { observationKey } from "./auto-watch.ts";

// Structural subset of Pi 1.4's public Terminal.setProgramStatus API. Older Pi
// versions lack it and simply keep the widget/watch features without reporting.
export interface ProgramStatus {
  state: "idle" | "working" | "blocked" | "done" | "error" | "clear";
  app?: string;
  kind?: "permission" | "question" | "auth";
  message?: string;
}
export interface StatusTerminal {
  setProgramStatus?: (status: ProgramStatus) => void;
}

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
          !(watch.automatic && entry.receipt?.completed === observationKey(snapshot))) ||
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

/** Compose through Pi's public status emitter instead of writing raw OSC bytes
 * or racing its root record with a child record. Pi still owns feature detection,
 * encoding, terminal suspend/resume, and the actual write. Restore the exact
 * setter on detach, and don't disturb another extension that replaced ours. */
export class CiTerminalStatus {
  private terminal?: StatusTerminal;
  private original?: (status: ProgramStatus) => void;
  private wrapper?: (status: ProgramStatus) => void;
  private native: ProgramStatus = { state: "idle", app: "pi" };
  private ci?: ProgramStatus;
  private active = false;
  private last?: string;

  attach(terminal: StatusTerminal, initial: ProgramStatus): boolean {
    if (this.terminal === terminal && terminal.setProgramStatus === this.wrapper) return true;
    this.detach();
    if (typeof terminal.setProgramStatus !== "function") return false;
    this.terminal = terminal;
    const original = terminal.setProgramStatus;
    this.original = original;
    this.native = { ...initial };
    const wrapper = (status: ProgramStatus): void => {
      // Another extension may keep this function in its wrapper chain after we
      // detach. Pass native reports through instead of swallowing them.
      if (
        this.terminal !== terminal ||
        this.wrapper !== wrapper ||
        terminal.setProgramStatus !== wrapper
      ) {
        original.call(terminal, status);
        return;
      }
      this.native = { ...status };
      this.publish();
    };
    this.wrapper = wrapper;
    terminal.setProgramStatus = wrapper;
    this.publish();
    return true;
  }
  update(entries: Iterable<Tracked>, now = Date.now()): void {
    this.ci = ciProgramStatus(entries, now);
    this.publish();
  }
  agentStarted(message?: string): void {
    this.active = true;
    // Native reporting and extension hooks may run in either order. Don't let
    // a cached CI/resting status mask the start while awaiting Pi's next report.
    this.native = { state: "working", app: "pi", message };
    this.publish();
  }
  agentSettled(): void {
    this.active = false;
    this.publish();
  }
  detach(): void {
    if (this.terminal && this.original && this.terminal.setProgramStatus === this.wrapper) {
      this.terminal.setProgramStatus = this.original;
      this.original.call(this.terminal, this.native);
    }
    this.terminal = undefined;
    this.original = undefined;
    this.wrapper = undefined;
    this.last = undefined;
  }
  private publish(): void {
    if (!this.terminal || !this.original || this.terminal.setProgramStatus !== this.wrapper) return;
    // A real Pi dialog/error/compaction must retain its meaning. In particular,
    // don't relabel permission/auth prompts as an ordinary CI failure.
    const nativeOwns = ["working", "blocked", "error", "clear"].includes(this.native.state);
    const status = nativeOwns
      ? this.native
      : this.active
        ? { state: "working" as const, app: "pi" }
        : this.ci
          ? { ...this.ci, app: "pi" }
          : this.native;
    const key = JSON.stringify(status);
    if (this.last === key) return;
    this.last = key;
    this.original.call(this.terminal, status);
  }
}
