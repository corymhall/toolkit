import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import githubPrExtension from "../index.ts";
import type { ProgramStatus } from "../terminal-status.ts";

test("/pr toggles an above-editor widget without opening a popup or touching the draft", async () => {
  type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
  const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
  let command: Command | undefined;
  let tool: Parameters<ExtensionAPI["registerTool"]>[0] | undefined;
  const saved: unknown[] = [];
  let widget: Component | undefined;
  let draft = "Keep this draft while inspecting CI";
  const notices: string[] = [];
  const reports: ProgramStatus[] = [];
  const terminal = {
    rows: 40,
    setProgramStatus: (status: ProgramStatus) => {
      reports.push(status);
    },
  };
  const originalStatus = terminal.setProgramStatus;
  const theme = { fg: (_color: string, text: string) => text } as Theme;
  const ui = {
    setWidget: (_name: string, factory: unknown) => {
      widget =
        typeof factory === "function"
          ? factory({ terminal, requestRender() {} }, theme)
          : undefined;
    },
    custom: () => assert.fail("PR details must never open a popup"),
    setEditorText: (text: string) => {
      draft = text;
    },
    notify: (text: string) => notices.push(text),
  };
  const pi = {
    registerCommand: (_name: string, value: Command) => {
      command = value;
    },
    registerTool(value: Parameters<ExtensionAPI["registerTool"]>[0]) {
      tool = value;
    },
    appendEntry: (_type: string, data: unknown) => saved.push(data),
    registerMessageRenderer() {},
    on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) =>
      handlers.set(name, handler),
  } as unknown as ExtensionAPI;
  githubPrExtension(pi);
  // Print startup deliberately avoids background GitHub work. Exercise the same
  // registered command with a TUI context to test the UI boundary in isolation.
  const ctx = {
    mode: "print",
    cwd: "/tmp",
    ui,
    sessionManager: {
      getBranch: () =>
        saved.length
          ? [{ type: "custom", customType: "toolkit-github-ci-watches", data: saved.at(-1) }]
          : [],
    },
    isIdle: () => true,
  } as unknown as ExtensionContext;
  handlers.get("session_start")!({}, ctx);
  const tui = { ...ctx, mode: "tui" } as ExtensionCommandContext;
  const render = () => widget?.render(80) || [];
  await command!.handler("", tui);
  assert.match(render().join("\n"), /No current branch PR/);
  assert.ok(widget && !("handleInput" in widget));
  assert.equal(draft, "Keep this draft while inspecting CI");
  await command!.handler("", tui);
  assert.deepEqual(render(), []);
  await command!.handler("details", tui);
  assert.match(render().join("\n"), /No current branch PR/);
  assert.deepEqual(notices, []);
  await command!.handler("hide", tui);
  assert.deepEqual(render(), []);
  // Hiding the inline panel must not remove status composition or lifecycle hooks.
  handlers.get("agent_start")!({}, tui);
  assert.equal(reports.at(-1)?.state, "working");
  terminal.setProgramStatus({ state: "done", app: "pi" });
  handlers.get("agent_settled")!({}, tui);
  assert.equal(reports.at(-1)?.state, "done");
  handlers.get("session_shutdown")!({}, ctx);
  assert.equal(terminal.setProgramStatus, originalStatus);

  // Opt-out must be saved even when there is no PR, then restored by the actual
  // extension lifecycle rather than just held in this closure's memory.
  handlers.get("session_start")!({}, ctx);
  await command!.handler("unwatch", tui);
  handlers.get("session_shutdown")!({}, ctx);
  handlers.get("session_start")!({}, ctx);
  const toolCtx = {
    ...tui,
    mode: "rpc" as const,
    tools: [],
    executeTool: async () => {
      throw new Error("No nested tool calls expected");
    },
  };
  const status = await tool!.execute(
    "status",
    { action: "status" },
    new AbortController().signal,
    undefined,
    toolCtx,
  );
  assert.match(
    status.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
    /Automatic current-PR watching: off/,
  );
  await command!.handler("watch", tui);
  const enabled = await tool!.execute(
    "status",
    { action: "status" },
    new AbortController().signal,
    undefined,
    toolCtx,
  );
  assert.match(
    enabled.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
    /Automatic current-PR watching: on/,
  );
  handlers.get("session_shutdown")!({}, ctx);
});

test("agent batch status and cancellation preserve per-target data across the tool boundary", async () => {
  let tool: Parameters<ExtensionAPI["registerTool"]>[0] | undefined;
  const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
  const urls = [41, 42].map((n) => `https://github.com/acme/widget/pull/${n}`);
  const saved = {
    version: 3,
    automatic: { enabled: false, receipts: [] },
    watches: urls.map((url, i) => ({
      target: { url },
      head: "a".repeat(40),
      startedAt: 1,
      subscription: true,
      status: "paused",
      label: `Layer ${i}`,
      order: i,
    })),
  };
  githubPrExtension({
    registerTool: (value: Parameters<ExtensionAPI["registerTool"]>[0]) => {
      tool = value;
    },
    registerCommand() {},
    registerMessageRenderer() {},
    appendEntry() {},
    on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) => {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI);
  const ctx = {
    mode: "print",
    cwd: "/tmp",
    ui: { setWidget() {} },
    sessionManager: {
      getBranch: () => [{ type: "custom", customType: "toolkit-github-ci-watches", data: saved }],
    },
  } as unknown as ExtensionContext;
  handlers.get("session_start")!({}, ctx);
  const rpc = { ...ctx, mode: "rpc" } as Parameters<NonNullable<typeof tool>["execute"]>[4];
  const execute = (args: unknown) =>
    tool!.execute("batch", args, new AbortController().signal, undefined, rpc);
  const status = await execute({ action: "status" });
  const data = status.structuredContent as {
    tracking: { targets: { label: string; state: string; mode: string; status: string }[] };
  };
  assert.deepEqual(
    data.tracking.targets.map((t) => [t.label, t.state, t.mode]),
    [
      ["Layer 0", "paused", "subscription"],
      ["Layer 1", "paused", "subscription"],
    ],
  );
  await assert.rejects(
    execute({ action: "cancel", target: urls[0], targets: [{ url: urls[1] }] }),
    /not both/,
  );
  await assert.rejects(
    execute({
      action: "cancel",
      targets: [{ url: urls[0] }, { url: "https://example.com/not-github" }],
    }),
    /GitHub.com/,
  );
  const unchanged = await execute({ action: "status" });
  assert.ok(
    (unchanged.structuredContent as typeof data).tracking.targets.every(
      (t) => t.status === "paused",
    ),
  );
  const cancelled = await execute({ action: "cancel", targets: urls.map((url) => ({ url })) });
  const result = cancelled.structuredContent as {
    results: { ok: boolean }[];
    tracking: { targets: { status: string }[] };
  };
  assert.ok(result.results.every((r) => r.ok));
  assert.equal(result.results.length, 2);
  assert.ok(result.tracking.targets.every((t) => t.status === "cancelled"));
  handlers.get("session_shutdown")!({}, ctx);
});
