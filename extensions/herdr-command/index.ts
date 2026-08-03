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
  HERDR_COMMAND_METADATA_SOURCE,
  HERDR_COMMAND_OWNER_TOKEN,
  HERDR_COMMAND_PANE_ENTRY,
  HERDR_COMMAND_RUN_TOKEN,
  HERDR_COMMAND_STARTED_AT_TOKEN,
  HERDR_COMMAND_RUN_ENTRY,
  HERDR_COMMAND_STATUS_TOOL_NAME,
  HERDR_START_COMMAND_TOOL_NAME,
  isManagedPane,
  isManagedRun,
  isWaitTimeout,
  type ManagedPane,
  type ManagedRun,
  normalizeLabel,
  paneRecordOwnerTerminalId,
  paneRecordToManagedPane,
  paneRecordToManagedRun,
  parsePaneList,
  parsePaneProcessInfo,
  parsePaneRead,
  parseSplitPane,
  resolveCommandCwd,
  type RunMarkers,
  validateCommandText,
} from "./herdr-command.ts";

const DEFAULT_STATUS_LINES = 120;
const MAX_STATUS_WAIT_MS = 30 * 60_000;
const SUBMISSION_GRACE_MS = 2_000;

const START_PARAMETERS = Type.Object({
  command: Type.String({ description: "Single-line shell command to start in the visible Herdr command pane" }),
  cwd: Type.Optional(Type.String({ description: "Working directory; relative paths resolve from the Pi session cwd" })),
  label: Type.Optional(Type.String({ description: "Short label for the managed command pane" })),
});

