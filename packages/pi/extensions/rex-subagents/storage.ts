import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export const CHILD_ENV = "TOOLKIT_REX_SUBAGENT";
export const RESULT_TYPE = "toolkit-rex-subagent-result";
export const NAME = /^[a-z][a-z0-9-]{0,31}$/;

export interface Assignment {
  id: string;
  text: string;
}

/** Immutable launch configuration. The parent and child write separate state files. */
export interface ChildConfig {
  version: 1;
  id: string;
  name: string;
  parent: string;
  session: string;
  server: string;
  serverInstance: string;
  rexSession: string;
  socketDirectory: string;
  cwd: string;
  model?: string;
  effort?: ModelThinkingLevel;
  initial: Assignment;
  request: string;
}

export interface Launch {
  label: string;
  block?: string;
  state: "creating" | "launched" | "uncertain";
}

export interface ChildStatus {
  child: string;
  session: string;
  pid: number;
  block: string;
  file?: string;
  state: "idle" | "working" | "blocked" | "uncertain" | "session-changed";
  task?: string;
}

export interface Report {
  child: string;
  name: string;
  parent: string;
  session: string;
  task: string;
  outcome: "answer" | "aborted" | "error";
  answer: string;
  truncated: boolean;
  finishedAt: number;
  file?: string;
  error?: string;
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function key(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Refuse unsafe roots instead of repairing permissions or following symlinks. */
export async function privateDirectory(path: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error("Subagent paths must be absolute");
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    (info.mode & 0o077) !== 0 ||
    (process.getuid && info.uid !== process.getuid())
  ) {
    throw new Error(`Subagent directory must be private and owned by this user: ${path}`);
  }
}

export async function readJSON(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function optionalJSON(path: string): Promise<unknown> {
  try {
    return await readJSON(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function saveJSON(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

export function parseConfig(value: unknown): ChildConfig {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    typeof value.name !== "string" ||
    !NAME.test(value.name) ||
    ![value.parent, value.session, value.serverInstance, value.rexSession].every(
      (v) => typeof v === "string" && v.length > 0,
    ) ||
    typeof value.server !== "string" ||
    !value.server.startsWith("unix://") ||
    typeof value.socketDirectory !== "string" ||
    !isAbsolute(value.socketDirectory) ||
    typeof value.cwd !== "string" ||
    !isAbsolute(value.cwd) ||
    (value.model !== undefined && typeof value.model !== "string") ||
    (value.effort !== undefined &&
      !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(
        String(value.effort),
      )) ||
    typeof value.request !== "string" ||
    !record(value.initial) ||
    typeof value.initial.id !== "string" ||
    typeof value.initial.text !== "string"
  ) {
    throw new Error("Invalid Rex subagent configuration");
  }
  return value as unknown as ChildConfig;
}

export function parseReport(value: unknown, config: ChildConfig): Report {
  if (
    !record(value) ||
    value.child !== config.id ||
    value.parent !== config.parent ||
    value.session !== config.session ||
    value.name !== config.name ||
    typeof value.task !== "string" ||
    typeof value.answer !== "string" ||
    typeof value.truncated !== "boolean" ||
    typeof value.finishedAt !== "number" ||
    !["answer", "aborted", "error"].includes(String(value.outcome))
  ) {
    throw new Error(`Invalid result for subagent ${config.name}`);
  }
  return value as unknown as Report;
}

export async function configurations(
  root: string,
): Promise<Array<{ file: string; config: ChildConfig }>> {
  const result: Array<{ file: string; config: ChildConfig }> = [];
  for (const name of await readdir(root)) {
    if (!NAME.test(name)) continue;
    const file = join(root, name, "config.json");
    const value = await optionalJSON(file);
    if (value !== undefined) result.push({ file, config: parseConfig(value) });
  }
  return result;
}

export async function reports(file: string, config: ChildConfig): Promise<Report[]> {
  const folder = join(dirname(file), "results");
  const result: Report[] = [];
  for (const name of await readdir(folder)) {
    if (name.endsWith(".json"))
      result.push(parseReport(await readJSON(join(folder, name)), config));
  }
  return result;
}

export function validateText(text: string): void {
  if (
    !text.trim() ||
    Buffer.byteLength(text) > 32_768 ||
    // oxlint-disable-next-line no-control-regex -- Accept human text, not terminal controls.
    /[\x00-\x08\x0b-\x1f\x7f]/.test(text)
  ) {
    throw new Error("Task must contain text, without terminal controls, and be at most 32 KiB");
  }
}

export function boundedText(text: string): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text);
  return { text: bytes.subarray(0, 48_000).toString("utf8"), truncated: bytes.length > 48_000 };
}
