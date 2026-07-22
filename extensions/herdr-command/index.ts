import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  buildPaneCommand,
  buildRunMarkers,
  exitCodeFromTranscript,
  extractTranscript,
  HERDR_COMMAND_PANE_ENTRY,
  HERDR_COMMAND_RUN_ENTRY,
  HERDR_COMMAND_STATUS_TOOL_NAME,
  HERDR_START_COMMAND_TOOL_NAME,
  isManagedPane,
  isManagedRun,
  isWaitTimeout,
  type ManagedPane,
  type ManagedRun,
  normalizeLabel,
  paneRecordToManagedPane,
  parsePaneList,
  parsePaneProcessInfo,
  parsePaneRead,
  parseSplitPane,
  resolveCommandCwd,
  type RunMarkers,
  validateCommandText,
} from "./herdr-command.ts";

const DEFAULT_STATUS_LINES = 120;
const MAX_STATUS_WAIT_MS = 30_000;
const SUBMISSION_GRACE_MS = 2_000;

const START_PARAMETERS = Type.Object({
  command: Type.String({ description: "Single-line shell command to start in the visible Herdr command pane" }),
  cwd: Type.Optional(Type.String({ description: "Working directory; relative paths resolve from the Pi session cwd" })),
  label: Type.Optional(Type.String({ description: "Short label for the managed command pane" })),
});

const STATUS_PARAMETERS = Type.Object({
  waitMs: Type.Optional(Type.Integer({
    description: "Optionally wait up to this many milliseconds for the current command to finish (default: return immediately)",
    minimum: 1_000,
    maximum: MAX_STATUS_WAIT_MS,
  })),
  lines: Type.Optional(Type.Integer({
    description: `Number of recent output lines to return (default: ${DEFAULT_STATUS_LINES}, maximum: ${DEFAULT_MAX_LINES})`,
    minimum: 1,
    maximum: DEFAULT_MAX_LINES,
  })),
});

type ExecResult = { code: number; stdout: string; stderr: string; killed: boolean };
type RunState = "submitted" | "running" | "completed" | "lost" | "busy" | "none";

interface CommandDetails {
  state: RunState;
  paneId?: string;
  terminalId?: string;
  workspaceId?: string;
  runId?: string;
  command?: string;
  cwd?: string;
  startedAt?: number;
  durationMs?: number;
  exitCode?: number;
  busy?: boolean;
  foregroundProcesses?: Array<{ pid: number; name?: string; cmdline?: string }>;
  outputTruncated?: boolean;
  outputStartUnavailable?: boolean;
}

interface Dependencies {
  now?: () => number;
  randomUUID?: () => string;
}

function execFailure(operation: string, result: ExecResult): Error {
  const detail = (result.stderr || result.stdout).trim();
  return new Error(detail ? `${operation} failed: ${detail}` : `${operation} failed with code ${result.code}`);
}

function recentOutput(text: string, markers: RunMarkers): { output: string; startUnavailable: boolean } {
  const transcript = extractTranscript(text, markers);
  if (transcript.started) return { output: transcript.output, startUnavailable: false };

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const end = lines.findLastIndex(line => {
    if (!line.startsWith(markers.endPrefix)) return false;
    return /^[0-9]+$/.test(line.slice(markers.endPrefix.length));
  });
  return {
    output: lines.slice(0, end >= 0 ? end : lines.length).join("\n").trimEnd(),
    startUnavailable: true,
  };
}

function processSummary(processes: Array<{ pid: number; name?: string; cmdline?: string }>): string {
  const visible = processes.filter(process => process.name || process.cmdline);
  if (!visible.length) return "";
  return `\nForeground: ${visible.map(process => process.name || process.cmdline).join(", ")}`;
}

