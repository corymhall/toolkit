import { createBackend, runTokens } from "./backends.ts";
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
        if (duration) parts.push(duration);
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
  const backend = createBackend(pi, { ...process.env }, dependencies.stateDirectory);
  if (!backend) return;

  const now = dependencies.now ?? Date.now;
  const makeRunId = dependencies.randomUUID ?? randomUUID;
  const expandHint = `${keyText("app.tools.expand")} to expand`;
  const callerPaneId = backend.callerPaneId;
  const callerWorkspaceId = backend.callerWorkspaceId;
  let managedPane: ManagedPane | undefined;
  let latestRun: ManagedRun | undefined;
  let launchQueue = Promise.resolve();
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
    await backend.submit(current, paneCommand, signal);

    return {
      content: [
        {
          type: "text" as const,
          text: `Started command ${runId} in ${backend.name} pane ${current.paneId}. It is running independently; continue other work and use ${COMMAND_STATUS_TOOL_NAME} when its result is needed.`,
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
          ? `Command ${latestRun.runId} completed successfully in ${(durationMs / 1000).toFixed(1)}s`
          : `Command ${latestRun.runId} failed with exit code ${exitCode} after ${(durationMs / 1000).toFixed(1)}s`
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

  pi.on("session_shutdown", async (event) => {
    // Reloads and conversation switches keep the caller's reusable pane.
    if (event.reason !== "quit") return;
    await launchQueue;
    await backend.shutdown?.();
  });

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
    name: START_COMMAND_TOOL_NAME,
    label: "Start Command",
    description:
      `Backend: ${backend.name}. ` +
      "Start one ordinary long-running shell command in a visible reusable terminal pane and return immediately after submission. Use for builds, long test suites, code generation, or other work that can continue while the agent does independent tasks. Use bash instead for short commands or when the result is required before the next action. Only one command can occupy the managed pane at a time.",
    promptSnippet:
      "Start a long-running command in a visible terminal pane without waiting for completion",
    promptGuidelines: [
      "Use start_command for long-running builds, test suites, generation, or similar commands that should remain visible while independent work continues; use bash for short commands or results needed immediately.",
      "After start_command returns, continue useful independent work instead of polling. Use command_status when its result becomes relevant, with short waits while the command is new or uncertain and longer waits only after stable progress is observed.",
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
      let release!: () => void;
      const previous = launchQueue;
      launchQueue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await startCommand(params, signal, ctx);
      } finally {
        finishedAt.set(toolCallId, now());
        release();
      }
    },
  });

  pi.registerTool({
    name: COMMAND_STATUS_TOOL_NAME,
    label: "Command Status",
    description:
      `Backend: ${backend.name}. ` +
      "Inspect the latest command started by start_command. Returns its running or completed state, exit code, foreground processes, and recent pane output. Returns immediately unless waitMs requests a bounded wait of at most 30 minutes, and returns early when the command finishes. Check status before relying on command artifacts or reporting success.",
    promptSnippet: "Inspect or wait for the latest command in the managed terminal pane",
    promptGuidelines: [
      "Use command_status to inspect a previously started command when its result becomes relevant; omit waitMs for an immediate check.",
      "For a new or uncertain command, use command_status with a 1–2 minute wait and then a 5 minute wait instead of fixed bash sleeps. When expected progress remains absent, keep the command running and use at most 1–2 read-only diagnostics for its foreground processes, logs, dependencies, disk, or resource pressure.",
      "After command_status shows stable output, dependencies, and resource use, use 10–30 minute waits or wait for completion. Return to short waits when the command changes phase, progress stops, an error appears, or resource pressure changes.",
      "Never restart or terminate a command solely because command_status shows no new output; confirm completion with command_status before relying on artifacts or reporting success.",
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
        await launchQueue;
        return await commandStatus(params, signal);
      } finally {
        finishedAt.set(toolCallId, now());
      }
    },
  });
}
