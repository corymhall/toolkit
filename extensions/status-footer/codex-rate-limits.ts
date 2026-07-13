import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

const DEFAULT_TIMEOUT_MS = 10_000;
const WEEK_MINUTES = 7 * 24 * 60;

type RateLimitWindow = {
  usedPercent?: unknown;
  windowDurationMins?: unknown;
};

type RateLimitSnapshot = {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
};

export type CodexRateLimitsResponse = {
  rateLimits?: RateLimitSnapshot | null;
};

type SpawnCodex = () => ChildProcessWithoutNullStreams;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Select the seven-day window from Codex's backward-compatible default bucket. */
export function getWeeklyRemaining(response: CodexRateLimitsResponse): number | undefined {
  const snapshot = response.rateLimits;
  if (!snapshot) return undefined;

  const windows = [snapshot.primary, snapshot.secondary].filter(
    (window): window is RateLimitWindow => window != null && finiteNumber(window.usedPercent) !== undefined,
  );
  if (windows.length === 0) return undefined;

  const weekly = windows.find(window => {
    const duration = finiteNumber(window.windowDurationMins);
    return duration !== undefined && duration >= WEEK_MINUTES - 60;
  });
  const selected = weekly
    ?? [...windows].sort((left, right) =>
      (finiteNumber(right.windowDurationMins) ?? -1) - (finiteNumber(left.windowDurationMins) ?? -1))[0];
  const usedPercent = finiteNumber(selected?.usedPercent);
  return usedPercent === undefined ? undefined : clampPercent(100 - usedPercent);
}

/** Read Codex rolling-window headers from Pi's actual OpenAI subscription response. */
export function getWeeklyRemainingFromHeaders(headers: Record<string, string>): number | undefined {
  const normalized = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  const window = (name: "primary" | "secondary"): RateLimitWindow | null => {
    const usedPercent = Number(normalized.get(`x-codex-${name}-used-percent`));
    if (!Number.isFinite(usedPercent)) return null;
    const duration = Number(normalized.get(`x-codex-${name}-window-minutes`));
    return {
      usedPercent,
      windowDurationMins: Number.isFinite(duration) ? duration : undefined,
    };
  };
  return getWeeklyRemaining({ rateLimits: { primary: window("primary"), secondary: window("secondary") } });
}

/** Read the current ChatGPT Codex subscription limits through the local Codex app server. */
export function fetchCodexRateLimits(options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  spawnCodex?: SpawnCodex;
} = {}): Promise<CodexRateLimitsResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnCodex = options.spawnCodex ?? (() => spawn("codex", ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
  }));

  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnCodex();
    } catch (error) {
      reject(error);
      return;
    }

    const lines = createInterface({ input: child.stdout });
    let settled = false;
    let stderr = "";

    const finish = (error?: Error, result?: CodexRateLimitsResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      lines.close();
      child.kill();
      if (error) reject(error);
      else resolve(result ?? {});
    };
    const abort = () => finish(new Error("Codex rate-limit request was cancelled"));

    const timer = setTimeout(() => {
      finish(new Error(`Codex rate-limit request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });

    child.stderr.on("data", chunk => {
      stderr = (stderr + String(chunk)).slice(-8_000);
    });
    child.stdin.on("error", error => finish(error));
    child.on("error", error => finish(error));
    child.on("exit", code => {
      if (!settled) {
        const detail = stderr.trim();
        finish(new Error(`Codex app server exited before returning rate limits (code ${code ?? "unknown"})${detail ? `: ${detail}` : ""}`));
      }
    });
    lines.on("line", line => {
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(line) as typeof message;
      } catch {
        return;
      }

      if (message.id === 0) {
        if (message.error) {
          finish(new Error(message.error.message ?? "Codex app-server initialization failed"));
          return;
        }
        child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
        child.stdin.write(`${JSON.stringify({ method: "account/rateLimits/read", id: 1 })}\n`);
        return;
      }

      if (message.id === 1) {
        if (message.error) {
          finish(new Error(message.error.message ?? "Codex rate-limit request failed"));
          return;
        }
        finish(undefined, (message.result ?? {}) as CodexRateLimitsResponse);
      }
    });

    child.stdin.write(`${JSON.stringify({
      method: "initialize",
      id: 0,
      params: {
        clientInfo: {
          name: "corymhall_pi_status_footer",
          title: "Pi status footer",
          version: "0.1.0",
        },
      },
    })}\n`);
  });
}
