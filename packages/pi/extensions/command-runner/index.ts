import { createBackend, runTokens } from "./backends.ts";
import { BackgroundTerminalStatus } from "../program-status.ts";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  keyText,
  truncateTail,
} from "@earendil-works/pi-coding-agent";
import { type Component, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  CompactToolCard,
  countToolResultWords,
  EmptyToolResult,
  type CompactRenderState,
  type CompactRowVisual,
  type CompactTheme,
  type ToolCardMetadata,
} from "../pi-ui/tool-cards/rendering.ts";
import {
  buildPaneCommand,
  buildRunMarkers,
  exitCodeFromTranscript,
  extractTranscript,
  HERDR_COMMAND_OWNER_TOKEN,
  HERDR_COMMAND_PANE_ENTRY,
  HERDR_COMMAND_RUN_ENTRY,
  COMMAND_STATUS_TOOL_NAME,
  START_COMMAND_TOOL_NAME,
  isManagedPane,
  isManagedRun,
  type ManagedPane,
  type ManagedRun,
  normalizeLabel,
  paneRecordOwnerTerminalId,
  paneRecordToManagedPane,
  paneRecordToManagedRun,
  resolveCommandCwd,
  type RunMarkers,
  validateCommandText,
} from "./command-runner.ts";

const DEFAULT_STATUS_LINES = 120;
const MAX_STATUS_WAIT_MS = 30 * 60_000;
const SUBMISSION_GRACE_MS = 2_000;
const NOTIFICATION_ENTRY = "toolkit-command-notification";
const MONITOR_INTERVAL_MS = 2_000;

const START_PARAMETERS = Type.Object({
  command: Type.String({
    description: "Single-line shell command to start in the visible command pane",
  }),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory; relative paths resolve from the Pi session cwd",
    }),
  ),
  label: Type.Optional(Type.String({ description: "Short label for the managed command pane" })),
});

const STATUS_PARAMETERS = Type.Object({
  waitMs: Type.Optional(
    Type.Integer({
      description:
        "Optionally wait up to this many milliseconds for the current command to finish, up to 30 minutes (default: return immediately)",
      minimum: 1_000,
      maximum: MAX_STATUS_WAIT_MS,
    }),
  ),
  lines: Type.Optional(
    Type.Integer({
      description: `Number of recent output lines to return (default: ${DEFAULT_STATUS_LINES}, maximum: ${DEFAULT_MAX_LINES})`,
      minimum: 1,
      maximum: DEFAULT_MAX_LINES,
    }),
  ),
});

type RunState = "submitted" | "running" | "completed" | "lost" | "busy" | "none";

interface CommandDetails {
  backend?: "Herdr" | "Rex";
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
  stateDirectory?: string;
  schedule?: (callback: () => Promise<void>) => () => void;
}

function recentOutput(
  text: string,
  markers: RunMarkers,
): { output: string; startUnavailable: boolean } {
  const transcript = extractTranscript(text, markers);
  if (transcript.started) return { output: transcript.output, startUnavailable: false };

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const end = lines.findLastIndex((line) => {
    if (!line.startsWith(markers.endPrefix)) return false;
    return /^[0-9]+$/.test(line.slice(markers.endPrefix.length));
  });
  return {
    output: lines
      .slice(0, end >= 0 ? end : lines.length)
      .join("\n")
      .trimEnd(),
    startUnavailable: true,
  };
}

