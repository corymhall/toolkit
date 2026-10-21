import { resolve } from "node:path";

export const START_COMMAND_TOOL_NAME = "start_command";
export const COMMAND_STATUS_TOOL_NAME = "command_status";
// Keep the original identifiers and marker protocol so existing Herdr panes
// and persisted Pi sessions remain recoverable after the tool rename.
export const HERDR_COMMAND_PANE_ENTRY = "herdr-command-pane";
export const HERDR_COMMAND_RUN_ENTRY = "herdr-command-run";
export const HERDR_COMMAND_METADATA_SOURCE = "pi:herdr-command";
export const HERDR_COMMAND_OWNER_TOKEN = "pi_command_owner";
export const HERDR_COMMAND_RUN_TOKEN = "pi_command_run";
export const HERDR_COMMAND_STARTED_AT_TOKEN = "pi_command_started_at";

export interface ManagedPane {
  paneId: string;
  terminalId: string;
  workspaceId: string;
  tabId: string;
}

export interface ManagedRun {
  runId: string;
  terminalId: string;
  // Command details stay in the Pi session. Pane metadata is visible to Herdr
  // clients, so an adopted run can recover its marker protocol without exposing
  // command text or its working directory.
  command?: string;
  cwd?: string;
  startedAt: number;
}

export interface ForegroundProcess {
  pid: number;
  name?: string;
  cmdline?: string;
}

export interface PaneProcessInfo {
  shellPid: number;
  foregroundProcesses: ForegroundProcess[];
  idle: boolean;
}

export interface PaneRecord {
  pane_id?: unknown;
  terminal_id?: unknown;
  workspace_id?: unknown;
  tab_id?: unknown;
  tokens?: unknown;
}

export interface RunMarkers {
  start: string;
  endPrefix: string;
  endRegex: string;
}

export interface Transcript {
  output: string;
  exitCode?: number;
  started: boolean;
  completed: boolean;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function normalizeLabel(label: string | undefined): string {
  const normalized = label
    ?.replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "pi command").slice(0, 80);
}

export function resolveCommandCwd(sessionCwd: string, requestedCwd: string | undefined): string {
  return resolve(sessionCwd, requestedCwd?.trim() || ".");
}

export function buildRunMarkers(runId: string): RunMarkers {
  if (!/^[a-f0-9-]+$/i.test(runId))
    throw new Error("run ID must contain only hexadecimal characters and hyphens");
  const prefix = `__PI_HERDR_${runId.replace(/-/g, "_").toUpperCase()}`;
  return {
    start: `${prefix}_START__`,
    endPrefix: `${prefix}_EXIT__=`,
    endRegex: `^${prefix}_EXIT__=[0-9]+$`,
  };
}

export function validateCommandText(command: string): void {
  if (!command.trim()) throw new Error("command must not be empty");
  if (/[\r\n\t]/.test(command)) {
    throw new Error(
      "start_command accepts one physical command line; use shell separators or a script file instead of tabs or newlines",
    );
  }
}

export function buildPaneCommand(command: string, cwd: string, markers: RunMarkers): string {
  validateCommandText(command);
  const terminator = /[;&]\s*$/.test(command) ? "" : ";";
  return [
    `printf '%s\\n' ${shellQuote(markers.start)}`,
    `( builtin cd ${shellQuote(cwd)} || exit 125; ${command}${terminator} )`,
    "__pi_herdr_exit=$?",
    `printf '\\n%s%d\\n' ${shellQuote(markers.endPrefix)} "$__pi_herdr_exit"`,
    "unset __pi_herdr_exit",
  ].join("; ");
}