const STATUS_PARAMETERS = Type.Object({
  waitMs: Type.Optional(Type.Integer({
    description: "Optionally wait up to this many milliseconds for the current command to finish, up to 30 minutes (default: return immediately)",
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

  const rememberManagedPane = (current: ManagedPane): ManagedPane => {
    const previous = managedPane;
    managedPane = current;
    if (
      !previous ||
      previous.paneId !== current.paneId ||
      previous.terminalId !== current.terminalId ||
      previous.workspaceId !== current.workspaceId ||
      previous.tabId !== current.tabId
    ) {
      pi.appendEntry(HERDR_COMMAND_PANE_ENTRY, current);
    }
    return current;
  };

  const callingPane = (panes: ReturnType<typeof parsePaneList>): ManagedPane => {
    if (!callerPaneId || !callerWorkspaceId) {
      throw new Error("Herdr did not provide the calling pane context");
    }
    const caller = panes
      .map(paneRecordToManagedPane)
      .find((pane): pane is ManagedPane => pane?.paneId === callerPaneId && pane.workspaceId === callerWorkspaceId);
    if (!caller) throw new Error(`The calling Herdr pane ${callerPaneId} is no longer present`);
    return caller;
  };

  const reportPaneMetadata = async (
    pane: ManagedPane,
    args: string[],
    signal?: AbortSignal,
  ): Promise<void> => {
    const result = await herdr([
      "pane", "report-metadata", pane.paneId,
      "--source", HERDR_COMMAND_METADATA_SOURCE,
      ...args,
    ], { signal, timeout: 10_000 });
    if (result.code !== 0) throw execFailure("updating Herdr command pane metadata", result);
  };

  const tagManagedPane = async (
    pane: ManagedPane,
    ownerTerminalId: string,
    signal?: AbortSignal,
  ): Promise<void> => reportPaneMetadata(pane, [
    "--token", `${HERDR_COMMAND_OWNER_TOKEN}=${ownerTerminalId}`,
  ], signal);

  const tagManagedRun = async (
    pane: ManagedPane,
    run: ManagedRun,
    signal?: AbortSignal,
  ): Promise<void> => reportPaneMetadata(pane, [
    "--token", `${HERDR_COMMAND_RUN_TOKEN}=${run.runId}`,
    "--token", `${HERDR_COMMAND_STARTED_AT_TOKEN}=${run.startedAt}`,
  ], signal);

  const recoverManagedPane = async (
    panes: ReturnType<typeof parsePaneList>,
    caller: ManagedPane,
    signal?: AbortSignal,
  ): Promise<ManagedPane | undefined> => {
    if (managedPane) {
      const record = panes.find(pane => pane.terminal_id === managedPane!.terminalId);
      const current = record && paneRecordToManagedPane(record);
      if (current) {
        const ownerTerminalId = paneRecordOwnerTerminalId(record);
        if (!ownerTerminalId) {
          await tagManagedPane(current, caller.terminalId, signal);
          return rememberManagedPane(current);
        }
        if (ownerTerminalId === caller.terminalId) return rememberManagedPane(current);
      }
      managedPane = undefined;
    }

    const owned = panes.filter(pane => paneRecordOwnerTerminalId(pane) === caller.terminalId);
    if (owned.length > 1) {
      throw new Error(`Multiple Herdr command panes are tagged for calling terminal ${caller.terminalId}`);
    }
    const adopted = owned[0] && paneRecordToManagedPane(owned[0]);
    return adopted ? rememberManagedPane(adopted) : undefined;
  };

  const recoverManagedRun = (
    panes: ReturnType<typeof parsePaneList>,
    pane: ManagedPane | undefined,
  ): void => {
    if (!pane) return;
    const record = panes.find(candidate => candidate.terminal_id === pane.terminalId);
    const recovered = record && paneRecordToManagedRun(record);
    if (!recovered) return;
    if (latestRun?.terminalId === recovered.terminalId && latestRun.runId === recovered.runId) return;
    latestRun = recovered;
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
    return rememberManagedPane(current);
  };

  const createManagedPane = async (
    cwd: string,
    label: string,
    ownerTerminalId: string,
    signal?: AbortSignal,
  ): Promise<ManagedPane> => {
    if (!callerPaneId || !callerWorkspaceId) {
      throw new Error("Herdr did not provide the calling pane context");
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
    rememberManagedPane(pane);
    await tagManagedPane(pane, ownerTerminalId, signal);

    const rename = await herdr(["pane", "rename", pane.paneId, label], { signal, timeout: 10_000 });
    if (rename.code !== 0) throw execFailure("herdr pane rename", rename);
    return pane;
  };

  const ensurePane = async (
    cwd: string,
    label: string,
    signal?: AbortSignal,
  ): Promise<{ pane: ManagedPane; created: boolean }> => {
    const panes = await listPanes(signal);
    const caller = callingPane(panes);
    const existing = await recoverManagedPane(panes, caller, signal);
    if (existing) return { pane: existing, created: false };
    return { pane: await createManagedPane(cwd, label, caller.terminalId, signal), created: true };
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

    // Herdr metadata survives a Pi crash or session replacement. Write it before
    // pane run so a later Pi session can reconstruct the marker protocol even if
    // this process dies before appendEntry below.
    const run: ManagedRun = {
      runId,
      terminalId: current.terminalId,
      command,
      cwd,
      startedAt: now(),
    };
    await tagManagedRun(current, run, signal);
    const result = await herdr(["pane", "run", current.paneId, paneCommand], { signal, timeout: 10_000 });
    if (result.code !== 0) {
      // Keep metadata if the client lost the response after Herdr accepted input.
      // A later start overwrites a stale record; removing it here could make a
      // live command impossible for a replacement Pi session to monitor.
      throw execFailure("herdr pane run", result);
    }

    latestRun = run;
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

  pi.on("session_start", async (_event, ctx) => {
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

    const panes = await listPanes();
    const pane = await recoverManagedPane(panes, callingPane(panes));
    recoverManagedRun(panes, pane);
  });

  pi.registerTool({
    name: HERDR_START_COMMAND_TOOL_NAME,
    label: "Herdr Start Command",
    description: "Start one ordinary long-running shell command in a visible reusable Herdr pane and return immediately after submission. Use for builds, long test suites, code generation, or other work that can continue while the agent does independent tasks. Use bash instead for short commands or when the result is required before the next action. Only one command can occupy the managed pane at a time.",
    promptSnippet: "Start a long-running command in a visible Herdr pane without waiting for completion",
    promptGuidelines: [
      "Use herdr_start_command for long-running builds, test suites, generation, or similar commands that should remain visible while independent work continues; use bash for short commands or results needed immediately.",
      "After herdr_start_command returns, continue useful independent work instead of polling. Use herdr_command_status when its result becomes relevant, with short waits while the command is new or uncertain and longer waits only after stable progress is observed.",
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
    description: "Inspect the latest command started by herdr_start_command. Returns its running or completed state, exit code, foreground processes, and recent pane output. Returns immediately unless waitMs requests a bounded wait of at most 30 minutes, and returns early when the command finishes. Check status before relying on command artifacts or reporting success.",
    promptSnippet: "Inspect or wait for the latest command in the managed Herdr pane",
    promptGuidelines: [
      "Use herdr_command_status to inspect a previously started Herdr command when its result becomes relevant; omit waitMs for an immediate check.",
      "For a new or uncertain command, use herdr_command_status with a 1–2 minute wait and then a 5 minute wait instead of fixed bash sleeps. When expected progress remains absent, keep the command running and use at most 1–2 read-only diagnostics for its foreground processes, logs, dependencies, disk, or resource pressure.",
      "After herdr_command_status shows stable output, dependencies, and resource use, use 10–30 minute waits or wait for completion. Return to short waits when the command changes phase, progress stops, an error appears, or resource pressure changes.",
      "Never restart or terminate a command solely because herdr_command_status shows no new output; confirm completion with herdr_command_status before relying on artifacts or reporting success.",
    ],
    parameters: STATUS_PARAMETERS,
    async execute(_toolCallId, params, signal) {
      await launchQueue;
      return commandStatus(params, signal);
    },
  });
}
