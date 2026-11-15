import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import commandRunner from "../index.ts";

const execute = promisify(execFile);

// Opt-in only. Creates one temporary non-focused pane in the invoking Rex
// session and closes only that pane after checking its live identity.
test(
  "runs, reuses, and recovers a command pane on a live Rex server",
  {
    skip: process.env.REX_RUNNER_INTEGRATION !== "1",
  },
  async () => {
    assert.ok(process.env.REX_SESSION && process.env.REX_BLOCK && process.env.REX_SERVER);
    assert.notEqual(process.env.HERDR_ENV, "1");
    const directory = await mkdtemp(join(tmpdir(), "rex-runner-integration-"));
    const load = () => {
      const tools = new Map<string, any>();
      const handlers = new Map<string, any>();
      const pi = {
        exec: async (command: string, args: string[], options: any) => {
          try {
            const result = await execute(command, args, { ...options, maxBuffer: 8 * 1024 * 1024 });
            return { code: 0, ...result, killed: false };
          } catch (error: any) {
            if (options?.signal?.aborted) throw error;
            return {
              code: Number.isInteger(error.code) ? error.code : 1,
              stdout: error.stdout ?? "",
              stderr: error.stderr ?? error.message,
              killed: error.killed ?? false,
            };
          }
        },
        registerMessageRenderer() {},
        registerTool: (tool: any) => tools.set(tool.name, tool),
        on: (name: string, handler: any) => handlers.set(name, handler),
        appendEntry() {},
      } as unknown as ExtensionAPI;
      commandRunner(pi, { stateDirectory: directory });
      return { tools, handlers };
    };
    const view = async () =>
      JSON.parse(
        (
          await execute("rex", [
            "--server",
            process.env.REX_SERVER!,
            "--autostart=false",
            "session",
            "inspect",
            process.env.REX_SESSION!,
            "--json",
          ])
        ).stdout,
      );
    try {
      const before = await view();
      const callerWindow = before.windows.find((window: any) =>
        window.layers.some((layer: any) =>
          layer.blocks.some((block: any) => block.block_id === process.env.REX_BLOCK),
        ),
      );
      assert.ok(callerWindow);
      const runner = load();
      const start = (command: string) =>
        runner.tools
          .get("start_command")
          .execute(
            "start",
            { command, cwd: directory, label: "toolkit-runner-test" },
            undefined,
            undefined,
            { cwd: directory },
          );
      const first = await start("printf 'rex integration output\\n'; sleep 2; false");
      const after = await view();
      const window = after.windows.find(
        (window: any) => window.window_id === callerWindow.window_id,
      );
      const layer = window.layers.find((layer: any) =>
        layer.blocks.some((block: any) => block.block_id === first.details.paneId),
      );
      assert.equal(layer.kind, "floating");
      assert.equal(layer.state, "minimized");
      assert.equal(after.active_window_id, before.active_window_id);
      assert.equal(window.focused_block_id, callerWindow.focused_block_id);
      const result = await runner.tools.get("command_status").execute("status", { waitMs: 10000 });
      assert.equal(result.details.state, "completed", result.content[0].text);
      assert.equal(result.details.exitCode, 1);
      assert.match(result.content[0].text, /rex integration output/);
      const second = await start("printf 'reused pane\\n'");
      assert.equal(second.details.paneId, first.details.paneId);
      const replacement = load();
      await replacement.handlers.get("session_start")(
        {},
        { sessionManager: { getBranch: () => [] } },
      );
      const recovered = await replacement.tools
        .get("command_status")
        .execute("status", { waitMs: 10000 });
      assert.equal(recovered.details.state, "completed", recovered.content[0].text);
      assert.equal(recovered.details.exitCode, 0);
      assert.equal(recovered.details.paneId, first.details.paneId);
      assert.match(recovered.content[0].text, /reused pane/);
      await replacement.handlers.get("session_shutdown")({ reason: "quit" });
      const closed = await view();
      assert.ok(
        !closed.windows.some((window: any) =>
          window.layers.some((layer: any) =>
            layer.blocks.some((block: any) => block.block_id === first.details.paneId),
          ),
        ),
      );
    } finally {
      const prefix = ["--server", process.env.REX_SERVER!, "--autostart=false"];
      for (const file of await readdir(directory)) {
        if (!file.endsWith(".json")) continue;
        const record = JSON.parse(await readFile(join(directory, file), "utf8"));
        if (!record.paneId || record.paneId === process.env.REX_BLOCK) continue;
        const { stdout } = await execute("rex", [
          ...prefix,
          "block",
          "ls",
          "-s",
          process.env.REX_SESSION!,
          "--json",
        ]);
        const listing = JSON.parse(stdout);
        if (!listing.blocks.some((block: { block_id: string }) => block.block_id === record.paneId))
          continue;
        await execute("rex", [
          ...prefix,
          "block",
          "close",
          "-s",
          process.env.REX_SESSION!,
          record.paneId,
        ]);
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);
