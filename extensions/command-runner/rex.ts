import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CommandBackend } from "./backends.ts";
import {
  exitCodeFromTranscript,
  HERDR_COMMAND_OWNER_TOKEN,
  type ManagedPane,
  type PaneProcessInfo,
  type PaneRecord,
} from "./command-runner.ts";

type Registration = { paneId?: string; creationLabel?: string; tokens: Record<string, string> };
type Process = { pid: number; name: string };
const shells = new Set(["zsh", "bash", "sh"]);

export function parseRexProcess(value: {
  child?: Process;
  foreground?: Process;
  last_exit: unknown;
  ancestors?: Process[];
}): PaneProcessInfo {
  const foreground = value.foreground;
  if (!foreground || !Number.isInteger(foreground.pid))
    return { shellPid: -1, foregroundProcesses: [], idle: false };
  const idle =
    shells.has(foreground.name) &&
    (foreground.pid === value.child?.pid ||
      (value.child?.name === "login" &&
        value.ancestors?.length === 1 &&
        value.ancestors[0]?.pid === value.child.pid));
  return {
    shellPid: idle ? foreground.pid : (value.child?.pid ?? -1),
    foregroundProcesses: [{ pid: foreground.pid, name: foreground.name }],
    idle,
  };
}

export function createRexBackend(
  pi: ExtensionAPI,
  env: NodeJS.ProcessEnv,
  stateDirectory?: string,
): CommandBackend {
  const session = env.REX_SESSION!;
  const caller = env.REX_BLOCK!;
  // Capture the address at load time. Never silently connect to another server.
  const server = env.REX_SERVER;
  const call = async (args: string[], signal?: AbortSignal): Promise<any> => {
    if (!server) throw new Error("Rex did not provide REX_SERVER");
    const result = await pi.exec("rex", ["--server", server, "--autostart=false", ...args], {
      signal,
      timeout: 15_000,
    });
    if (result.code !== 0)
      throw new Error(
        `rex ${args.slice(0, 2).join(" ")} failed: ${(result.stderr || result.stdout).trim() || result.code}`,
      );
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error(`Rex returned invalid JSON for ${args[0]}`);
    }
  };
  const blockCall = (pane: ManagedPane, method: string, args: object = {}, signal?: AbortSignal) =>
    call(["block", "call", "-s", session, "-b", pane.paneId, method, JSON.stringify(args)], signal);
  let instance: string | undefined;
  let file: string | undefined;
  let registration: Registration = { tokens: {} };
  const initialize = async (signal?: AbortSignal) => {
    const status = await call(["api", "call", "server.status", "{}"], signal);
    if (typeof status.instance_id !== "string")
      throw new Error("Rex did not report its server instance");
    if (instance && instance !== status.instance_id)
      throw new Error("Rex server restarted; reload Pi before starting another command");
    if (instance) return;
    instance = status.instance_id;
    const key = createHash("sha256")
      .update(JSON.stringify([instance, session, caller]))
      .digest("hex");
    file = join(
      stateDirectory ??
        join(env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "toolkit", "command-runner"),
      `${key}.json`,
    );
  };
  const load = async () => {
    try {
      const value = JSON.parse(await readFile(file!, "utf8"));
      if (
        !value ||
        typeof value.tokens !== "object" ||
        value.tokens === null ||
        Array.isArray(value.tokens) ||
        !Object.values(value.tokens).every((v) => typeof v === "string") ||
        (value.paneId !== undefined &&
          (typeof value.paneId !== "string" || value.paneId === caller)) ||
        (value.creationLabel !== undefined && typeof value.creationLabel !== "string")
      )
        throw new Error("Invalid Rex command registration");
      registration = value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      registration = { tokens: {} };
    }
  };
  const save = async () => {
    await mkdir(dirname(file!), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(registration), { mode: 0o600, flag: "wx" });
    await rename(temporary, file!);
  };
  const backend: CommandBackend = {
    name: "Rex",
    adoptUntaggedPane: false,
    callerPaneId: caller,
    callerWorkspaceId: session,
    list: async (signal) => {
      await initialize(signal);
      await load();
      const view = await call(["session", "inspect", session, "--json"], signal);
      if (view.session_id !== session || !Array.isArray(view.windows))
        throw new Error("Rex session view was incomplete");
      const panes: PaneRecord[] = [];
      for (const window of view.windows)
        for (const layer of window.layers ?? [])
          for (const block of layer.blocks ?? []) {
            if (block.creator_name !== "com.superlogical.terminal") continue;
            if (registration.creationLabel && block.label === registration.creationLabel) {
              registration.paneId = block.block_id;
              delete registration.creationLabel;
              await save();
            }
            panes.push({
              pane_id: block.block_id,
              terminal_id: `${instance}/${block.block_id}`,
              workspace_id: session,
              tab_id: window.window_id,
              tokens: block.block_id === registration.paneId ? registration.tokens : {},
            });
          }
      if (registration.creationLabel) {
        throw new Error(
          `A Rex split response is unresolved. Inspect the session and registry ${file} before retrying; no duplicate pane was created.`,
        );
      }
      return panes;
    },
    tag: async (pane, tokens) => {
      if (!file) throw new Error("Rex command registry is not initialized");
      registration = { paneId: pane.paneId, tokens: { ...registration.tokens, ...tokens } };
      await save();
    },
    create: async (cwd, owner, signal) => {
      // Persist a unique creation label before calling Rex. A lost response can
      // be recovered by listing, without creating a duplicate pane.
      registration = {
        creationLabel: `pi-command-${randomUUID()}`,
        tokens: { [HERDR_COMMAND_OWNER_TOKEN]: owner },
      };
      await save();
      const result = await call(
        [
          "split",
          "-s",
          session,
          "-b",
          caller,
          "--split=below",
          "--ratio",
          "10",
          "-c",
          cwd,
          "--label",
          registration.creationLabel!,
          "--focus=false",
          "--json",
        ],
        signal,
      );
      const paneId = result.block_ids?.[0];
      if (typeof paneId !== "string" || paneId === caller)
        throw new Error("Rex split did not return a new block ID");
      registration.paneId = paneId;
      delete registration.creationLabel;
      await save();
      const pane = (await backend.list(signal)).find((p) => p.pane_id === paneId);
      if (!pane || typeof pane.tab_id !== "string")
        throw new Error("Rex command block is no longer present");
      const managed = {
        paneId,
        terminalId: `${instance}/${paneId}`,
        workspaceId: session,
        tabId: pane.tab_id,
      };
      // A split response does not mean its login shell is ready for input.
      const deadline = Date.now() + 10_000;
      while (!(await backend.process(managed, signal)).idle) {
        if (Date.now() >= deadline)
          throw new Error("Rex command shell is not ready; pane retained for inspection");
        await delay(100, undefined, { signal });
      }
      return managed;
    },
    rename: async (pane, label, signal) => {
      await call(
        [
          "api",
          "call",
          "-s",
          session,
          "session.set_block_label",
          JSON.stringify({ block_id: pane.paneId, label }),
        ],
        signal,
      );
    },
    read: async (pane, signal) => {
      const result = await blockCall(
        pane,
        "format",
        { format: "text", trim: true, unwrap: true },
        signal,
      );
      if (typeof result.content !== "string")
        throw new Error("Rex terminal format response was incomplete");
      return result.content;
    },
    process: async (pane, signal) => parseRexProcess(await blockCall(pane, "process", {}, signal)),
    submit: async (pane, command, signal) => {
      await blockCall(pane, "write", { data: `${command}\r` }, signal);
    },
    wait: async (pane, markers, waitMs, signal) => {
      // Rex wait tracks the terminal's shell, not individual shell commands.
      // Poll marker completion internally with bounded, cancellable requests.
      const deadline = Date.now() + waitMs;
      do {
        if (exitCodeFromTranscript(await backend.read(pane, signal), markers) !== undefined) return;
        await delay(Math.min(1000, Math.max(0, deadline - Date.now())), undefined, { signal });
      } while (Date.now() < deadline);
    },
  };
  return backend;
}
