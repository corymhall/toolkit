import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { installChild } from "../child.ts";
import test from "node:test";
import { SubagentManager } from "../manager.ts";
import type { RexCall, RexView } from "../rex.ts";
import { CHILD_ENV, key, saveJSON } from "../storage.ts";
import rexSubagents from "../index.ts";
import { assistant, fixture, harness } from "./helpers.ts";

function rex() {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const current: RexView = {
    session_id: "rex-session",
    windows: [
      {
        window_id: "source-tab",
        layers: [
          {
            layer_id: "tiled",
            kind: "tiled",
            blocks: [{ block_id: "parent", label: "Parent", host_id: "host" }],
          },
        ],
      },
    ],
  };
  let loseCreation = false;
  let instance = "instance";
  const call: RexCall = async (method, args) => {
    calls.push({ method, args });
    if (method === "server.status") return { instance_id: instance, host_id: "host" };
    if (method === "session.view") return current;
    if (method === "session.list_blocks")
      return { blocks: current.windows.flatMap((w) => w.layers.flatMap((l) => l.blocks)) };
    if (method === "block.close") {
      for (const window of current.windows)
        for (const layer of window.layers)
          layer.blocks = layer.blocks.filter((block) => block.block_id !== args.block_id);
      return {};
    }
    if (method === "session.new_layer") {
      const layout = args.layout as { block: { label: string } };
      current.windows[0]!.layers.push({
        layer_id: "child-layer",
        kind: "floating",
        blocks: [{ block_id: "child", label: layout.block.label, host_id: "host" }],
      });
      if (loseCreation) throw new Error("lost acknowledgement");
      return { layer_id: "child-layer", block_ids: ["child"] };
    }
    if (
      ["session.set_layer_state", "session.set_block_label", "session.focus_block"].includes(method)
    )
      return {};
    throw new Error(`Unexpected Rex operation ${method}`);
  };
  return {
    calls,
    call,
    current,
    loseCreation() {
      loseCreation = true;
    },
    restart() {
      instance = "new-instance";
    },
  };
}

test("launch uses parent defaults without approval and quiet startup follows promoted placement", async () => {
  const f = await fixture();
  const r = rex();
  const h = harness();
  const manager = new SubagentManager(
    r.call,
    { server: f.config.server, session: "rex-session", block: "parent" },
    "parent",
    f.root,
  );
  let socketDirectory: string | undefined;
  try {
    const child = await manager.spawn("approved", "worker", "Inspect", process.cwd(), h.ctx);
    socketDirectory = child.config.socketDirectory;
    const launch = r.calls.find((c) => c.method === "session.new_layer")!.args;
    assert.equal(launch.window_id, "source-tab");
    assert.equal(launch.focus, false);
    const options = (
      launch.layout as { block: { options: { command: string[]; shell: string; login: boolean } } }
    ).block.options;
    assert.equal(options.command[options.command.indexOf("--model") + 1], "openai/test-model");
    assert.equal(options.command[options.command.indexOf("--thinking") + 1], "low");
    assert.equal(options.shell, "none");
    assert.equal(options.login, false);
    assert.ok(options.command.includes("PI_PROGRAM_STATUS=0"));
    assert.ok(options.command.some((part) => part.startsWith(`${CHILD_ENV}=`)));
    assert.ok(!options.command.includes("--tools"), "use Pi’s full default built-in tool set");
    assert.ok(!options.command.includes("--no-extensions"));
    assert.ok(!options.command.includes("--no-context-files"));
    assert.ok(
      r.calls.some((c) => c.method === "session.set_layer_state" && c.args.state === "minimized"),
    );

    // Human promotion changes layout only. Resolve it afresh, never re-hide it.
    const promoted = r.current.windows[0]!.layers.pop()!;
    promoted.kind = "tiled";
    r.current.windows.push({ window_id: "promoted-tab", layers: [promoted] });
    r.calls.length = 0;
    await manager.open("worker");
    assert.ok(
      r.calls.some((c) => c.method === "session.focus_block" && c.args.block_id === "child"),
    );
    assert.ok(!r.calls.some((c) => c.method === "session.set_layer_state"));
    r.restart();
    await assert.rejects(manager.list(), /server restarted/);
  } finally {
    if (socketDirectory) await rm(socketDirectory, { recursive: true, force: true });
    await f.clean();
  }
});

