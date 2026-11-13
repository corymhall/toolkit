import { createHash } from "node:crypto";
import { parseTarget, type Check, type Snapshot, type Target } from "./model.ts";

export interface AutoReceipt {
  head: string;
  problems: Record<string, string>;
  completed?: string;
  error?: string;
  paused?: boolean;
}
export interface AutomaticState {
  enabled: boolean;
  receipts: { target: Target; receipt: AutoReceipt }[];
}
export const fingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const checkKey = (check: Check): string => fingerprint(check.key);
export const executionKey = (check: Check): string =>
  fingerprint([check.execution, check.state, check.startedAt, check.completedAt]);
export function observationKey(snapshot: Snapshot): string {
  return fingerprint([
    snapshot.head,
    snapshot.attempt,
    snapshot.checks
      .map((c) => [checkKey(c), executionKey(c)])
      .sort((a, b) => a[0].localeCompare(b[0])),
  ]);
}
export function unseenProblems(snapshot: Snapshot, receipt: AutoReceipt): Check[] {
  return snapshot.checks.filter(
    (check) =>
      (check.state === "failed" || check.state === "blocked") &&
      receipt.problems[checkKey(check)] !== executionKey(check),
  );
}

/** Persist receipts, not transcripts or logs. A receipt follows only the latest
 * execution of a named check, so reruns don't grow an unbounded event history. */
export function syncReceipt(snapshot: Snapshot, saved?: AutoReceipt): AutoReceipt {
  if (!saved || saved.head !== snapshot.head)
    return { head: snapshot.head, problems: {}, paused: saved?.paused };
  const keys = new Set(snapshot.checks.map(checkKey));
  for (const key of Object.keys(saved.problems)) if (!keys.has(key)) delete saved.problems[key];
  return saved;
}

/** Session-local opt-out and delivery receipts survive reload/resume. Missing or
 * legacy state starts with the new default, automatic current-PR watching on. */
export function restoreAutomatic(data: unknown): AutomaticState {
  const result: AutomaticState = { enabled: true, receipts: [] };
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    data.version !== 2 ||
    !("automatic" in data)
  )
    return result;
  const raw = data.automatic as Partial<AutomaticState> | undefined;
  if (!raw || typeof raw !== "object") return result;
  result.enabled = raw.enabled !== false;
  if (!Array.isArray(raw.receipts)) return result;
  const hash = /^[a-f0-9]{64}$/;
  for (const item of raw.receipts.slice(0, 8)) {
    try {
      const target = parseTarget(item.target.url);
      const saved = item.receipt;
      if (
        target.kind !== "pr" ||
        !/^[a-f0-9]{40}$/i.test(saved.head) ||
        !saved.problems ||
        typeof saved.problems !== "object" ||
        Array.isArray(saved.problems)
      )
        continue;
      const problems: Record<string, string> = {};
      for (const [key, value] of Object.entries(saved.problems).slice(0, 5_000))
        if (hash.test(key) && typeof value === "string" && hash.test(value)) problems[key] = value;
      result.receipts.push({
        target,
        receipt: {
          head: saved.head,
          problems,
          completed:
            typeof saved.completed === "string" && hash.test(saved.completed)
              ? saved.completed
              : undefined,
          error:
            typeof saved.error === "string" && hash.test(saved.error) ? saved.error : undefined,
          paused: saved.paused === true,
        },
      });
    } catch {
      /* Invalid historical receipts must not introduce remote targets. */
    }
  }
  return result;
}
