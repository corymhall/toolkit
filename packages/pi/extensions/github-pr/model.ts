import type { AutoReceipt } from "./auto-watch.ts";

/** GitHub observations are evidence about one commit, never merge authorization. */
export interface Target {
  kind: "pr" | "run";
  repo: string;
  number: number;
  url: string;
}

export type CheckState = "passed" | "failed" | "pending" | "skipped" | "blocked" | "cancelled";
export interface Check {
  key: string;
  execution: string;
  name: string;
  state: CheckState;
  url?: string;
  startedAt?: string;
  completedAt?: string;
  jobId?: number;
}
export interface Snapshot {
  target: Target;
  head: string;
  title: string;
  lifecycle: "open" | "closed" | "merged";
  draft?: boolean;
  branch?: string;
  review?: string;
  mergeState?: string;
  checks: Check[];
  observedAt: number;
  attempt?: number;
  runStatus?: string;
  conclusion?: string;
}
export type OutcomeKind =
  | "failed"
  | "passed"
  | "completed"
  | "blocked"
  | "superseded"
  | "closed"
  | "merged"
  | "timeout"
  | "error";
export interface Outcome {
  kind: OutcomeKind;
  summary: string;
  diagnostics?: string;
}
export interface Watch {
  target: Target;
  head: string;
  startedAt: number;
  /** Only bounded, explicit waits have a deadline. Automatic subscriptions do not. */
  deadline?: number;
  automatic?: boolean;
  status: "watching" | "paused" | "ended" | "cancelled";
  outcome?: Outcome;
}
export interface Tracked {
  target: Target;
  snapshot?: Snapshot;
  watch?: Watch;
  receipt?: AutoReceipt;
  error?: string;
  due: number;
  failures: number;
  settled?: { signature: string; since: number };
}

export function parseTarget(value: string): Target {
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(pull|actions\/runs)\/([1-9][0-9]*)\/?$/.exec(
      value.trim(),
    );
  if (!match || match[1].split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Use a GitHub.com PR URL or Actions run URL.");
  }
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number)) throw new Error("Invalid GitHub number.");
  const kind = match[2] === "pull" ? "pr" : "run";
  return {
    kind,
    repo: match[1],
    number,
    url: `https://github.com/${match[1]}/${match[2]}/${number}`,
  };
}

/** Strip remote terminal controls before rendering or delivering diagnostics. */
export function clean(value: string): string {
  // Consume OSC and CSI sequences before dropping remaining control characters.
  return (
    value
      // eslint-disable-next-line no-control-regex -- Strip untrusted OSC sequences.
      .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
      // eslint-disable-next-line no-control-regex -- Strip untrusted CSI sequences.
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
      // eslint-disable-next-line no-control-regex -- Drop remaining terminal controls.
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
  );
}
export function label(target: Target): string {
  return `${target.repo}${target.kind === "pr" ? "#" : " run "}${target.number}`;
}
export function counts(checks: Check[]): Record<CheckState, number> {
  const result = { passed: 0, failed: 0, pending: 0, skipped: 0, blocked: 0, cancelled: 0 };
  for (const check of checks) result[check.state]++;
  return result;
}
export function checkSummary(snapshot: Snapshot): string {
  const c = counts(snapshot.checks);
  if (!snapshot.checks.length) return "Waiting for checks";
  return Object.entries(c)
    .filter(([, n]) => n)
    .map(([state, n]) => `${n} ${state}`)
    .join(" · ");
}

/** Keep the latest execution of each workflow/context, including pending reruns. */
export function latestChecks(checks: Check[]): Check[] {
  const latest = new Map<string, Check>();
  for (const check of checks) {
    const previous = latest.get(check.key);
    const time = (c: Check) => Date.parse(c.startedAt || c.completedAt || "") || 0;
    const newerId =
      previous && /^\d+$/.test(check.execution) && /^\d+$/.test(previous.execution)
        ? Number(check.execution) > Number(previous.execution)
        : undefined;
    if (!previous || newerId === true || (newerId === undefined && time(check) > time(previous)))
      latest.set(check.key, check);
  }
  return [...latest.values()];
}

export function evaluate(watch: Watch, snapshot: Snapshot, now: number): Outcome | undefined {
  if (watch.head !== snapshot.head)
    return {
      kind: "superseded",
      summary: `Head changed from ${watch.head.slice(0, 7)} to ${snapshot.head.slice(0, 7)}. Start a new watch for the new commit.`,
    };
  if (snapshot.lifecycle !== "open")
    return { kind: snapshot.lifecycle, summary: `PR ${snapshot.lifecycle}.` };
  const failed = snapshot.checks.filter((c) => c.state === "failed");
  if (failed.length)
    return {
      kind: "failed",
      summary: `Failed: ${failed
        .slice(0, 20)
        .map((c) => `${c.name}${c.url ? ` ${c.url}` : ""}`)
        .join(
          "; ",
        )}${failed.length > 20 ? `; +${failed.length - 20} more failed checks at ${snapshot.target.url}` : ""}`,
    };
  if (snapshot.checks.some((c) => c.state === "blocked"))
    return {
      kind: "blocked",
      summary: "Checks require approval or other action. See check details.",
    };
  if (snapshot.target.kind === "run" && snapshot.runStatus === "completed") {
    const conclusion = snapshot.conclusion || "unknown";
    return {
      kind:
        conclusion === "success"
          ? "passed"
          : conclusion === "failure" || conclusion === "timed_out"
            ? "failed"
            : "completed",
      summary: `Workflow attempt ${snapshot.attempt}: ${conclusion}. This is a workflow result, not the whole PR's CI.`,
    };
  }
  if (watch.deadline !== undefined && now >= watch.deadline)
    return { kind: "timeout", summary: `Monitoring deadline reached. ${checkSummary(snapshot)}.` };
  return undefined;
}

/** Restore only validated watch intent. Restoring never authorizes agent wakeups. */
export function restoreWatches(data: unknown): Watch[] {
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    (data.version !== 1 && data.version !== 2) ||
    !("watches" in data) ||
    !Array.isArray(data.watches)
  )
    return [];
  const watches: Watch[] = [];
  for (const raw of data.watches.slice(0, 8)) {
    try {
      if (!raw || typeof raw !== "object" || !raw.target || typeof raw.target.url !== "string")
        continue;
      const target = parseTarget(raw.target.url);
      if (
        !/^[a-f0-9]{40}$/i.test(raw.head) ||
        !Number.isFinite(raw.deadline) ||
        !Number.isFinite(raw.startedAt) ||
        raw.deadline <= raw.startedAt
      )
        continue;
      if (raw.automatic || (raw.status !== "watching" && raw.status !== "paused")) continue;
      watches.push({
        target,
        head: raw.head,
        startedAt: raw.startedAt,
        deadline: raw.deadline,
        status: "paused",
      });
    } catch {
      /* Invalid saved intent must not start GitHub requests. */
    }
  }
  return watches;
}