test("model overrides validate before reserving names, preserve provider model paths, and survive retries", async () => {
  const f = await fixture();
  const r = rex();
  const h = harness();
  const selected = { provider: "other", id: "org/model", reasoning: true };
  Object.assign(h.ctx, {
    modelRegistry: {
      find: (provider: string, id: string) =>
        provider === selected.provider && id === selected.id ? selected : undefined,
    },
  });
  const manager = new SubagentManager(
    r.call,
    { server: f.config.server, session: "rex-session", block: "parent" },
    "parent",
    f.root,
  );
  let socketDirectory: string | undefined;
  try {
    for (const model of ["missing", "other/", "unknown/model"]) {
      await assert.rejects(
        manager.spawn("request", "worker", "Inspect", process.cwd(), h.ctx, { model }),
        /provider\/model-id|Unknown subagent model/,
      );
    }
    await assert.rejects(
      manager.spawn("request", "worker", "Inspect", process.cwd(), h.ctx, {
        model: "other/org/model",
        effort: "max",
      }),
      /does not support effort/,
    );
    assert.equal(r.calls.filter((c) => c.method === "session.new_layer").length, 0);
    const options = { model: "other/org/model", effort: "high" as const };
    const child = await manager.spawn(
      "request",
      "worker",
      "Inspect",
      process.cwd(),
      h.ctx,
      options,
    );
    socketDirectory = child.config.socketDirectory;
    const launch = r.calls.find((c) => c.method === "session.new_layer")!.args;
    const command = (launch.layout as { block: { options: { command: string[] } } }).block.options
      .command;
    assert.equal(command[command.indexOf("--model") + 1], "other/org/model");
    assert.equal(command[command.indexOf("--thinking") + 1], "high");
    assert.equal(child.config.model, "other/org/model");
    assert.equal(child.config.effort, "high");
    await manager.spawn("request", "worker", "Inspect", process.cwd(), h.ctx, options);
    await assert.rejects(
      manager.spawn("request", "worker", "Inspect", process.cwd(), h.ctx, {
        ...options,
        effort: "low",
      }),
      /already reserved/,
    );
    assert.equal(r.calls.filter((c) => c.method === "session.new_layer").length, 1);
  } finally {
    if (socketDirectory) await rm(socketDirectory, { recursive: true, force: true });
    await f.clean();
  }
});

test("a lost launch acknowledgement recovers ownership without launching twice or minimizing again", async () => {
  const f = await fixture();
  const r = rex();
  const h = harness();
  const manager = new SubagentManager(
    r.call,
    { server: f.config.server, session: "rex-session", block: "parent" },
    "parent",
    f.root,
  );
  r.loseCreation();
  let socketDirectory: string | undefined;
  try {
    await assert.rejects(
      manager.spawn("request", "worker", "Inspect", process.cwd(), h.ctx),
      /outcome is uncertain/,
    );
    const [child] = await manager.list();
    socketDirectory = child?.config.socketDirectory;
    assert.equal(child?.launch.block, "child");
    await manager.spawn("request", "worker", "Inspect", process.cwd(), h.ctx);
    await assert.rejects(
      manager.spawn("different-request", "worker", "Inspect", process.cwd(), h.ctx),
      /already reserved/,
    );
    assert.equal(r.calls.filter((c) => c.method === "session.new_layer").length, 1);
    assert.equal(r.calls.filter((c) => c.method === "session.set_layer_state").length, 0);
  } finally {
    if (socketDirectory) await rm(socketDirectory, { recursive: true, force: true });
    await f.clean();
  }
});