function parseJson(stdout: string, operation: string): any {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Herdr returned invalid JSON for ${operation}`);
  }
}

export function parsePaneList(stdout: string): PaneRecord[] {
  const value = parseJson(stdout, "pane list") as { result?: { panes?: unknown } };
  if (!Array.isArray(value.result?.panes))
    throw new Error("Herdr pane list response did not contain panes");
  return value.result.panes as PaneRecord[];
}

export function paneRecordToManagedPane(record: PaneRecord): ManagedPane | undefined {
  if (
    typeof record.pane_id !== "string" ||
    typeof record.terminal_id !== "string" ||
    typeof record.workspace_id !== "string" ||
    typeof record.tab_id !== "string"
  )
    return undefined;
  return {
    paneId: record.pane_id,
    terminalId: record.terminal_id,
    workspaceId: record.workspace_id,
    tabId: record.tab_id,
  };
}

function paneRecordToken(record: PaneRecord, name: string): string | undefined {
  if (!record.tokens || typeof record.tokens !== "object" || Array.isArray(record.tokens))
    return undefined;
  const token = (record.tokens as Record<string, unknown>)[name];
  return typeof token === "string" && token ? token : undefined;
}

export function paneRecordOwnerTerminalId(record: PaneRecord): string | undefined {
  return paneRecordToken(record, HERDR_COMMAND_OWNER_TOKEN);
}

export function paneRecordToManagedRun(record: PaneRecord): ManagedRun | undefined {
  if (typeof record.terminal_id !== "string") return undefined;
  const runId = paneRecordToken(record, HERDR_COMMAND_RUN_TOKEN);
  const startedAt = paneRecordToken(record, HERDR_COMMAND_STARTED_AT_TOKEN);
  if (!runId || !/^[a-f0-9-]+$/i.test(runId) || !startedAt) return undefined;

  const startedAtNumber = Number(startedAt);
  if (!Number.isFinite(startedAtNumber) || startedAtNumber < 0) return undefined;
  return { runId, terminalId: record.terminal_id, startedAt: startedAtNumber };
}

export function parseSplitPane(stdout: string): ManagedPane {
  const value = parseJson(stdout, "pane split") as { result?: { pane?: PaneRecord } };
  const pane = value.result?.pane && paneRecordToManagedPane(value.result.pane);
  if (!pane) throw new Error("Herdr pane split response did not contain stable pane identifiers");
  return pane;
}

export function parsePaneProcessInfo(stdout: string): PaneProcessInfo {
  const value = parseJson(stdout, "pane process-info") as {
    result?: {
      process_info?: {
        shell_pid?: unknown;
        foreground_processes?: Array<{ pid?: unknown; name?: unknown; cmdline?: unknown }>;
      };
    };
  };
  const info = value.result?.process_info;
  if (typeof info?.shell_pid !== "number" || !Array.isArray(info.foreground_processes)) {
    throw new Error("Herdr pane process-info response was incomplete");
  }
  const foregroundProcesses = info.foreground_processes.map((process) => {
    if (typeof process.pid !== "number")
      throw new Error("Herdr pane process-info contained an invalid process");
    return {
      pid: process.pid,
      ...(typeof process.name === "string" ? { name: process.name } : {}),
      ...(typeof process.cmdline === "string" ? { cmdline: process.cmdline } : {}),
    };
  });
  return {
    shellPid: info.shell_pid,
    foregroundProcesses,
    idle: foregroundProcesses.every((process) => process.pid === info.shell_pid),
  };
}

export function isWaitTimeout(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return (
    combined.includes('"code":"timeout"') || /timed out waiting for output match/i.test(combined)
  );
}

export function parsePaneRead(stdout: string): string {
  // Unlike Herdr's state-changing pane commands, `pane read` prints terminal
  // text directly. Do not interpret a command whose first output byte is `{`
  // as a Herdr response envelope.
  return stdout;
}

export function extractTranscript(text: string, markers: RunMarkers): Transcript {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  for (let index = lines.length - 1; index >= 0; index--) {
    if (lines[index] === markers.start) {
      start = index;
      break;
    }
  }
  if (start < 0) return { output: "", started: false, completed: false };

  let end = -1;
  let exitCode: number | undefined;
  for (let index = start + 1; index < lines.length; index++) {
    if (!lines[index].startsWith(markers.endPrefix)) continue;
    const raw = lines[index].slice(markers.endPrefix.length);
    if (!/^[0-9]+$/.test(raw)) continue;
    end = index;
    exitCode = Number.parseInt(raw, 10);
    break;
  }

  return {
    output: lines
      .slice(start + 1, end >= 0 ? end : lines.length)
      .join("\n")
      .trimEnd(),
    exitCode,
    started: true,
    completed: end >= 0,
  };
}

export function exitCodeFromTranscript(text: string, markers: RunMarkers): number | undefined {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    if (!lines[index].startsWith(markers.endPrefix)) continue;
    const raw = lines[index].slice(markers.endPrefix.length);
    if (/^[0-9]+$/.test(raw)) return Number.parseInt(raw, 10);
  }
  return undefined;
}

export function isManagedPane(value: unknown): value is ManagedPane {
  const pane = value as Partial<ManagedPane> | undefined;
  return Boolean(
    pane &&
    typeof pane.paneId === "string" &&
    typeof pane.terminalId === "string" &&
    typeof pane.workspaceId === "string" &&
    typeof pane.tabId === "string",
  );
}

export function isManagedRun(value: unknown): value is ManagedRun {
  const run = value as Partial<ManagedRun> | undefined;
  return Boolean(
    run &&
    typeof run.runId === "string" &&
    /^[a-f0-9-]+$/i.test(run.runId) &&
    typeof run.terminalId === "string" &&
    (run.command === undefined || typeof run.command === "string") &&
    (run.cwd === undefined || typeof run.cwd === "string") &&
    typeof run.startedAt === "number" &&
    Number.isFinite(run.startedAt),
  );
}
