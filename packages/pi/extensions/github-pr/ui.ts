import { targetState, workingEntries } from "./working-set.ts";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { getCapabilities, hyperlink, truncateToWidth } from "@earendil-works/pi-tui";
import {
  checkSummary,
  clean,
  counts,
  label,
  type Check,
  type Snapshot,
  type Tracked,
} from "./model.ts";

type Colors = Pick<Theme, "fg">;
export function age(time: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - time) / 1_000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}
export function watchLabel(entry: Tracked): string {
  const watch = entry.watch;
  if (!watch) return "Agent watch off";
  if (watch.subscription)
    return watch.status === "watching"
      ? "◉ Subscribed"
      : watch.status === "paused"
        ? "Ⅱ Subscription paused · /pr subscribe URL"
        : `Subscription ${watch.status}`;
  if (watch.automatic)
    return watch.status === "cancelled"
      ? "Auto-watch off"
      : watch.status === "paused"
        ? "Ⅱ Auto-watch paused · /pr watch to resume"
        : "◉ Auto-watch on";
  if (watch.status === "watching") return `◉ Agent watching ${watch.head.slice(0, 7)}`;
  if (watch.status === "paused") return "Ⅱ Watch paused · resume explicitly";
  if (watch.status === "cancelled") return "Watch cancelled";
  return `Watch ended: ${watch.outcome?.kind || "completed"}`;
}
function ci(snapshot: Snapshot, theme: Colors): string {
  const c = counts(snapshot.checks);
  if (snapshot.lifecycle !== "open")
    return theme.fg(snapshot.lifecycle === "merged" ? "accent" : "dim", snapshot.lifecycle);
  if (snapshot.target.kind === "run" && snapshot.runStatus === "completed") {
    const conclusion = snapshot.conclusion || "unknown";
    const color =
      conclusion === "success"
        ? "success"
        : ["failure", "timed_out"].includes(conclusion)
          ? "error"
          : "warning";
    return theme.fg(color, `Workflow ${conclusion}`);
  }
  if (c.failed) return theme.fg("error", `✗ ${c.failed} failed · ${c.pending} pending`);
  if (c.blocked) return theme.fg("warning", `! ${c.blocked} need action`);
  if (snapshot.target.kind === "run")
    return theme.fg(
      "warning",
      `Workflow ${snapshot.runStatus || "pending"} · ${c.passed}/${snapshot.checks.length} passed`,
    );
  if (!snapshot.checks.length) return theme.fg("muted", "Waiting for checks");
  if (c.pending) return theme.fg("warning", `◐ ${c.passed}/${snapshot.checks.length} passed`);
  if (c.cancelled) return theme.fg("warning", `${c.cancelled} cancelled`);
  if (!c.passed) return theme.fg("muted", `${c.skipped} skipped · none passed`);
  return theme.fg("success", `✓ ${c.passed} passed${c.skipped ? ` · ${c.skipped} skipped` : ""}`);
}
function linked(text: string, url: string): string {
  return getCapabilities().hyperlinks ? hyperlink(text, url) : text;
}
function targetLabel(entry: Tracked, theme: Colors): string {
  return linked(
    theme.fg(
      "accent",
      entry.target.kind === "pr" ? `↗ #${entry.target.number}` : `Run ${entry.target.number}`,
    ),
    entry.target.url,
  );
}
function checkLine(check: Check, theme: Colors): string {
  const glyph = {
    passed: "✓",
    failed: "✗",
    pending: "◐",
    skipped: "○",
    cancelled: "■",
    blocked: "!",
  }[check.state];
  const color =
    check.state === "failed"
      ? "error"
      : check.state === "passed"
        ? "success"
        : check.state === "skipped"
          ? "dim"
          : "warning";
  const text = `${theme.fg(color, glyph)} ${clean(check.name)} · ${theme.fg(color, check.state)}`;
  return check.url ? linked(text, check.url) : text;
}

/** Inline content in Pi's above-editor widget. Never captures keyboard focus.
 * Reserve room for watch/error state before filling the available height with
 * check rows, so expansion cannot obscure the input or hide an active wait. */