test("parent and child preserve accepted delivery and stop after an uncertain submission", async () => {
  const f = await fixture();
  const r = rex();
  const parent = harness();
  const manager = new SubagentManager(
    r.call,
    { server: f.config.server, session: "rex-session", block: "parent" },
    "parent",
    f.root,
  );
  let child: ReturnType<typeof harness> | undefined;
  let socketDirectory: string | undefined;
  try {
    const launched = await manager.spawn("launch", "worker", "Inspect", process.cwd(), parent.ctx);
    socketDirectory = launched.config.socketDirectory;
    child = harness(launched.config.session);
    installChild(child.pi, launched.file, { call: r.call, env: { ...f.env, REX_BLOCK: "child" } });
    await child.emit("session_start");
    await child.emit("agent_start");
    await child.emit("message_end", assistant("Initial result"));
    await child.emit("agent_settled", { aborted: false });
    const accepted = await manager.send("one", "worker", "Inspect tests", "followUp");
    assert.deepEqual(await manager.send("one", "worker", "Inspect tests", "followUp"), accepted);
    assert.deepEqual(child.users, ["Inspect tests"]);
    await saveJSON(join(dirname(launched.file), "parent-requests", `${key("lost")}.json`), {
      fingerprint: key(JSON.stringify(["Another task", "followUp"])),
      state: "submitting",
    });
    await assert.rejects(manager.send("lost", "worker", "Another task", "followUp"), /uncertain/);
    assert.deepEqual(child.users, ["Inspect tests"]);
  } finally {
    await child?.emit("session_shutdown");
    if (socketDirectory) await rm(socketDirectory, { recursive: true, force: true });
    await f.clean();
  }
});

test("cleanup closes only confirmed idle exclusive floating children and retains reports", async () => {
  const f = await fixture();
  const r = rex();
  const manager = new SubagentManager(
    r.call,
    { server: f.config.server, session: "rex-session", block: "parent" },
    "parent",
    f.root,
  );
  let child: ReturnType<typeof harness> | undefined;
  let socketDirectory: string | undefined;
  try {
    const launched = await manager.spawn(
      "launch",
      "worker",
      "Inspect",
      process.cwd(),
      harness().ctx,
    );
    socketDirectory = launched.config.socketDirectory;
    assert.equal((await manager.cleanup()).length, 1, "unreachable receiver stays open");
    child = harness(launched.config.session);
    installChild(child.pi, launched.file, { call: r.call, env: { ...f.env, REX_BLOCK: "child" } });
    await child.emit("session_start");
    assert.equal((await manager.cleanup()).length, 1, "active assignment stays open");
    await child.emit("agent_start");
    await child.emit("message_end", assistant("Done"));
    await child.emit("agent_settled", { aborted: false });
    assert.equal(typeof (await manager.find("worker")).status?.idleSince, "number");
    const layer = r.current.windows[0]!.layers[1]!;
    layer.kind = "tiled";
    assert.equal((await manager.cleanup()).length, 1, "promoted pane stays open");
    layer.kind = "floating";
    layer.blocks.push({ block_id: "unrelated", label: "Other", host_id: "host" });
    assert.equal((await manager.cleanup()).length, 1, "shared layer stays open");
    layer.blocks.pop();
    assert.deepEqual(await manager.cleanup(), []);
    assert.equal((await manager.find("worker")).placement, "closed");
    assert.equal((await manager.completed()).length, 1);
    assert.equal(r.calls.filter((call) => call.method === "block.close").length, 1);
  } finally {
    await child?.emit("session_shutdown");
    if (socketDirectory) await rm(socketDirectory, { recursive: true, force: true });
    await f.clean();
  }
});

test("the registered spawn tool launches without a UI prompt and inherits the live effort", async () => {
  const f = await fixture();
  const r = rex();
  const h = harness();
  let tool: { execute: (...args: unknown[]) => Promise<unknown> } | undefined;
  Object.assign(h.pi, {
    registerTool: (definition: typeof tool) => {
      tool = definition;
    },
    registerCommand() {},
    getThinkingLevel: () => "high",
  });
  h.ctx.ui.confirm = async () => {
    throw new Error("Must not prompt for launch approval");
  };
  rexSubagents(h.pi, {
    env: { REX_SERVER: f.config.server, REX_SESSION: "rex-session", REX_BLOCK: "parent" },
    call: r.call,
    stateDirectory: f.root,
  });
  try {
    await h.emit("session_start");
    assert.ok(tool);
    await tool.execute(
      "tool-launch",
      { action: "spawn", name: "worker", task: "Inspect" },
      undefined,
      undefined,
      h.ctx,
    );
    const launch = r.calls.find((c) => c.method === "session.new_layer")!.args;
    const command = (launch.layout as { block: { options: { command: string[] } } }).block.options
      .command;
    assert.equal(command[command.indexOf("--thinking") + 1], "high");
    const configArg = command.find((part) => part.startsWith(`${CHILD_ENV}=`))!;
    const { readJSON, parseConfig } = await import("../storage.ts");
    const config = parseConfig(await readJSON(configArg.slice(CHILD_ENV.length + 1)));
    await rm(config.socketDirectory, { recursive: true, force: true });
  } finally {
    await h.emit("session_shutdown");
    await f.clean();
  }
});

