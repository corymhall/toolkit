import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CommandBackend } from "./backends.ts";
import {
  buildRunMarkers,
  paneRecordToManagedPane,
  exitCodeFromTranscript,
  HERDR_COMMAND_OWNER_TOKEN,
  HERDR_COMMAND_RUN_TOKEN,
  type ManagedPane,
  type PaneProcessInfo,
  type PaneRecord,
} from "./command-runner.ts";

type Registration = { paneId?: string; creationLabel?: string; tokens: Record<string, string> };
type Process = { pid: number; name: string };
const shells = new Set(["zsh", "bash", "sh"]);
const floatingBounds = [0.1, 0.15, 0.8, 0.7];

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

// Atuin's PTY proxy puts the real shell on a second controlling terminal.
// Rex can report the outer login process instead of that terminal's foreground.
export function parseAtuinProxyProcess(
  loginPid: number,
  snapshot: string,
): PaneProcessInfo | undefined {
  const rows = snapshot.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(.+)$/);
    return match
      ? [
          {
            pid: Number(match[1]),
            parent: Number(match[2]),
            group: Number(match[3]),
            foreground: Number(match[4]),
            name: match[5]!.split("/").at(-1)!,
          },
        ]
      : [];
  });
  const login = rows.find((row) => row.pid === loginPid && row.name === "login");
  if (!login) return;
  const children = (pid: number) => rows.filter((row) => row.parent === pid);
  const proxies = children(loginPid);
  if (proxies.length !== 1 || proxies[0]!.name !== "atuin") return;
  const shellsUnderProxy = children(proxies[0]!.pid);
  if (shellsUnderProxy.length !== 1) return;
  const shell = shellsUnderProxy[0]!;
  if (!shells.has(shell.name) || shell.group !== shell.pid || shell.foreground <= 0) return;
  // Process groups are host-wide. Include reparented processes too, since
  // they may still share the shell's terminal and receive its input.
  const foreground = rows.filter((row) => row.group === shell.foreground);
  // Unknown foreground groups stay busy. Nested shells and commands sharing
  // the shell's group also prevent input, even if a stale prompt is visible.
  return {
    shellPid: shell.pid,
    foregroundProcesses: foreground.map(({ pid, name }) => ({ pid, name })),
    idle: foreground.length === 1 && foreground[0]!.pid === shell.pid,
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
  let hostId: string | undefined;
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
    hostId = status.host_id;
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
  const inspect = async (signal?: AbortSignal) => {
    const view = await call(["session", "inspect", session, "--json"], signal);
    if (view.session_id !== session || !Array.isArray(view.windows))
      throw new Error("Rex session view was incomplete");
    return view;
  };
  const minimize = (layerId: string, signal?: AbortSignal) =>
    call(
      [
        "api",
        "call",
        "-s",
        session,
        "session.set_layer_state",
        JSON.stringify({ layer_id: layerId, state: "minimized" }),
      ],
      signal,
    );
  const backend: CommandBackend = {
    name: "Rex",
    adoptUntaggedPane: false,
    callerPaneId: caller,
    callerWorkspaceId: session,
    list: async (signal) => {
      await initialize(signal);
      await load();
      const view = await inspect(signal);
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
          `A Rex pane creation response is unresolved. Inspect the session and registry ${file} before retrying; no duplicate pane was created.`,
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
      const view = await inspect(signal);
      const window = view.windows.find((window: any) =>
        window.layers?.some((layer: any) =>
          layer.blocks?.some((block: any) => block.block_id === caller),
        ),
      );
      if (!window) throw new Error("The calling Rex terminal is no longer present");
      // Persist a unique creation label before calling Rex. A lost response can
      // be recovered by listing, without creating a duplicate pane.
      registration = {
        creationLabel: `pi-command-${randomUUID()}`,
        tokens: { [HERDR_COMMAND_OWNER_TOKEN]: owner },
      };
      await save();
      const result = await call(
        [
          "api",
          "call",
          "-s",
          session,
          "session.new_layer",
          JSON.stringify({
            window_id: window.window_id,
            bounds: floatingBounds,
            focus: false,
            layout: {
              block: {
                flavor: "com.superlogical.terminal.shell",
                label: registration.creationLabel,
                options: { cwd },
              },
            },
          }),
        ],
        signal,
      );
      const paneId = result.block_ids?.[0];
      if (typeof paneId !== "string" || paneId === caller)
        throw new Error("Rex floating layer did not return a new block ID");
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
      await backend.prepare!(managed, signal);
      // A creation response does not mean its login shell is ready for input.
      const deadline = Date.now() + 10_000;
      while (!(await backend.process(managed, signal)).idle) {
        if (Date.now() >= deadline)
          throw new Error("Rex command shell is not ready; pane retained for inspection");
        await delay(100, undefined, { signal });
      }
      return managed;
    },
    prepare: async (pane, signal) => {
      const view = await inspect(signal);
      const layer = view.windows
        .flatMap((window: any) => window.layers ?? [])
        .find((layer: any) => layer.blocks?.some((block: any) => block.block_id === pane.paneId));
      if (!layer) throw new Error("Rex command block is no longer present");
      if (layer.kind === "tiled") {
        delete registration.tokens["pi-command-floating"];
        await save();
        const result = await call(
          [
            "api",
            "call",
            "-s",
            session,
            "session.float_block",
            JSON.stringify({ block_id: pane.paneId, bounds: floatingBounds }),
          ],
          signal,
        );
        if (typeof result.layer_id !== "string")
          throw new Error("Rex did not return the floated layer ID");
        await minimize(result.layer_id, signal);
      } else if (
        layer.kind === "floating" &&
        layer.state !== "minimized" &&
        registration.tokens["pi-command-floating"] !== pane.paneId
      ) {
        // Finish creation or migration after a lost response. Never minimize a
        // layer shared with unrelated panes, or re-hide one the user restored.
        if (layer.blocks.length !== 1) throw new Error("Rex command layer contains other panes");
        await minimize(layer.layer_id, signal);
      } else if (layer.kind !== "floating") {
        throw new Error("Rex command layer has an unknown kind");
      }
      registration.tokens["pi-command-floating"] = pane.paneId;
      await save();
    },
    shutdown: async (reason) => {
      const panes = await backend.list();
      const paneId = registration.paneId;
      const record = panes.find((pane) => pane.pane_id === paneId);
      if (!record || registration.tokens[HERDR_COMMAND_OWNER_TOKEN] !== `${instance}/${caller}`)
        return;
      const pane = paneRecordToManagedPane(record);
      if (!pane) return;
      if (reason === "new") {
        const view = await inspect();
        const layer = view.windows
          .flatMap((window: any) => window.layers ?? [])
          .find((layer: any) => layer.blocks?.some((block: any) => block.block_id === paneId));
        if (layer?.kind !== "floating" || layer.blocks.length !== 1) {
          // A promoted pane belongs to the user now. Do not re-adopt and float
          // it when the replacement conversation starts.
          registration = { tokens: {} };
          await save();
          throw new Error(`${paneId} is no longer an exclusive managed floating pane`);
        }
      }
      const runId = registration.tokens[HERDR_COMMAND_RUN_TOKEN];
      // A queued or uncertain submission can still look like an idle shell.
      // Require its completion marker as well as a current idle process check.
      if (
        runId &&
        exitCodeFromTranscript(await backend.read(pane), buildRunMarkers(runId)) === undefined
      ) {
        if (reason === "new") throw new Error(`${paneId} has an unfinished or uncertain command`);
        return;
      }
      if (!(await backend.process(pane)).idle) {
        if (reason === "new") throw new Error(`${paneId} is busy`);
        return;
      }
      await call([
        "api",
        "call",
        "-s",
        session,
        "block.close",
        JSON.stringify({ block_id: paneId }),
      ]);
      registration = { tokens: {} };
      await save();
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
    process: async (pane, signal) => {
      const value = await blockCall(pane, "process", {}, signal);
      const info = parseRexProcess(value);
      if (
        info.idle ||
        value.child?.name !== "login" ||
        value.foreground?.pid !== value.child.pid ||
        process.platform !== "darwin" ||
        !server?.startsWith("unix://")
      )
        return info;
      const view = await inspect(signal);
      const block = view.windows
        .flatMap((window: any) => window.layers ?? [])
        .flatMap((layer: any) => layer.blocks ?? [])
        .find((block: any) => block.block_id === pane.paneId);
      // Never interpret a remote terminal's PIDs against this machine's table.
      if (!hostId || block?.host_id !== hostId) return info;
      const snapshot = await pi.exec("/bin/ps", ["-axo", "pid=,ppid=,pgid=,tpgid=,comm="], {
        signal,
        timeout: 5_000,
      });
      if (snapshot.code !== 0) return info;
      // Recheck Rex's identity after the snapshot before accepting its PIDs.
      const current = await blockCall(pane, "process", {}, signal);
      if (
        current.child?.pid !== value.child.pid ||
        current.child?.name !== "login" ||
        current.foreground?.pid !== value.child.pid
      )
        return parseRexProcess(current);
      return parseAtuinProxyProcess(value.child.pid, snapshot.stdout) ?? info;
    },
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