export function widgetLines(
  entries: Tracked[],
  current: string | undefined,
  expanded: boolean,
  width: number,
  theme: Colors,
  now: number,
  discoveryError?: string,
  maxLines = 14,
  focused?: string,
): string[] {
  if (width < 1 || maxLines < 1) return [];
  const fit = (lines: string[]) =>
    lines.slice(0, maxLines).map((line) => truncateToWidth(line.replace(/[\r\n\t]/g, " "), width));
  const working = workingEntries(entries, current);
  if (working.length > 1) {
    const states = working.map((entry) => targetState(entry, now));
    const totals = [...new Set(states)]
      .map((state) => `${states.filter((s) => s === state).length} ${state}`)
      .join(" · ");
    const header = `CI · ${working.length} targets · ${totals}`;
    const row = (entry: Tracked) => {
      const state = targetState(entry, now);
      const glyph =
        state === "passed"
          ? "✓"
          : state === "failed"
            ? "✗"
            : ["blocked", "stale"].includes(state)
              ? "!"
              : state === "paused"
                ? "Ⅱ"
                : state === "off"
                  ? "○"
                  : "◐";
      const summary =
        entry.snapshot &&
        !["paused", "off", "stale", "closed", "merged", "superseded"].includes(state)
          ? ` · ${checkSummary(entry.snapshot)}`
          : "";
      const name = truncateToWidth(clean(entry.watch?.label || entry.snapshot?.title || ""), 28);
      const color = state === "passed" ? "success" : state === "failed" ? "error" : "warning";
      return `${theme.fg(color, glyph)} ${linked(label(entry.target), entry.target.url)} · ${theme.fg(color, state)}${entry.target.url === current ? " ← current" : ""}${entry.target.url === focused ? " ← details" : ""} · ${name}${summary}`;
    };
    const severity = (entry: Tracked) =>
      ({
        failed: 0,
        blocked: 1,
        stale: 2,
        paused: 3,
        running: 4,
        completed: 5,
        superseded: 5,
        off: 6,
        closed: 7,
        merged: 7,
        passed: 8,
      })[targetState(entry, now)];
    const attention = [...working].sort((a, b) => severity(a) - severity(b))[0];
    if (!expanded || maxLines < 5)
      return fit([header, row(attention), " /pr details · /pr focus URL"]);
    const selected =
      entries.find((entry) => entry.target.url === focused) ||
      working.find((entry) => entry.target.url === current) ||
      attention;
    // Keep ordered overview rows stable. Reserve space for selected-target details.
    const room = Math.max(0, maxLines - 4);
    const shown = working.slice(0, room);
    const overview = [header, ...shown.map(row)];
    if (shown.length < working.length)
      overview.push(
        `+${working.length - shown.length} other targets · github_ci_watch status for all`,
      );
    const detailBudget = maxLines - overview.length;
    return fit([
      ...overview,
      ...widgetLines(
        [selected],
        selected.target.url,
        true,
        width,
        theme,
        now,
        undefined,
        detailBudget,
      ),
    ]);
  }
  const primary =
    entries.find((e) => e.target.url === focused) ||
    entries.find((e) => e.target.url === current) ||
    entries.find((e) => e.watch?.status === "watching") ||
    entries.find((e) => e.watch);
  if (!primary)
    return fit(
      discoveryError
        ? [theme.fg("warning", `PR unavailable: ${clean(discoveryError)}`)]
        : expanded
          ? [theme.fg("muted", "No current branch PR or CI watches. · /pr to collapse")]
          : [],
    );
  const snapshot = primary.snapshot;
  const stale = snapshot && now - snapshot.observedAt > 120_000;
  const status =
    primary.error || stale
      ? theme.fg("warning", "! GitHub state stale")
      : targetState(primary, now) === "superseded"
        ? theme.fg("warning", "Wait superseded")
        : primary.watch?.status === "paused"
          ? theme.fg("warning", "Ⅱ Paused")
          : primary.watch &&
              targetState(primary, now) === "running" &&
              !!snapshot?.checks.length &&
              snapshot.checks.every((c) => c.state !== "pending") &&
              snapshot?.target.kind === "pr"
            ? theme.fg("warning", "Confirming observed checks")
            : snapshot
              ? ci(snapshot, theme)
              : theme.fg("muted", "Not yet observed");
  const lines = [
    `${expanded ? theme.fg("borderMuted", "── ") : ""}${targetLabel(primary, theme)}${snapshot?.draft ? theme.fg("dim", " Draft") : ""} · ${status}`,
  ];
  if (width >= 60 && maxLines >= 7)
    lines.push(
      theme.fg(
        "dim",
        `${snapshot?.head.slice(0, 7) || primary.watch?.head.slice(0, 7) || "?"}${snapshot ? ` · seen ${age(snapshot.observedAt, now)} ago` : ""} · ${snapshot?.branch ? `${clean(snapshot.branch)} · ` : ""}${primary.target.repo}`,
      ),
    );

  const footer = [
    ...(primary.error ? [theme.fg("warning", clean(primary.error))] : []),
    theme.fg(
      primary.watch?.status === "watching" ? "accent" : "muted",
      `${watchLabel(primary)} · /pr ${expanded ? "to collapse" : "details"}`,
    ),
  ];
  const others = entries.filter(
    (e) => e !== primary && e.watch && ["watching", "paused"].includes(e.watch.status),
  );
  const available = Math.max(0, maxLines - lines.length - footer.length - (expanded ? 2 : 0));
  const shownOthers = Math.min(
    2,
    others.length,
    Math.max(0, available - (others.length > 2 ? 1 : 0)),
  );
  for (const entry of others.slice(0, shownOthers))
    footer.push(
      `${theme.fg("accent", label(entry.target))} · ${entry.error ? theme.fg("warning", "unavailable") : entry.snapshot ? ci(entry.snapshot, theme) : watchLabel(entry)}`,
    );
  if (others.length > shownOthers && available > shownOthers)
    footer.push(theme.fg("dim", `+${others.length - shownOthers} other watches`));

  const details: string[] = [];
  const budget = Math.max(0, maxLines - lines.length - footer.length);
  if (expanded && snapshot) {
    if (budget >= 4) details.push(clean(snapshot.title));
    if (budget >= 5) details.push(theme.fg("muted", checkSummary(snapshot)));
    const priority = { failed: 0, blocked: 1, pending: 2, cancelled: 3, passed: 4, skipped: 5 };
    const checks = [...snapshot.checks].sort((a, b) => priority[a.state] - priority[b.state]);
    const review =
      primary.target.kind === "pr" && budget >= 7
        ? theme.fg(
            "dim",
            `Review: ${snapshot.review || "unknown"} · merge state: ${snapshot.mergeState || "unknown"}`,
          )
        : undefined;
    const room = Math.max(0, budget - details.length - (review ? 1 : 0));
    const shown = Math.min(6, checks.length, Math.max(0, room - (checks.length > room ? 1 : 0)));
    for (const check of checks.slice(0, shown)) details.push(checkLine(check, theme));
    if (checks.length > shown && room > shown)
      details.push(
        linked(
          theme.fg("dim", `+${checks.length - shown} more checks · open on GitHub`),
          primary.target.url,
        ),
      );
    if (review) details.push(review);
  }
  return fit([...lines, ...details.slice(0, budget), ...footer]);
}
