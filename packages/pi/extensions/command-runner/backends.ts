import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  ManagedPane,
  ManagedRun,
  PaneRecord,
  PaneProcessInfo,
  RunMarkers,
} from "./command-runner.ts";
import {
  parsePaneList,
  parsePaneRead,
  parsePaneProcessInfo,
  parseSplitPane,
  isWaitTimeout,
  HERDR_COMMAND_METADATA_SOURCE,
  HERDR_COMMAND_RUN_TOKEN,
  HERDR_COMMAND_STARTED_AT_TOKEN,
} from "./command-runner.ts";
import { createRexBackend } from "./rex.ts";

export interface CommandBackend {
  name: "Herdr" | "Rex";
  // Only Herdr can migrate untagged panes from legacy Pi session entries.
  // Rex ownership must come from its caller-scoped registry, not saved entries.
  adoptUntaggedPane: boolean;
  callerPaneId: string;
  callerWorkspaceId: string;
  list(signal?: AbortSignal): Promise<PaneRecord[]>;
  tag(pane: ManagedPane, tokens: Record<string, string>, signal?: AbortSignal): Promise<void>;
  create(cwd: string, owner: string, signal?: AbortSignal): Promise<ManagedPane>;
  prepare?(pane: ManagedPane, signal?: AbortSignal): Promise<void>;
  shutdown?(reason?: "quit" | "new"): Promise<void>;
  rename(pane: ManagedPane, label: string, signal?: AbortSignal): Promise<void>;
  read(pane: ManagedPane, signal?: AbortSignal): Promise<string>;
  process(pane: ManagedPane, signal?: AbortSignal): Promise<PaneProcessInfo>;
  submit(pane: ManagedPane, command: string, signal?: AbortSignal): Promise<void>;
  wait(pane: ManagedPane, markers: RunMarkers, waitMs: number, signal?: AbortSignal): Promise<void>;
}

function selectBackend(env: NodeJS.ProcessEnv): "herdr" | "rex" | undefined {
  // Rex identifiers also survive in shells nested inside Herdr. Prefer the
  // explicit Herdr environment when both are inherited.
  if (env.HERDR_ENV === "1") return "herdr";
  if (env.REX_SESSION && env.REX_BLOCK) return "rex";
  return undefined;
}

export function createBackend(
  pi: ExtensionAPI,
  env: NodeJS.ProcessEnv,
  stateDirectory?: string,
): CommandBackend | undefined {
  const selected = selectBackend(env);
  if (selected === "rex") return createRexBackend(pi, env, stateDirectory);
  if (!selected) return undefined;
  const callerPaneId = env.HERDR_PANE_ID ?? "";
  const callerWorkspaceId = env.HERDR_WORKSPACE_ID ?? "";
  const call = async (args: string[], signal?: AbortSignal, timeout = 15_000) => {
    const result = await pi.exec("herdr", args, { signal, timeout });
    if (result.code !== 0)
      throw new Error(
        `herdr ${args.slice(0, 2).join(" ")} failed: ${(result.stderr || result.stdout).trim() || result.code}`,
      );
    return result.stdout;
  };
  const backend: CommandBackend = {
    name: "Herdr",
    adoptUntaggedPane: true,
    callerPaneId,
    callerWorkspaceId,
    list: async (signal) => parsePaneList(await call(["pane", "list"], signal)),
    tag: async (pane, tokens, signal) => {
      await call(
        [
          "pane",
          "report-metadata",
          pane.paneId,
          "--source",
          HERDR_COMMAND_METADATA_SOURCE,
          ...Object.entries(tokens).flatMap(([key, value]) => ["--token", `${key}=${value}`]),
        ],
        signal,
      );
    },
    create: async (cwd, _owner, signal) => {
      const pane = parseSplitPane(
        await call(
          [
            "pane",
            "split",
            "--pane",
            callerPaneId,
            "--direction",
            "down",
            "--ratio",
            "0.9",
            "--cwd",
            cwd,
            "--no-focus",
          ],
          signal,
        ),
      );
      return pane;
    },
    rename: async (pane, label, signal) => {
      await call(["pane", "rename", pane.paneId, label], signal);
    },
    read: async (pane, signal) =>
      parsePaneRead(
        await call(
          [
            "pane",
            "read",
            pane.paneId,
            "--source",
            "recent-unwrapped",
            "--lines",
            "2000",
            "--format",
            "text",
          ],
          signal,
        ),
      ),
    process: async (pane, signal) =>
      parsePaneProcessInfo(await call(["pane", "process-info", "--pane", pane.paneId], signal)),
    submit: async (pane, command, signal) => {
      await call(["pane", "run", pane.paneId, command], signal);
    },
    wait: async (pane, markers, waitMs, signal) => {
      const result = await pi.exec(
        "herdr",
        [
          "pane",
          "wait-output",
          pane.paneId,
          "--regex",
          markers.endRegex,
          "--source",
          "recent-unwrapped",
          "--lines",
          "2000",
          "--timeout",
          String(waitMs),
        ],
        { signal, timeout: waitMs + 5_000 },
      );
      if (signal?.aborted)
        throw new Error(`Status wait cancelled; the command remains visible in ${pane.paneId}`);
      if (result.code !== 0 && !isWaitTimeout(result.stdout, result.stderr))
        throw new Error(`waiting for Herdr command failed: ${result.stderr || result.stdout}`);
    },
  };
  return backend;
}

export function runTokens(run: ManagedRun): Record<string, string> {
  return {
    [HERDR_COMMAND_RUN_TOKEN]: run.runId,
    [HERDR_COMMAND_STARTED_AT_TOKEN]: String(run.startedAt),
  };
}
