import { resolve } from "node:path";

export const HERDR_COMMAND_TOOL_NAME = "herdr_run_command";
export const HERDR_COMMAND_PANE_ENTRY = "herdr-command-pane";
export const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_HEARTBEAT_MS = 10_000;

export interface ManagedPane {
  paneId: string;
  terminalId: string;
  workspaceId: string;
  tabId: string;
}

export interface PaneRecord {
  pane_id?: unknown;
  terminal_id?: unknown;
  workspace_id?: unknown;
  tab_id?: unknown;
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
  const normalized = label?.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return (normalized || "pi command").slice(0, 80);
}

export function resolveCommandCwd(sessionCwd: string, requestedCwd: string | undefined): string {
  return resolve(sessionCwd, requestedCwd?.trim() || ".");
}

export function buildRunMarkers(runId: string): RunMarkers {
  if (!/^[a-f0-9-]+$/i.test(runId)) throw new Error("run ID must contain only hexadecimal characters and hyphens");
  const prefix = `__PI_HERDR_${runId.replace(/-/g, "_").toUpperCase()}`;
  return {
    start: `${prefix}_START__`,
    endPrefix: `${prefix}_EXIT__=`,
    endRegex: `^${prefix}_EXIT__=[0-9]+$`,
  };
}

export function buildPaneCommand(command: string, cwd: string, markers: RunMarkers): string {
  return [
    "{",
    `  printf '%s\\n' ${shellQuote(markers.start)}`,
    "  (",
    `    cd ${shellQuote(cwd)} || exit 125`,
    command,
    "  )",
    "  __pi_herdr_exit=$?",
    `  printf '\\n%s%d\\n' ${shellQuote(markers.endPrefix)} "$__pi_herdr_exit"`,
    "  unset __pi_herdr_exit",
    "}",
  ].join("\n");
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
  if (!Array.isArray(value.result?.panes)) throw new Error("Herdr pane list response did not contain panes");
  return value.result.panes as PaneRecord[];
}

export function paneRecordToManagedPane(record: PaneRecord): ManagedPane | undefined {
  if (
    typeof record.pane_id !== "string" ||
    typeof record.terminal_id !== "string" ||
    typeof record.workspace_id !== "string" ||
    typeof record.tab_id !== "string"
  ) return undefined;
  return {
    paneId: record.pane_id,
    terminalId: record.terminal_id,
    workspaceId: record.workspace_id,
    tabId: record.tab_id,
  };
}

export function parseSplitPane(stdout: string): ManagedPane {
  const value = parseJson(stdout, "pane split") as { result?: { pane?: PaneRecord } };
  const pane = value.result?.pane && paneRecordToManagedPane(value.result.pane);
  if (!pane) throw new Error("Herdr pane split response did not contain stable pane identifiers");
  return pane;
}

export function parsePaneIdle(stdout: string): boolean {
  const value = parseJson(stdout, "pane process-info") as {
    result?: {
      process_info?: {
        shell_pid?: unknown;
        foreground_processes?: Array<{ pid?: unknown }>;
      };
    };
  };
  const info = value.result?.process_info;
  if (typeof info?.shell_pid !== "number" || !Array.isArray(info.foreground_processes)) {
    throw new Error("Herdr pane process-info response was incomplete");
  }
  return info.foreground_processes.every(process => process.pid === info.shell_pid);
}

export function parseMatchedLine(stdout: string): string {
  const value = parseJson(stdout, "wait output") as { result?: { matched_line?: unknown } };
  const line = value.result?.matched_line;
  if (typeof line !== "string") throw new Error("Herdr wait response did not contain a matched line");
  return line;
}

export function exitCodeFromMatchedLine(line: string, markers: RunMarkers): number {
  if (!line.startsWith(markers.endPrefix)) throw new Error("Herdr matched an unexpected completion line");
  const raw = line.slice(markers.endPrefix.length);
  if (!/^[0-9]+$/.test(raw)) throw new Error("Herdr completion marker did not contain an exit code");
  return Number.parseInt(raw, 10);
}

export function isWaitTimeout(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return combined.includes('"code":"timeout"') || /timed out waiting for output match/i.test(combined);
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
    output: lines.slice(start + 1, end >= 0 ? end : lines.length).join("\n").trimEnd(),
    exitCode,
    started: true,
    completed: end >= 0,
  };
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
