import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
} from "@earendil-works/pi-coding-agent";
import {
  buildPaneCommand,
  buildRunMarkers,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_HEARTBEAT_MS,
  exitCodeFromMatchedLine,
  extractTranscript,
  HERDR_COMMAND_PANE_ENTRY,
  HERDR_COMMAND_TOOL_NAME,
  isManagedPane,
  isWaitTimeout,
  type ManagedPane,
  normalizeLabel,
  paneRecordToManagedPane,
  parseMatchedLine,
  parsePaneIdle,
  parsePaneList,
  parsePaneRead,
  parseSplitPane,
  resolveCommandCwd,
  type RunMarkers,
} from "./herdr-command.ts";

const START_TIMEOUT_MS = 10_000;

const PARAMETERS = Type.Object({
  command: Type.String({ description: "Shell command to run in the visible Herdr command pane" }),
  cwd: Type.Optional(Type.String({ description: "Working directory; relative paths resolve from the Pi session cwd" })),
  timeoutMs: Type.Optional(Type.Integer({
    description: "Overall command timeout in milliseconds (default: 30 minutes)",
    minimum: 1_000,
    maximum: 7_200_000,
  })),
  label: Type.Optional(Type.String({ description: "Short label for the managed command pane" })),
});

type ExecResult = { code: number; stdout: string; stderr: string; killed: boolean };

interface RunDetails {
  paneId: string;
  terminalId: string;
  workspaceId: string;
  exitCode?: number;
  durationMs?: number;
  timedOut: boolean;
  busy?: boolean;
  outputTruncated?: boolean;
}

interface Dependencies {
  heartbeatMs?: number;
  now?: () => number;
  randomUUID?: () => string;
}

function execFailure(operation: string, result: ExecResult): Error {
  const detail = (result.stderr || result.stdout).trim();
  return new Error(detail ? `${operation} failed: ${detail}` : `${operation} failed with code ${result.code}`);
}

function progressText(paneId: string, output: string): string {
  const lines = output.split("\n");
  let tail = lines.slice(-20).join("\n").trimEnd();
  if (Buffer.byteLength(tail, "utf8") > 8 * 1024) tail = tail.slice(-8 * 1024);
  return tail ? `Command still running in ${paneId}. Latest output:\n${tail}` : `Command still running in ${paneId}...`;
}