test("idle reminders reset on new work and new-session cleanup closes the settled child", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const f = await fixture();
  const r = rex();
  const parent = harness("parent");
  let tool: { execute: (...args: unknown[]) => Promise<any> } | undefined;
  Object.assign(parent.pi, {
    registerTool(definition: typeof tool) {
      tool = definition;
    },
    registerCommand() {},
    getThinkingLevel: () => "low",
  });
  let tick: (() => Promise<void>) | undefined;
  let ready!: () => void;
  const scheduled = new Promise<void>((resolve) => {
    ready = resolve;
  });
  rexSubagents(parent.pi, {
    env: { REX_SERVER: f.config.server, REX_SESSION: "rex-session", REX_BLOCK: "parent" },
    call: r.call,
    stateDirectory: f.root,
    schedule(next) {
      tick = next;
      ready();
      return () => {
        tick = undefined;
      };
    },
  });
  let child: ReturnType<typeof harness> | undefined;
  let socketDirectory: string | undefined;
  try {
    await parent.emit("session_start");
    await tool!.execute(
      "spawn",
      { action: "spawn", name: "worker", task: "Inspect" },
      undefined,
      undefined,
      parent.ctx,
    );
    await scheduled;
    const { configurations } = await import("../storage.ts");
    const manager = new SubagentManager(
      r.call,
      { server: f.config.server, session: "rex-session", block: "parent" },
      "parent",
      f.root,
    );
    await manager.initialize();
    const [launched] = await configurations(manager.root);
    assert.ok(launched);
    socketDirectory = launched.config.socketDirectory;
    child = harness(launched.config.session);
    installChild(child.pi, launched.file, { call: r.call, env: { ...f.env, REX_BLOCK: "child" } });
    await child.emit("session_start");
    await child.emit("agent_start");
    await child.emit("agent_settled", { aborted: false });
    const reminders = () =>
      parent.messages.filter((message: any) => message.customType === "subagent-cleanup-reminder");
    t.mock.timers.setTime(1_000_000 + 14 * 60_000);
    await tick!();
    assert.equal(reminders().length, 0);
    t.mock.timers.setTime(1_000_000 + 15 * 60_000);
    await tick!();
    assert.equal(reminders().length, 1);
    t.mock.timers.setTime(1_000_000 + 16 * 60_000);
    await tick!();
    assert.equal(reminders().length, 1, "same idle period is not repeated");
    await tool!.execute(
      "send",
      { action: "send", name: "worker", task: "More work" },
      undefined,
      undefined,
      parent.ctx,
    );
    await child.emit("agent_start");
    t.mock.timers.setTime(1_000_000 + 32 * 60_000);
    await tick!();
    assert.equal(reminders().length, 1, "quiet working children are not idle");
    await child.emit("agent_settled", { aborted: false });
    t.mock.timers.setTime(1_000_000 + 47 * 60_000);
    await tick!();
    assert.equal(reminders().length, 2);
    await parent.emit("session_shutdown", { reason: "new" });
    assert.equal((await manager.find("worker")).placement, "closed");
    assert.equal(tick, undefined);
  } finally {
    await parent.emit("session_shutdown");
    await child?.emit("session_shutdown");
    if (socketDirectory) await rm(socketDirectory, { recursive: true, force: true });
    await f.clean();
  }
});

test("outside Rex and in children the packaged entry point registers no delegation interface", () => {
  for (const env of [
    {},
    {
      REX_SERVER: "unix:///tmp/rex",
      REX_SESSION: "s",
      REX_BLOCK: "b",
      [CHILD_ENV]: "/private/config",
    },
  ]) {
    // The intentionally empty API makes accidental registration fail immediately.
    rexSubagents(harness().pi, { env });
  }
});