function formatDuration(durationMs: number | undefined): string | undefined {
  if (durationMs === undefined) return undefined;
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function commandResultSummary(
  details: CommandDetails | undefined,
  isError = false,
): string | undefined {
  if (!details) return isError ? "failed" : undefined;
  const parts: string[] = [];
  switch (details.state) {
    case "submitted":
      parts.push("submitted");
      break;
    case "running":
      parts.push("running");
      if (details.durationMs !== undefined) {
        const duration = formatDuration(details.durationMs);
        if (duration) parts.push(duration);
      }
      break;
    case "completed":
      parts.push(`exit ${details.exitCode ?? "?"}`);
      if (details.durationMs !== undefined) {
        const duration = formatDuration(details.durationMs);
        if (duration) parts.push(`observed after ${duration}`);
      }
      break;
    case "busy":
    case "lost":
    case "none":
      parts.push(details.state);
      break;
  }
  return parts.join(" · ");
}

function commandResultVisual(
  details: CommandDetails | undefined,
  expanded: boolean,
  isError = false,
): CompactRowVisual {
  if (!details) {
    return isError
      ? { symbol: "✗", color: "error", expanded }
      : { symbol: "✓", color: "success", expanded };
  }
  if (details.state === "completed") {
    return details.exitCode === 0
      ? { symbol: "✓", color: "success", expanded }
      : { symbol: "✗", color: "error", expanded };
  }
  if (details.state === "submitted" || details.state === "running") {
    return { symbol: "●", color: "warning", expanded };
  }
  if (details.state === "busy" || details.state === "lost") {
    return { symbol: "!", color: "warning", expanded };
  }
  return { symbol: "·", color: "muted", expanded };
}

function pendingVisual(context: {
  argsComplete: boolean;
  executionStarted: boolean;
  expanded: boolean;
  isError: boolean;
  isPartial: boolean;
}): CompactRowVisual {
  if (!context.argsComplete || !context.executionStarted) {
    return { symbol: "·", color: "muted", expanded: context.expanded };
  }
  if (context.isPartial) {
    return { symbol: "●", color: "warning", expanded: context.expanded };
  }
  return context.isError
    ? { symbol: "✗", color: "error", expanded: context.expanded }
    : { symbol: "✓", color: "success", expanded: context.expanded };
}

function updateCommandCard(
  state: CompactRenderState,
  lastComponent: Component | undefined,
  label: string,
  description: string,
  visual: CompactRowVisual,
  summary: string | undefined,
  theme: CompactTheme,
  expandedResult?: Component,
  metadata?: ToolCardMetadata,
  options: { compact?: boolean; preview?: string[]; showCompactSummary?: boolean } = {},
): CompactToolCard {
  const card =
    lastComponent instanceof CompactToolCard
      ? lastComponent
      : (state.card ?? new CompactToolCard());
  state.card = card;
  card
    .setCompact(options.compact ?? true)
    .setDisplayLabel(label)
    .setShowCompactSummary(options.showCompactSummary ?? false)
    .updateCall(label, description, visual, summary, theme);
  if (metadata) card.updateResult(options.preview ?? [], expandedResult, metadata);
  return card;
}

function commandResultText(result: AgentToolResult<CommandDetails>): string {
  return result.content
    .filter(
      (item): item is { type: "text"; text: string } =>
        item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

function renderExpandedResult(
  result: AgentToolResult<CommandDetails>,
  theme: CompactTheme,
): Text | EmptyToolResult {
  const output = commandResultText(result);
  if (!output) return new EmptyToolResult();
  return new Text(
    output
      .split("\n")
      .map((line) => theme.fg("toolOutput", line))
      .join("\n"),
    0,
    0,
  );
}

function previewCommandResult(
  result: AgentToolResult<CommandDetails>,
  expandHint: string,
  maxLines = 5,
): string[] {
  // Status results wrap terminal output in a leading state paragraph and trailing
  // recovery notices. Keep both in expanded output, but preview only the payload.
  const text = commandResultText(result);
  const separator = text.indexOf("\n\n");
  const output = (separator >= 0 ? text.slice(separator + 2) : text)
    .replace(
      /(?:\n\n\[(?:Recent output truncated|The run's start marker is outside)[^\]]*\])+\s*$/u,
      "",
    )
    .trimEnd();
  if (!output) return [];
  const lines = output.split("\n");
  const shown = lines.slice(-maxLines);
  if (lines.length > maxLines) {
    shown.push("", `... ${lines.length - maxLines} more lines, press ${expandHint}`);
  }
  return shown;
}

function processSummary(
  processes: Array<{ pid: number; name?: string; cmdline?: string }>,
): string {
  const visible = processes.filter((process) => process.name || process.cmdline);
  if (!visible.length) return "";
  return `\nForeground: ${visible.map((process) => process.name || process.cmdline).join(", ")}`;
}

export default function commandRunnerExtension(pi: ExtensionAPI, dependencies: Dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const makeRunId = dependencies.randomUUID ?? randomUUID;
  const expandHint = `${keyText("app.tools.expand")} to expand`;
  pi.registerMessageRenderer<CommandDetails>("command-result", (message, { expanded }, theme) => {
    if (!message.details) return undefined;
    const result: AgentToolResult<CommandDetails> = {
      content:
        typeof message.content === "string"
          ? [{ type: "text", text: message.content }]
          : message.content,
      details: message.details,
    };
    return updateCommandCard(
      {},
      undefined,
      "Command Result",
      `Command: ${message.details.command ?? message.details.runId ?? "…"}`,
      commandResultVisual(message.details, expanded),
      commandResultSummary(message.details),
      theme,
      expanded ? renderExpandedResult(result, theme) : undefined,
      { words: countToolResultWords(result) },
      { compact: false, preview: previewCommandResult(result, expandHint) },
    );
  });
  // Saved completion messages remain renderable outside the originating terminal backend.
  const backend = createBackend(pi, { ...process.env }, dependencies.stateDirectory);
  if (!backend) return;
  const terminalStatus = new BackgroundTerminalStatus();
  const callerPaneId = backend.callerPaneId;
  const callerWorkspaceId = backend.callerWorkspaceId;
  let managedPane: ManagedPane | undefined;
  let latestRun: ManagedRun | undefined;
  let launchQueue = Promise.resolve();
  let monitor: { run: ManagedRun; controller: AbortController } | undefined;
  let cancelTick: (() => void) | undefined;
  const notified = new Set<string>();
  const schedule =
    dependencies.schedule ??
    ((callback: () => Promise<void>) => {
      const timer = setTimeout(() => void callback(), MONITOR_INTERVAL_MS);
      timer.unref();
      return () => clearTimeout(timer);
    });
  // Launches, manual checks, and monitoring share mutable pane/run state.
  // Serializing them also preserves the previous outcome before pane reuse.
  const exclusive = <T>(action: () => Promise<T>): Promise<T> => {
    const result = launchQueue.then(action);
    launchQueue = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const startedAt = new Map<string, number>();
  const finishedAt = new Map<string, number>();
  const cardMetadata = (
    toolCallId: string,
    result?: AgentToolResult<CommandDetails>,
  ): ToolCardMetadata => {
    const start = startedAt.get(toolCallId);
    const end = finishedAt.get(toolCallId) ?? now();
    return {
      durationMs: start === undefined ? undefined : Math.max(0, end - start),
      words: result ? countToolResultWords(result) : undefined,
    };
  };

  const listPanes = (signal?: AbortSignal) => backend.list(signal);

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

  const callingPane = (panes: Awaited<ReturnType<typeof backend.list>>): ManagedPane => {
    if (!callerPaneId || !callerWorkspaceId) {
      throw new Error(`${backend.name} did not provide the calling pane context`);
    }
    const caller = panes
      .map(paneRecordToManagedPane)
      .find(
        (pane): pane is ManagedPane =>
          pane?.paneId === callerPaneId && pane.workspaceId === callerWorkspaceId,
      );
    if (!caller) throw new Error(`The calling terminal pane ${callerPaneId} is no longer present`);
    return caller;
  };

  const tagManagedPane = (pane: ManagedPane, ownerTerminalId: string, signal?: AbortSignal) =>
    backend.tag(pane, { [HERDR_COMMAND_OWNER_TOKEN]: ownerTerminalId }, signal);

  const tagManagedRun = (pane: ManagedPane, run: ManagedRun, signal?: AbortSignal) =>
    backend.tag(pane, runTokens(run), signal);

  const recoverManagedPane = async (
    panes: Awaited<ReturnType<typeof backend.list>>,
    caller: ManagedPane,
    signal?: AbortSignal,
  ): Promise<ManagedPane | undefined> => {
    if (managedPane) {
      const record = panes.find((pane) => pane.terminal_id === managedPane!.terminalId);
      const current = record && paneRecordToManagedPane(record);
      if (current) {
        const ownerTerminalId = paneRecordOwnerTerminalId(record);
        if (!ownerTerminalId && backend.adoptUntaggedPane) {
          await tagManagedPane(current, caller.terminalId, signal);
          return rememberManagedPane(current);
        }
        if (ownerTerminalId === caller.terminalId) {
          await backend.prepare?.(current, signal);
          return rememberManagedPane(current);
        }
      }
      managedPane = undefined;
    }

    const owned = panes.filter((pane) => paneRecordOwnerTerminalId(pane) === caller.terminalId);
    if (owned.length > 1) {
      throw new Error(
        `Multiple command panes are tagged for calling terminal ${caller.terminalId}`,
      );
    }
    const adopted = owned[0] && paneRecordToManagedPane(owned[0]);
    if (adopted) {
      await backend.prepare?.(adopted, signal);
      return rememberManagedPane(adopted);
    }
    return undefined;
  };

  const recoverManagedRun = (
    panes: Awaited<ReturnType<typeof backend.list>>,
    pane: ManagedPane | undefined,
  ): void => {
    if (!pane) return;
    const record = panes.find((candidate) => candidate.terminal_id === pane.terminalId);
    const recovered = record && paneRecordToManagedRun(record);
    if (!recovered) return;
    if (latestRun?.terminalId === recovered.terminalId && latestRun.runId === recovered.runId)
      return;
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
    owner: string,
    signal?: AbortSignal,
  ) => {
    const pane = rememberManagedPane(await backend.create(cwd, owner, signal));
    await tagManagedPane(pane, owner, signal);
    await backend.rename(pane, label, signal);
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
      throw new Error(`command pane ${pane.paneId} is no longer present`);
    }
    return backend.read(current, signal);
  };

  const paneProcessInfo = async (pane: ManagedPane, signal?: AbortSignal) => {
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`Command pane ${pane.paneId} is no longer present`);
    }
    return backend.process(current, signal);
  };

  const waitForCompletion = async (
    pane: ManagedPane,
    markers: RunMarkers,
    waitMs: number,
    signal?: AbortSignal,
  ) => {
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`Command pane ${pane.paneId} is no longer present`);
    }
    await backend.wait(current, markers, waitMs, signal);
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
        submissionPending =
          exitCodeFromTranscript(text, markers) === undefined &&
          now() - latestRun.startedAt < SUBMISSION_GRACE_MS;
      }
      if (!info.idle || submissionPending) {
        return {
          content: [
            {
              type: "text" as const,
              text: `command pane ${pane.paneId} is already busy. Use ${COMMAND_STATUS_TOOL_NAME} to inspect the current command before starting another.${processSummary(info.foregroundProcesses)}`,
            },
          ],
          details: {
            backend: backend.name,
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
        await backend.rename(pane, label, signal);
      }
    }

    // Deliver the previous run's result before its scrollback can be replaced.
    await inspectMonitor();
    const runId = makeRunId();
    const markers = buildRunMarkers(runId);
    const paneCommand = buildPaneCommand(command, cwd, markers);
    const current = await refreshManagedPane(signal);
    if (!current || current.terminalId !== pane.terminalId) {
      throw new Error(`command pane ${pane.paneId} is no longer present`);
    }

    // Backend tracking survives Pi session replacement. Persist the run before
    // submission so an uncertain response never causes an untracked command.
    const run: ManagedRun = {
      runId,
      terminalId: current.terminalId,
      command,
      cwd,
      startedAt: now(),
    };
    await tagManagedRun(current, run, signal);
    // Retain tracking even if submission succeeds but its response is lost.
    latestRun = run;
    pi.appendEntry(HERDR_COMMAND_RUN_ENTRY, run);
    try {
      await backend.submit(current, paneCommand, signal);
    } finally {
      // Submission cancellation does not cancel the command or its watcher.
      watchRun(run, ctx);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Started command ${runId} in ${backend.name} pane ${current.paneId}. It is running independently. ${ctx.mode === "tui" || ctx.mode === "rpc" ? "Completion will arrive automatically as a follow-up. Continue other work or end your turn; do not poll." : `Automatic notifications are unavailable in this mode; use ${COMMAND_STATUS_TOOL_NAME} to confirm completion.`}`,
        },
      ],
      details: {
        backend: backend.name,
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
  ): Promise<AgentToolResult<CommandDetails>> => {
    if (!latestRun) {
      return {
        content: [{ type: "text" as const, text: "No command is tracked for this Pi session." }],
        details: { backend: backend.name, state: "none" } satisfies CommandDetails,
      };
    }

    const pane = await refreshManagedPane(signal);
    if (!pane || pane.terminalId !== latestRun.terminalId) {
      return {
        content: [
          {
            type: "text" as const,
            text: `The pane for command ${latestRun.runId} is no longer present.`,
          },
        ],
        details: {
          backend: backend.name,
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

    // The shell can finish between the transcript read and process inspection.
    if (exitCode === undefined && info.idle) {
      text = await readPane(pane, signal);
      exitCode = exitCodeFromTranscript(text, markers);
    }
    const transcript = extractTranscript(text, markers);
    const durationMs = now() - latestRun.startedAt;
    const state: RunState =
      exitCode !== undefined
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
      ? `\n\n[Recent output truncated to ${truncation.outputLines} lines / ${formatSize(truncation.outputBytes)}. Full output remains visible in ${backend.name} pane ${pane.paneId}.]`
      : "";
    const startNotice = output.startUnavailable
      ? `\n\n[The run's start marker is outside recent terminal scrollback; output may begin mid-stream.]`
      : "";
    const status =
      state === "completed"
        ? exitCode === 0
          ? `Command ${latestRun.runId} completed successfully, observed ${(durationMs / 1000).toFixed(1)}s after submission`
          : `Command ${latestRun.runId} failed with exit code ${exitCode}, observed ${(durationMs / 1000).toFixed(1)}s after submission`
        : state === "running"
          ? `Command ${latestRun.runId} is still running after ${(durationMs / 1000).toFixed(1)}s`
          : state === "submitted"
            ? `Command ${latestRun.runId} was submitted ${(durationMs / 1000).toFixed(1)}s ago and has not emitted its start marker yet`
            : `Command ${latestRun.runId} is no longer running, but no completion marker was found`;

    return {
      content: [
        {
          type: "text" as const,
          text: `${status} in ${backend.name} pane ${pane.paneId}.${processSummary(info.foregroundProcesses)}\n\n${truncation.content}${truncationNotice}${startNotice}`,
        },
      ],
      details: {
        backend: backend.name,
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

  const stopMonitor = () => {
    cancelTick?.();
    cancelTick = undefined;
    monitor?.controller.abort();
    monitor = undefined;
    terminalStatus.updateStatus();
  };

  const inspectMonitor = async () => {
    const active = monitor;
    if (!active || notified.has(active.run.runId)) return;
    let result: AgentToolResult<CommandDetails>;
    try {
      result =
        latestRun?.runId === active.run.runId
          ? await commandStatus({ lines: 20 }, active.controller.signal)
          : {
              content: [
                {
                  type: "text",
                  text: `Tracking for command ${active.run.runId} was replaced by another session. Its result is unavailable.`,
                },
              ],
              details: { state: "lost", runId: active.run.runId },
            };
    } catch (error) {
      result = {
        content: [
          {
            type: "text",
            text: `Unable to monitor command ${active.run.runId}: ${error instanceof Error ? error.message : String(error)}. The command may still be running. Use command_status to inspect it; do not resubmit automatically.`,
          },
        ],
        details: { state: "lost", runId: active.run.runId },
      };
    }
    if (monitor !== active || active.controller.signal.aborted) return;
    if (result.details.state !== "completed" && result.details.state !== "lost") return;
    pi.sendMessage(
      {
        customType: "command-result",
        display: true,
        content: `Command: ${active.run.command ?? active.run.runId}\n${commandResultText(result)}`,
        details: { ...result.details, command: active.run.command, cwd: active.run.cwd },
      },
      { deliverAs: "followUp", triggerTurn: true },
    );
    // Keep working across dispatch until the resumed agent fully settles.
    terminalStatus.agentQueued();
    // This receipt records dispatch into Pi's follow-up queue, not agent processing.
    notified.add(active.run.runId);
    pi.appendEntry(NOTIFICATION_ENTRY, { runId: active.run.runId });
    stopMonitor();
  };

  const watchRun = (run: ManagedRun, ctx: ExtensionContext) => {
    stopMonitor();
    if (!["tui", "rpc"].includes(ctx.mode) || notified.has(run.runId)) return;
    const active = { run, controller: new AbortController() };
    monitor = active;
    terminalStatus.updateStatus({ state: "working", message: "Waiting for command" });
    const tick = async () => {
      try {
        await exclusive(async () => {
          if (monitor === active) await inspectMonitor();
        });
      } catch (error) {
        if (monitor !== active) return;
        stopMonitor();
        ctx.ui.notify(
          `Automatic command notification failed: ${error instanceof Error ? error.message : String(error)}. Use command_status to inspect the command.`,
          "error",
        );
      }
      if (monitor === active) cancelTick = schedule(tick);
    };
    cancelTick = schedule(tick);
  };

  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode === "tui") terminalStatus.agentStarted(pi.getSessionName?.());
  });
  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.mode === "tui" && ctx.isIdle()) terminalStatus.agentSettled();
  });

  pi.on("session_shutdown", async (event, ctx) => {
    terminalStatus.detach();
    terminalStatus.agentSettled();
    ctx?.ui.setWidget?.("command-runner-status", undefined);
    stopMonitor();
    await launchQueue;
    stopMonitor();
    // Reload and resume preserve the reusable pane and any running command.
    if (event.reason !== "quit" && event.reason !== "new") return;
    try {
      await backend.shutdown?.(event.reason);
    } catch (error) {
      ctx.ui.notify(`Command pane retained: ${String(error)}`, "warning");
    }
  });

  const restore = async (ctx: ExtensionContext) => {
    stopMonitor();
    terminalStatus.detach();
    terminalStatus.agentSettled();
    if (ctx.mode === "tui") {
      if (ctx.isIdle?.() === false) terminalStatus.agentQueued();
      // A zero-height widget gives us the public terminal without displaying UI.
      ctx.ui.setWidget?.("command-runner-status", (tui) => {
        terminalStatus.attach(tui.terminal, {
          state: ctx.isIdle?.() === false ? "working" : "idle",
          app: "pi",
          message: pi.getSessionName?.(),
        });
        return { render: () => [], invalidate() {} };
      });
    }
    await launchQueue;
    notified.clear();
    managedPane = undefined;
    latestRun = undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
      const candidate = entry as { type?: string; customType?: string; data?: unknown };
      if (candidate.type !== "custom") continue;
      if (candidate.customType === NOTIFICATION_ENTRY) {
        const receipt = candidate.data as { runId?: unknown } | undefined;
        if (typeof receipt?.runId === "string") notified.add(receipt.runId);
      }
      if (candidate.customType === HERDR_COMMAND_PANE_ENTRY && isManagedPane(candidate.data)) {
        managedPane = candidate.data;
      }
      if (candidate.customType === HERDR_COMMAND_RUN_ENTRY && isManagedRun(candidate.data)) {
        latestRun = candidate.data;
      }
    }

    // Pane adoption does not subscribe a new conversation to another session's run.
    const ownRun = latestRun;
    const panes = await listPanes();
    const pane = await recoverManagedPane(panes, callingPane(panes));
    recoverManagedRun(panes, pane);
    if (ownRun) watchRun(ownRun, ctx);
  };
  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));

  pi.registerTool({
    name: START_COMMAND_TOOL_NAME,
    label: "Start Command",
    description:
      `Backend: ${backend.name}. ` +
      "Start one ordinary long-running shell command in a visible reusable terminal pane and return immediately after submission. Use for builds, long test suites, code generation, or other work that can continue while the agent does independent tasks. Use bash instead for short commands or when the result is required before the next action. Only one command can occupy the managed pane at a time. In interactive and RPC sessions, completion or lost tracking arrives automatically as a follow-up with an exit code and bounded output; continue independent work or end your turn instead of polling.",
    promptSnippet:
      "Start a long-running command in a visible terminal pane without waiting for completion",
    promptGuidelines: [
      "Use start_command for long-running builds, test suites, generation, or similar commands that should remain visible while independent work continues; use bash for short commands or results needed immediately.",
      "After start_command returns, continue useful independent work or end your turn. Completion arrives automatically as a follow-up in interactive and RPC sessions; do not poll or block waiting for it.",
    ],
    parameters: START_PARAMETERS,
    renderShell: "self",
    renderCall(args, theme, context) {
      const state = context.state as CompactRenderState;
      return updateCommandCard(
        state,
        context.lastComponent,
        "Command Start",
        `Command: ${args.command || "…"}`,
        pendingVisual(context),
        state.summary,
        theme,
      );
    },
    renderResult(result, { expanded }, theme, context) {
      const state = context.state as CompactRenderState;
      const details = result.details as CommandDetails | undefined;
      state.summary =
        details?.state === "submitted" ? undefined : commandResultSummary(details, context.isError);
      updateCommandCard(
        state,
        context.lastComponent,
        "Command Start",
        `Command: ${context.args.command || "…"}`,
        commandResultVisual(details, expanded, context.isError),
        state.summary,
        theme,
        renderExpandedResult(result as AgentToolResult<CommandDetails>, theme),
        cardMetadata(context.toolCallId),
      );
      return new EmptyToolResult();
    },
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      startedAt.set(toolCallId, now());
      try {
        return await exclusive(() => startCommand(params, signal, ctx));
      } finally {
        finishedAt.set(toolCallId, now());
      }
    },
  });

  pi.registerTool({
    name: COMMAND_STATUS_TOOL_NAME,
    label: "Command Status",
    description:
      `Backend: ${backend.name}. ` +
      "Inspect the latest command started by start_command. Returns its running or completed state, exit code, foreground processes, and recent pane output. Completion arrives automatically as a follow-up in interactive and RPC sessions. Use this tool for immediate diagnostics, not routine polling. Returns immediately unless waitMs explicitly requests a bounded wait of at most 30 minutes. Confirm a successful completion notification or status result before relying on artifacts or reporting success.",
    promptSnippet:
      "Inspect the latest command in the managed terminal pane when diagnostics are needed",
    promptGuidelines: [
      "Use command_status for immediate output and process diagnostics; omit waitMs. Completion notifications make routine polling and blocking waits unnecessary in interactive and RPC sessions.",
      "If start_command is still running and no independent work remains, end your turn and let its completion follow-up resume work. Use command_status with waitMs only when an explicit bounded wait is required or automatic notifications are unavailable.",
      "Never restart or terminate a command solely because command_status shows no new output. A lost tracking notification is not proof of failure or permission to resubmit. Confirm successful completion through a notification or command_status before relying on artifacts or reporting success.",
    ],
    parameters: STATUS_PARAMETERS,
    renderShell: "self",
    renderCall(args, theme, context) {
      const state = context.state as CompactRenderState;
      const wait = args.waitMs ? `wait ${formatDuration(args.waitMs)}` : undefined;
      return updateCommandCard(
        state,
        context.lastComponent,
        "Command Status",
        `Command: ${latestRun?.command ?? "…"}`,
        pendingVisual(context),
        wait,
        theme,
        undefined,
        undefined,
        { showCompactSummary: true },
      );
    },
    renderResult(result, { expanded }, theme, context) {
      const state = context.state as CompactRenderState;
      const details = result.details as CommandDetails | undefined;
      const completed = details?.state === "completed";
      const wait =
        !completed && context.args.waitMs
          ? `wait ${formatDuration(context.args.waitMs)}`
          : undefined;
      const resultSummary = commandResultSummary(details, context.isError);
      state.summary = [wait, resultSummary].filter(Boolean).join(" · ") || undefined;
      const typedResult = result as AgentToolResult<CommandDetails>;
      updateCommandCard(
        state,
        context.lastComponent,
        "Command Status",
        `Command: ${details?.command ?? latestRun?.command ?? "…"}`,
        commandResultVisual(details, expanded, context.isError),
        state.summary,
        theme,
        expanded || (context.isError && !completed)
          ? renderExpandedResult(typedResult, theme)
          : undefined,
        cardMetadata(context.toolCallId, typedResult),
        {
          compact: !completed,
          preview: completed ? previewCommandResult(typedResult, expandHint) : [],
          showCompactSummary: true,
        },
      );
      return new EmptyToolResult();
    },
    async execute(toolCallId, params, signal) {
      startedAt.set(toolCallId, now());
      try {
        return await exclusive(async () => {
          const result = await commandStatus(params, signal);
          // An explicit check also acknowledges terminal outcomes, without a duplicate follow-up.
          if (
            monitor &&
            result.details.runId === monitor.run.runId &&
            (result.details.state === "completed" || result.details.state === "lost")
          ) {
            notified.add(monitor.run.runId);
            pi.appendEntry(NOTIFICATION_ENTRY, { runId: monitor.run.runId });
            stopMonitor();
          }
          return result;
        });
      } finally {
        finishedAt.set(toolCallId, now());
      }
    },
  });
}