function finalResult(
  pane: ManagedPane,
  output: string,
  options: { exitCode?: number; durationMs: number; timedOut: boolean },
) {
  const truncation = truncateTail(output || "(no output)", {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  const status = options.timedOut
    ? `Command timed out after ${Math.round(options.durationMs / 1000)}s`
    : options.exitCode === 0
      ? `Command completed successfully in ${(options.durationMs / 1000).toFixed(1)}s`
      : `Command failed with exit code ${options.exitCode} after ${(options.durationMs / 1000).toFixed(1)}s`;
  const truncationNotice = truncation.truncated
    ? `\n\n[Output truncated to ${truncation.outputLines} lines / ${formatSize(truncation.outputBytes)}. Full output remains visible in Herdr pane ${pane.paneId}.]`
    : "";
  return {
    content: [{ type: "text" as const, text: `${status} in Herdr pane ${pane.paneId}.\n\n${truncation.content}${truncationNotice}` }],
    details: {
      paneId: pane.paneId,
      terminalId: pane.terminalId,
      workspaceId: pane.workspaceId,
      exitCode: options.exitCode,
      durationMs: options.durationMs,
      timedOut: options.timedOut,
      outputTruncated: truncation.truncated,
    } satisfies RunDetails,
  };
}

export default function herdrCommandExtension(pi: ExtensionAPI, dependencies: Dependencies = {}) {
  if (process.env.HERDR_ENV !== "1") return;

  const heartbeatMs = dependencies.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const now = dependencies.now ?? Date.now;
  const makeRunId = dependencies.randomUUID ?? randomUUID;
  const callerPaneId = process.env.HERDR_PANE_ID;
  const callerWorkspaceId = process.env.HERDR_WORKSPACE_ID;
  let managedPane: ManagedPane | undefined;
  let queue = Promise.resolve();

  const herdr = async (
    args: string[],
    options: { signal?: AbortSignal; timeout?: number } = {},
  ): Promise<ExecResult> => pi.exec("herdr", args, {
    signal: options.signal,
    timeout: options.timeout ?? 15_000,
  });

  const listPanes = async (signal?: AbortSignal): Promise<ReturnType<typeof parsePaneList>> => {
    const result = await herdr(["pane", "list"], { signal, timeout: 10_000 });
    if (result.code !== 0) throw execFailure("herdr pane list", result);
    return parsePaneList(result.stdout);
  };

  const refreshManagedPane = async (signal?: AbortSignal): Promise<ManagedPane | undefined> => {
    if (!managedPane) return undefined;
    const panes = await listPanes(signal);
    const current = panes
      .map(paneRecordToManagedPane)
      .find((pane): pane is ManagedPane => pane?.terminalId === managedPane!.terminalId);
    if (!current) {
      managedPane = undefined;
      return undefined;
    }
    if (current.paneId !== managedPane.paneId || current.workspaceId !== managedPane.workspaceId) {
      managedPane = current;
      pi.appendEntry(HERDR_COMMAND_PANE_ENTRY, current);
    }
    return managedPane;
  };

  const createManagedPane = async (
    cwd: string,
    label: string,
    signal?: AbortSignal,
  ): Promise<ManagedPane> => {
    if (!callerPaneId || !callerWorkspaceId) {
      throw new Error("Herdr did not provide the calling pane context");
    }

    const panes = await listPanes(signal);
    if (!panes.some(pane => pane.pane_id === callerPaneId && pane.workspace_id === callerWorkspaceId)) {
      throw new Error(`The calling Herdr pane ${callerPaneId} is no longer present`);
    }

    const split = await herdr([
      "pane", "split", "--pane", callerPaneId,
      "--direction", "down",
      "--ratio", "0.9",
      "--cwd", cwd,
      "--no-focus",
    ], { signal, timeout: 10_000 });
    if (split.code !== 0) throw execFailure("herdr pane split", split);
    const pane = parseSplitPane(split.stdout);
    // Record ownership before cosmetic setup so a rename failure cannot leave
    // an untracked pane that a later call duplicates.
    managedPane = pane;
    pi.appendEntry(HERDR_COMMAND_PANE_ENTRY, pane);

    const rename = await herdr(["pane", "rename", pane.paneId, label], { signal, timeout: 10_000 });
    if (rename.code !== 0) throw execFailure("herdr pane rename", rename);
    return pane;
  };

  const ensurePane = async (
    cwd: string,
    label: string,
    signal?: AbortSignal,
  ): Promise<{ pane: ManagedPane; created: boolean }> => {
    const existing = await refreshManagedPane(signal);
    if (existing) return { pane: existing, created: false };
    return { pane: await createManagedPane(cwd, label, signal), created: true };
  };

  const readPane = async (pane: ManagedPane, signal?: AbortSignal): Promise<string> => {
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`Herdr command pane ${pane.paneId} is no longer present`);
    }
    const result = await herdr([
      "pane", "read", current.paneId,
      "--source", "recent-unwrapped",
      "--lines", "2000",
      "--format", "text",
    ], { signal, timeout: 10_000 });
    if (result.code !== 0) throw execFailure("herdr pane read", result);
    return parsePaneRead(result.stdout);
  };

  const waitForMarker = async (
    pane: ManagedPane,
    match: string,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<ExecResult> => {
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`Herdr command pane ${pane.paneId} is no longer present`);
    }
    return herdr([
      "wait", "output", current.paneId,
      "--match", match,
      "--source", "recent-unwrapped",
      "--lines", "2000",
      "--timeout", String(timeout),
      "--regex",
    ], { signal, timeout: timeout + 5_000 });
  };

  const paneIsIdle = async (pane: ManagedPane, signal?: AbortSignal): Promise<boolean> => {
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) return false;
    const result = await herdr(["pane", "process-info", "--pane", current.paneId], {
      signal,
      timeout: 10_000,
    });
    if (result.code !== 0) throw execFailure("herdr pane process-info", result);
    return parsePaneIdle(result.stdout);
  };

  const executeRun = async (
    raw: { command: string; cwd?: string; timeoutMs?: number; label?: string },
    signal: AbortSignal | undefined,
    onUpdate: ((result: { content: Array<{ type: "text"; text: string }>; details?: RunDetails }) => void) | undefined,
    ctx: ExtensionContext,
  ) => {
    const command = raw.command.trim();
    if (!command) throw new Error("command must not be empty");
    const cwd = resolveCommandCwd(ctx.cwd, raw.cwd);
    const cwdStat = await stat(cwd).catch(() => undefined);
    if (!cwdStat?.isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
    const timeoutMs = raw.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const label = normalizeLabel(raw.label);

    const { pane, created } = await ensurePane(cwd, label, signal);
    if (!created && !await paneIsIdle(pane, signal)) {
      return {
        content: [{
          type: "text" as const,
          text: `Herdr command pane ${pane.paneId} is still busy. Inspect or stop that command before starting another one.`,
        }],
        details: {
          paneId: pane.paneId,
          terminalId: pane.terminalId,
          workspaceId: pane.workspaceId,
          timedOut: false,
          busy: true,
        } satisfies RunDetails,
      };
    }

    if (!created && label !== "pi command") {
      const rename = await herdr(["pane", "rename", pane.paneId, label], { signal, timeout: 10_000 });
      if (rename.code !== 0) throw execFailure("herdr pane rename", rename);
    }

    const markers = buildRunMarkers(makeRunId());
    const paneCommand = buildPaneCommand(command, cwd, markers);
    const startedAt = now();
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`Herdr command pane ${pane.paneId} is no longer present`);
    }
    const run = await herdr(["pane", "run", current.paneId, paneCommand], { signal, timeout: 10_000 });
    if (run.code !== 0) throw execFailure("herdr pane run", run);

    const start = await waitForMarker(pane, `^${markers.start}$`, START_TIMEOUT_MS, signal);
    if (start.code !== 0) {
      const output = signal?.aborted ? "" : await readPane(pane);
      throw new Error(
        isWaitTimeout(start.stdout, start.stderr)
          ? `Herdr command did not start within 10 seconds in ${pane.paneId}${output ? `:\n${output}` : ""}`
          : execFailure("waiting for Herdr command start", start).message,
      );
    }

    const deadline = startedAt + timeoutMs;
    while (true) {
      if (signal?.aborted) throw new Error(`Command wait cancelled; the command remains visible in ${pane.paneId}`);
      const remaining = deadline - now();
      if (remaining <= 0) {
        const text = await readPane(pane);
        const transcript = extractTranscript(text, markers);
        return finalResult(pane, transcript.output, {
          exitCode: transcript.exitCode,
          durationMs: now() - startedAt,
          timedOut: !transcript.completed,
        });
      }

      const interval = Math.max(1, Math.min(heartbeatMs, remaining));
      const wait = await waitForMarker(pane, markers.endRegex, interval, signal);
      if (wait.code === 0) {
        const exitCode = exitCodeFromMatchedLine(parseMatchedLine(wait.stdout), markers);
        const text = await readPane(pane, signal);
        const transcript = extractTranscript(text, markers);
        return finalResult(pane, transcript.output, {
          exitCode,
          durationMs: now() - startedAt,
          timedOut: false,
        });
      }
      if (!isWaitTimeout(wait.stdout, wait.stderr)) throw execFailure("waiting for Herdr command", wait);

      const text = await readPane(pane, signal);
      const transcript = extractTranscript(text, markers);
      if (transcript.completed && transcript.exitCode !== undefined) {
        return finalResult(pane, transcript.output, {
          exitCode: transcript.exitCode,
          durationMs: now() - startedAt,
          timedOut: false,
        });
      }
      onUpdate?.({
        content: [{ type: "text", text: progressText(pane.paneId, transcript.output) }],
        details: {
          paneId: pane.paneId,
          terminalId: pane.terminalId,
          workspaceId: pane.workspaceId,
          durationMs: now() - startedAt,
          timedOut: false,
        },
      });

      if (await paneIsIdle(pane, signal)) {
        throw new Error(`The command process exited in ${pane.paneId} without reporting a completion marker`);
      }
    }
  };

  pi.on("session_start", (_event, ctx) => {
    managedPane = undefined;
    const entries = ctx.sessionManager.getBranch();
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index] as { type?: string; customType?: string; data?: unknown };
      if (entry.type === "custom" && entry.customType === HERDR_COMMAND_PANE_ENTRY && isManagedPane(entry.data)) {
        managedPane = entry.data;
        break;
      }
    }
  });

  pi.registerTool({
    name: HERDR_COMMAND_TOOL_NAME,
    label: "Herdr Run Command",
    description: "Run one ordinary long-running shell command in a visible, reusable Herdr pane and wait for its actual exit status. Nonzero exits return immediately. The command pane remains available for inspection. Output is truncated to 2000 lines or 50KB.",
    promptSnippet: "Run and monitor ordinary long-running commands in a visible Herdr pane",
    promptGuidelines: [
      "Use herdr_run_command instead of composing herdr pane run with herdr wait output for ordinary long-running commands; keep raw Herdr commands for agents and explicit tab, workspace, or worktree control.",
    ],
    parameters: PARAMETERS,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      let release!: () => void;
      const previous = queue;
      queue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        return await executeRun(params, signal, onUpdate, ctx);
      } finally {
        release();
      }
    },
  });
}