export default function herdrCommandExtension(pi: ExtensionAPI, dependencies: Dependencies = {}) {
  if (process.env.HERDR_ENV !== "1") return;

  const now = dependencies.now ?? Date.now;
  const makeRunId = dependencies.randomUUID ?? randomUUID;
  const callerPaneId = process.env.HERDR_PANE_ID;
  const callerWorkspaceId = process.env.HERDR_WORKSPACE_ID;
  let managedPane: ManagedPane | undefined;
  let latestRun: ManagedRun | undefined;
  let launchQueue = Promise.resolve();

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
      "--lines", String(DEFAULT_MAX_LINES),
      "--format", "text",
    ], { signal, timeout: 10_000 });
    if (result.code !== 0) throw execFailure("herdr pane read", result);
    return parsePaneRead(result.stdout);
  };

  const paneProcessInfo = async (pane: ManagedPane, signal?: AbortSignal) => {
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`Herdr command pane ${pane.paneId} is no longer present`);
    }
    const result = await herdr(["pane", "process-info", "--pane", current.paneId], {
      signal,
      timeout: 10_000,
    });
    if (result.code !== 0) throw execFailure("herdr pane process-info", result);
    return parsePaneProcessInfo(result.stdout);
  };

  const waitForCompletion = async (
    pane: ManagedPane,
    markers: RunMarkers,
    waitMs: number,
    signal?: AbortSignal,
  ): Promise<void> => {
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`Herdr command pane ${pane.paneId} is no longer present`);
    }
    const result = await herdr([
      "pane", "wait-output", current.paneId,
      "--regex", markers.endRegex,
      "--source", "recent-unwrapped",
      "--lines", String(DEFAULT_MAX_LINES),
      "--timeout", String(waitMs),
    ], { signal, timeout: waitMs + 5_000 });
    if (result.code === 0 || isWaitTimeout(result.stdout, result.stderr)) return;
    if (signal?.aborted) throw new Error(`Status wait cancelled; the command remains visible in ${current.paneId}`);
    throw execFailure("waiting for Herdr command", result);
  };

  const startCommand = async (
    raw: { command: string; cwd?: string; label?: string },
    signal: AbortSignal | undefined,
    ctx: ExtensionContext,
  ) => {
    const command = raw.command.trim();
    validateCommandText(command);
    const cwd = resolveCommandCwd(ctx.cwd, raw.cwd);
    const cwdStat = await stat(cwd).catch(() => undefined);
    if (!cwdStat?.isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
    const label = normalizeLabel(raw.label);

    const { pane, created } = await ensurePane(cwd, label, signal);
    if (!created) {
      const info = await paneProcessInfo(pane, signal);
      let submissionPending = false;
      if (info.idle && latestRun?.terminalId === pane.terminalId) {
        const text = await readPane(pane, signal);
        const markers = buildRunMarkers(latestRun.runId);
        submissionPending = exitCodeFromTranscript(text, markers) === undefined
          && now() - latestRun.startedAt < SUBMISSION_GRACE_MS;
      }
      if (!info.idle || submissionPending) {
        return {
          content: [{
            type: "text" as const,
            text: `Herdr command pane ${pane.paneId} is already busy. Use ${HERDR_COMMAND_STATUS_TOOL_NAME} to inspect the current command before starting another.${processSummary(info.foregroundProcesses)}`,
          }],
          details: {
            state: "busy",
            paneId: pane.paneId,
            terminalId: pane.terminalId,
            workspaceId: pane.workspaceId,
            runId: latestRun?.runId,
            busy: true,
            foregroundProcesses: info.foregroundProcesses,
          } satisfies CommandDetails,
        };
      }

      if (label !== "pi command") {
        const rename = await herdr(["pane", "rename", pane.paneId, label], { signal, timeout: 10_000 });
        if (rename.code !== 0) throw execFailure("herdr pane rename", rename);
      }
    }

    const runId = makeRunId();
    const markers = buildRunMarkers(runId);
    const paneCommand = buildPaneCommand(command, cwd, markers);
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`Herdr command pane ${pane.paneId} is no longer present`);
    }

    const result = await herdr(["pane", "run", current.paneId, paneCommand], { signal, timeout: 10_000 });
    if (result.code !== 0) throw execFailure("herdr pane run", result);

    latestRun = {
      runId,
      terminalId: current.terminalId,
      command,
      cwd,
      startedAt: now(),
    };
    pi.appendEntry(HERDR_COMMAND_RUN_ENTRY, latestRun);

    return {
      content: [{
        type: "text" as const,
        text: `Started command ${runId} in Herdr pane ${current.paneId}. It is running independently; continue other work and use ${HERDR_COMMAND_STATUS_TOOL_NAME} when its result is needed.`,
      }],
      details: {
        state: "submitted",
        paneId: current.paneId,
        terminalId: current.terminalId,
        workspaceId: current.workspaceId,
        runId,
        command,
        cwd,
        startedAt: latestRun.startedAt,
      } satisfies CommandDetails,
    };
  };

  const commandStatus = async (
    raw: { waitMs?: number; lines?: number },
    signal?: AbortSignal,
  ) => {
    if (!latestRun) {
      return {
        content: [{ type: "text" as const, text: "No Herdr command is tracked for this Pi session." }],
        details: { state: "none" } satisfies CommandDetails,
      };
    }

    const pane = await refreshManagedPane(signal);
    if (!pane || pane.terminalId !== latestRun.terminalId) {
      return {
        content: [{
          type: "text" as const,
          text: `The pane for Herdr command ${latestRun.runId} is no longer present.`,
        }],
        details: {
          state: "lost",
          runId: latestRun.runId,
          terminalId: latestRun.terminalId,
          command: latestRun.command,
          cwd: latestRun.cwd,
          startedAt: latestRun.startedAt,
          durationMs: now() - latestRun.startedAt,
        } satisfies CommandDetails,
      };
    }

    const markers = buildRunMarkers(latestRun.runId);
    let text = await readPane(pane, signal);
    let exitCode = exitCodeFromTranscript(text, markers);
    let info = await paneProcessInfo(pane, signal);

    if (
      exitCode === undefined &&
      raw.waitMs &&
      (!info.idle || now() - latestRun.startedAt < SUBMISSION_GRACE_MS)
    ) {
      await waitForCompletion(pane, markers, raw.waitMs, signal);
      text = await readPane(pane, signal);
      exitCode = exitCodeFromTranscript(text, markers);
      info = await paneProcessInfo(pane, signal);
    }

    const transcript = extractTranscript(text, markers);
    const durationMs = now() - latestRun.startedAt;
    const state: RunState = exitCode !== undefined
      ? "completed"
      : !info.idle
        ? "running"
        : !transcript.started && durationMs < SUBMISSION_GRACE_MS
          ? "submitted"
          : "lost";
    const output = recentOutput(text, markers);
    const lines = raw.lines ?? DEFAULT_STATUS_LINES;
    const truncation = truncateTail(output.output || "(no output yet)", {
      maxBytes: DEFAULT_MAX_BYTES,
      maxLines: lines,
    });
    const truncationNotice = truncation.truncated
      ? `\n\n[Recent output truncated to ${truncation.outputLines} lines / ${formatSize(truncation.outputBytes)}. Full output remains visible in Herdr pane ${pane.paneId}.]`
      : "";
    const startNotice = output.startUnavailable
      ? `\n\n[The run's start marker is outside recent terminal scrollback; output may begin mid-stream.]`
      : "";
    const status = state === "completed"
      ? exitCode === 0
        ? `Command ${latestRun.runId} completed successfully in ${(durationMs / 1000).toFixed(1)}s`
        : `Command ${latestRun.runId} failed with exit code ${exitCode} after ${(durationMs / 1000).toFixed(1)}s`
      : state === "running"
        ? `Command ${latestRun.runId} is still running after ${(durationMs / 1000).toFixed(1)}s`
        : state === "submitted"
          ? `Command ${latestRun.runId} was submitted ${(durationMs / 1000).toFixed(1)}s ago and has not emitted its start marker yet`
          : `Command ${latestRun.runId} is no longer running, but no completion marker was found`;

    return {
      content: [{
        type: "text" as const,
        text: `${status} in Herdr pane ${pane.paneId}.${processSummary(info.foregroundProcesses)}\n\n${truncation.content}${truncationNotice}${startNotice}`,
      }],
      details: {
        state,
        paneId: pane.paneId,
        terminalId: pane.terminalId,
        workspaceId: pane.workspaceId,
        runId: latestRun.runId,
        command: latestRun.command,
        cwd: latestRun.cwd,
        startedAt: latestRun.startedAt,
        durationMs,
        exitCode,
        foregroundProcesses: info.foregroundProcesses,
        outputTruncated: truncation.truncated,
        outputStartUnavailable: output.startUnavailable,
      } satisfies CommandDetails,
    };
  };

  pi.on("session_start", (_event, ctx) => {
    managedPane = undefined;
    latestRun = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      const candidate = entry as { type?: string; customType?: string; data?: unknown };
      if (candidate.type !== "custom") continue;
      if (candidate.customType === HERDR_COMMAND_PANE_ENTRY && isManagedPane(candidate.data)) {
        managedPane = candidate.data;
      }
      if (candidate.customType === HERDR_COMMAND_RUN_ENTRY && isManagedRun(candidate.data)) {
        latestRun = candidate.data;
      }
    }
  });

  pi.registerTool({
    name: HERDR_START_COMMAND_TOOL_NAME,
    label: "Herdr Start Command",
    description: "Start one ordinary long-running shell command in a visible reusable Herdr pane and return immediately after submission. Use for builds, long test suites, code generation, or other work that can continue while the agent does independent tasks. Use bash instead for short commands or when the result is required before the next action. Only one command can occupy the managed pane at a time.",
    promptSnippet: "Start a long-running command in a visible Herdr pane without waiting for completion",
    promptGuidelines: [
      "Use herdr_start_command for long-running builds, test suites, generation, or similar commands that should remain visible while independent work continues; use bash for short commands or results needed immediately.",
      "After herdr_start_command returns, continue useful independent work instead of polling; call herdr_command_status only when the result is needed.",
    ],
    parameters: START_PARAMETERS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      let release!: () => void;
      const previous = launchQueue;
      launchQueue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        return await startCommand(params, signal, ctx);
      } finally {
        release();
      }
    },
  });

  pi.registerTool({
    name: HERDR_COMMAND_STATUS_TOOL_NAME,
    label: "Herdr Command Status",
    description: "Inspect the latest command started by herdr_start_command. Returns its running or completed state, exit code, foreground processes, and recent pane output. Returns immediately unless waitMs requests a bounded wait of at most 30 seconds. Check status before relying on command artifacts or reporting success.",
    promptSnippet: "Inspect or briefly wait for the latest command in the managed Herdr pane",
    promptGuidelines: [
      "Use herdr_command_status to inspect a previously started Herdr command when its result becomes relevant; omit waitMs for an immediate check or use a bounded wait instead of rapid polling.",
      "Before relying on artifacts or claiming success from herdr_start_command, confirm completion with herdr_command_status.",
    ],
    parameters: STATUS_PARAMETERS,
    async execute(_toolCallId, params, signal) {
      await launchQueue;
      return commandStatus(params, signal);
    },
  });
}
