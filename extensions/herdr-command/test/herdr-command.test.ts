import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import herdrCommandExtension from "../index.ts";
import {
  buildPaneCommand,
  buildRunMarkers,
  exitCodeFromTranscript,
  extractTranscript,
  HERDR_COMMAND_PANE_ENTRY,
  HERDR_COMMAND_RUN_ENTRY,
  HERDR_COMMAND_STATUS_TOOL_NAME,
  HERDR_START_COMMAND_TOOL_NAME,
  parsePaneIdle,
  parsePaneProcessInfo,
  parsePaneRead,
  shellQuote,
} from "../herdr-command.ts";

const FIXED_RUN_ID = "12345678-1234-1234-1234-123456789abc";

function withHerdrEnv<T>(fn: () => T): T {
  const previous = {
    env: process.env.HERDR_ENV,
    pane: process.env.HERDR_PANE_ID,
    workspace: process.env.HERDR_WORKSPACE_ID,
    tab: process.env.HERDR_TAB_ID,
  };
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "w1:p1";
  process.env.HERDR_WORKSPACE_ID = "w1";
  process.env.HERDR_TAB_ID = "w1:t1";
  try {
    return fn();
  } finally {
    if (previous.env === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = previous.env;
    if (previous.pane === undefined) delete process.env.HERDR_PANE_ID;
    else process.env.HERDR_PANE_ID = previous.pane;
    if (previous.workspace === undefined) delete process.env.HERDR_WORKSPACE_ID;
    else process.env.HERDR_WORKSPACE_ID = previous.workspace;
    if (previous.tab === undefined) delete process.env.HERDR_TAB_ID;
    else process.env.HERDR_TAB_ID = previous.tab;
  }
}

function success(stdout = "") {
  return { code: 0, stdout, stderr: "", killed: false };
}

function timeout() {
  return { code: 1, stdout: "", stderr: '{"error":{"code":"timeout"}}', killed: false };
}

function paneList(created: boolean) {
  return JSON.stringify({
    result: {
      panes: [
        { pane_id: "w1:p1", terminal_id: "term_parent", workspace_id: "w1", tab_id: "w1:t1" },
        ...(created
          ? [{ pane_id: "w1:p2", terminal_id: "term_command", workspace_id: "w1", tab_id: "w1:t1" }]
          : []),
      ],
    },
  });
}

function processInfo(idle: boolean, name = "make") {
  return JSON.stringify({ result: { process_info: {
    shell_pid: 10,
    foreground_processes: idle
      ? [{ pid: 10, name: "zsh", cmdline: "zsh" }]
      : [{ pid: 11, name, cmdline: `${name} build` }],
  } } });
}

function loadExtension(exec: (command: string, args: string[]) => Promise<any>, dependencies: Record<string, unknown> = {}) {
  const tools: Array<{
    name: string;
    description?: string;
    promptGuidelines?: string[];
    execute: (...args: any[]) => Promise<any>;
  }> = [];
  const handlers = new Map<string, (...args: any[]) => any>();
  const entries: Array<{ customType: string; data: unknown }> = [];
  const pi = {
    registerTool(tool: {
      name: string;
      description?: string;
      promptGuidelines?: string[];
      execute: (...args: any[]) => Promise<any>;
    }) { tools.push(tool); },
    on(event: string, handler: (...args: any[]) => any) { handlers.set(event, handler); },
    appendEntry(customType: string, data: unknown) { entries.push({ customType, data }); },
    exec,
  } as unknown as ExtensionAPI;
  herdrCommandExtension(pi, dependencies);
  return { tools, handlers, entries };
}

function tool(loaded: ReturnType<typeof loadExtension>, name: string) {
  const found = loaded.tools.find(candidate => candidate.name === name);
  assert.ok(found, `missing tool ${name}`);
  return found;
}

function restoreSession(
  loaded: ReturnType<typeof loadExtension>,
  entries: Array<{ customType: string; data: unknown }>,
) {
  loaded.handlers.get("session_start")?.({}, {
    sessionManager: {
      getBranch: () => entries.map(entry => ({ type: "custom", ...entry })),
    },
  });
}

test("builds runtime-only completion markers and extracts nonzero exits", () => {
  const markers = buildRunMarkers(FIXED_RUN_ID);
  assert.equal(markers.endRegex, "^__PI_HERDR_12345678_1234_1234_1234_123456789ABC_EXIT__=[0-9]+$");
  const text = [
    "old output",
    markers.start,
    "line one",
    "line two",
    `${markers.endPrefix}2`,
    "shell prompt",
  ].join("\n");
  assert.deepEqual(extractTranscript(text, markers), {
    output: "line one\nline two",
    exitCode: 2,
    started: true,
    completed: true,
  });
  assert.equal(exitCodeFromTranscript(text, markers), 2);
  assert.equal(exitCodeFromTranscript(`${markers.endPrefix}2 extra`, markers), undefined);
});

test("builds a visible single-line proxied command", () => {
  assert.equal(shellQuote("it's here"), `'it'"'"'s here'`);
  const markers = buildRunMarkers(FIXED_RUN_ID);
  const paneCommand = buildPaneCommand("printf 'actual command\\n'; exit 7", "/cwd path", markers);
  assert.match(paneCommand, /builtin cd '\/cwd path' \|\| exit 125/);
  assert.match(paneCommand, /printf 'actual command\\n'; exit 7/);
  assert.match(paneCommand, new RegExp(markers.start));
  assert.match(paneCommand, new RegExp(markers.endPrefix));
  assert.doesNotMatch(paneCommand, /[\r\n\t]/);
  assert.throws(
    () => buildPaneCommand("printf one\nprintf two", "/cwd path", markers),
    /one physical command line/,
  );
});

test("keeps JSON-looking terminal output as command output", () => {
  assert.equal(parsePaneRead('{"command":"output"}\n'), '{"command":"output"}\n');
});

test("parses foreground processes and detects shell-only idle panes", () => {
  const active = parsePaneProcessInfo(processInfo(false, "go"));
  assert.equal(active.idle, false);
  assert.deepEqual(active.foregroundProcesses, [{ pid: 11, name: "go", cmdline: "go build" }]);
  assert.equal(parsePaneIdle(processInfo(true)), true);
});

test("visible proxy reports a failing command without changing the parent cwd", async () => {
  const directory = await mkdtemp(join(tmpdir(), "herdr-proxy-test-"));
  try {
    const markers = buildRunMarkers(FIXED_RUN_ID);
    const paneCommand = buildPaneCommand("pwd; printf no-newline; exit 7", directory, markers);
    const output = execFileSync("/bin/sh", [
      "-c",
      `cd() { printf 'interactive picker should not run\\n'; }; ${paneCommand}`,
    ], { encoding: "utf8" });
    assert.match(output, new RegExp(`${markers.start}\\n`));
    assert.match(output, new RegExp(`no-newline\\n${markers.endPrefix}7\\n$`));
    assert.match(output, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, /interactive picker should not run/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not expose tools outside Herdr", () => {
  const previous = process.env.HERDR_ENV;
  delete process.env.HERDR_ENV;
  try {
    const { tools } = loadExtension(async () => success());
    assert.deepEqual(tools, []);
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = previous;
  }
});

test("starts one visible command and returns without waiting or reading output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "herdr-command-start-test-"));
  let created = false;
  let submitted = "";
  const calls: string[][] = [];

  try {
    const loaded = withHerdrEnv(() => loadExtension(async (command, args) => {
      assert.equal(command, "herdr");
      calls.push(args);
      if (args[0] === "pane" && args[1] === "list") return success(paneList(created));
      if (args[0] === "pane" && args[1] === "split") {
        created = true;
        return success(JSON.stringify({ result: { pane: {
          pane_id: "w1:p2", terminal_id: "term_command", workspace_id: "w1", tab_id: "w1:t1",
        } } }));
      }
      if (args[0] === "pane" && args[1] === "rename") return success();
      if (args[0] === "pane" && args[1] === "run") {
        submitted = args[3];
        return success();
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    }, {
      now: () => 1_000,
      randomUUID: () => FIXED_RUN_ID,
    }));

    assert.deepEqual(loaded.tools.map(candidate => candidate.name), [
      HERDR_START_COMMAND_TOOL_NAME,
      HERDR_COMMAND_STATUS_TOOL_NAME,
    ]);
    const startTool = tool(loaded, HERDR_START_COMMAND_TOOL_NAME);
    const statusTool = tool(loaded, HERDR_COMMAND_STATUS_TOOL_NAME);
    assert.match(startTool.description ?? "", /return immediately/);
    assert.match(startTool.promptGuidelines?.join("\n") ?? "", /continue useful independent work/);
    assert.match(statusTool.description ?? "", /Returns immediately unless waitMs/);
    const result = await startTool.execute(
      "call",
      { command: "make build", cwd: directory, label: "build" },
      undefined,
      undefined,
      { cwd: directory },
    );

    const markers = buildRunMarkers(FIXED_RUN_ID);
    assert.match(submitted, /make build/);
    assert.match(submitted, new RegExp(markers.start));
    assert.match(submitted, new RegExp(markers.endPrefix));
    assert.doesNotMatch(submitted, /runner\.mjs|command\.txt|[\r\n\t]/);
    assert.equal(result.details.state, "submitted");
    assert.equal(result.details.runId, FIXED_RUN_ID);
    assert.match(result.content[0].text, /running independently/);
    assert.equal(calls.some(args => args[0] === "wait" || args[1] === "read"), false);

    const split = calls.find(args => args[0] === "pane" && args[1] === "split");
    assert.ok(split);
    assert.equal(split[split.indexOf("--direction") + 1], "down");
    assert.equal(split[split.indexOf("--ratio") + 1], "0.9");
    assert.deepEqual(loaded.entries.map(entry => entry.customType), [
      HERDR_COMMAND_PANE_ENTRY,
      HERDR_COMMAND_RUN_ENTRY,
    ]);
    assert.deepEqual(loaded.entries.at(-1)?.data, {
      runId: FIXED_RUN_ID,
      terminalId: "term_command",
      command: "make build",
      cwd: directory,
      startedAt: 1_000,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports a running command immediately with foreground process and recent output", async () => {
  const markers = buildRunMarkers(FIXED_RUN_ID);
  const run = {
    runId: FIXED_RUN_ID,
    terminalId: "term_command",
    command: "make build",
    cwd: "/repo",
    startedAt: 1_000,
  };
  const calls: string[][] = [];
  const loaded = withHerdrEnv(() => loadExtension(async (_command, args) => {
    calls.push(args);
    if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
    if (args[0] === "pane" && args[1] === "read") {
      return success([markers.start, "compiling package", "still working"].join("\n"));
    }
    if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(false));
    throw new Error(`Unexpected args: ${args.join(" ")}`);
  }, { now: () => 4_000 }));
  restoreSession(loaded, [
    { customType: HERDR_COMMAND_PANE_ENTRY, data: {
      paneId: "w1:p2", terminalId: "term_command", workspaceId: "w1", tabId: "w1:t1",
    } },
    { customType: HERDR_COMMAND_RUN_ENTRY, data: run },
  ]);

  const result = await tool(loaded, HERDR_COMMAND_STATUS_TOOL_NAME).execute("call", {}, undefined);
  assert.equal(result.details.state, "running");
  assert.equal(result.details.durationMs, 3_000);
  assert.deepEqual(result.details.foregroundProcesses, [{ pid: 11, name: "make", cmdline: "make build" }]);
  assert.match(result.content[0].text, /still running/);
  assert.match(result.content[0].text, /compiling package/);
  assert.match(result.content[0].text, /Foreground: make/);
  assert.equal(calls.some(args => args[0] === "wait"), false);
});

test("reports a completed nonzero command and recovers it after session reload", async () => {
  const markers = buildRunMarkers(FIXED_RUN_ID);
  const loaded = withHerdrEnv(() => loadExtension(async (_command, args) => {
    if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
    if (args[0] === "pane" && args[1] === "read") {
      return success([markers.start, "build failed", `${markers.endPrefix}2`, "prompt"].join("\n"));
    }
    if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(true));
    throw new Error(`Unexpected args: ${args.join(" ")}`);
  }, { now: () => 6_000 }));
  restoreSession(loaded, [
    { customType: HERDR_COMMAND_PANE_ENTRY, data: {
      paneId: "w1:p2", terminalId: "term_command", workspaceId: "w1", tabId: "w1:t1",
    } },
    { customType: HERDR_COMMAND_RUN_ENTRY, data: {
      runId: FIXED_RUN_ID,
      terminalId: "term_command",
      command: "make build",
      cwd: "/repo",
      startedAt: 1_000,
    } },
  ]);

  const result = await tool(loaded, HERDR_COMMAND_STATUS_TOOL_NAME).execute("call", {}, undefined);
  assert.equal(result.details.state, "completed");
  assert.equal(result.details.exitCode, 2);
  assert.match(result.content[0].text, /failed with exit code 2/);
  assert.match(result.content[0].text, /build failed/);
});

test("optionally waits for a bounded interval without turning status timeouts into errors", async () => {
  const markers = buildRunMarkers(FIXED_RUN_ID);
  const calls: string[][] = [];
  const loaded = withHerdrEnv(() => loadExtension(async (_command, args) => {
    calls.push(args);
    if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
    if (args[0] === "pane" && args[1] === "read") return success([markers.start, "still building"].join("\n"));
    if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(false));
    if (args[0] === "wait" && args[1] === "output") return timeout();
    throw new Error(`Unexpected args: ${args.join(" ")}`);
  }, { now: () => 4_000 }));
  restoreSession(loaded, [
    { customType: HERDR_COMMAND_PANE_ENTRY, data: {
      paneId: "w1:p2", terminalId: "term_command", workspaceId: "w1", tabId: "w1:t1",
    } },
    { customType: HERDR_COMMAND_RUN_ENTRY, data: {
      runId: FIXED_RUN_ID,
      terminalId: "term_command",
      command: "make build",
      cwd: "/repo",
      startedAt: 1_000,
    } },
  ]);

  const result = await tool(loaded, HERDR_COMMAND_STATUS_TOOL_NAME).execute(
    "call",
    { waitMs: 5_000, lines: 20 },
    undefined,
  );
  assert.equal(result.details.state, "running");
  const wait = calls.find(args => args[0] === "wait" && args[1] === "output");
  assert.ok(wait);
  assert.equal(wait[wait.indexOf("--timeout") + 1], "5000");
  assert.equal(wait[wait.indexOf("--match") + 1], markers.endRegex);
});

test("does not submit a second command while the first launch is still reaching the shell", async () => {
  let runCalls = 0;
  const loaded = withHerdrEnv(() => loadExtension(async (_command, args) => {
    if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
    if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(true));
    if (args[0] === "pane" && args[1] === "read") return success("old shell prompt");
    if (args[0] === "pane" && args[1] === "run") {
      runCalls++;
      return success();
    }
    throw new Error(`Unexpected args: ${args.join(" ")}`);
  }, { now: () => 1_000 }));
  restoreSession(loaded, [
    { customType: HERDR_COMMAND_PANE_ENTRY, data: {
      paneId: "w1:p2", terminalId: "term_command", workspaceId: "w1", tabId: "w1:t1",
    } },
    { customType: HERDR_COMMAND_RUN_ENTRY, data: {
      runId: FIXED_RUN_ID,
      terminalId: "term_command",
      command: "make build",
      cwd: "/repo",
      startedAt: 1_000,
    } },
  ]);

  const result = await tool(loaded, HERDR_START_COMMAND_TOOL_NAME).execute(
    "call",
    { command: "make test", cwd: "/" },
    undefined,
    undefined,
    { cwd: "/" },
  );
  assert.equal(result.details.state, "busy");
  assert.equal(runCalls, 0);
});

test("refuses a second command while the managed pane is busy", async () => {
  let runCalls = 0;
  const loaded = withHerdrEnv(() => loadExtension(async (_command, args) => {
    if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
    if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(false, "go"));
    if (args[0] === "pane" && args[1] === "run") {
      runCalls++;
      return success();
    }
    throw new Error(`Unexpected args: ${args.join(" ")}`);
  }));
  restoreSession(loaded, [
    { customType: HERDR_COMMAND_PANE_ENTRY, data: {
      paneId: "w1:p2", terminalId: "term_command", workspaceId: "w1", tabId: "w1:t1",
    } },
    { customType: HERDR_COMMAND_RUN_ENTRY, data: {
      runId: FIXED_RUN_ID,
      terminalId: "term_command",
      command: "go test ./...",
      cwd: "/repo",
      startedAt: 1_000,
    } },
  ]);

  const result = await tool(loaded, HERDR_START_COMMAND_TOOL_NAME).execute(
    "call",
    { command: "make build", cwd: "/" },
    undefined,
    undefined,
    { cwd: "/" },
  );
  assert.equal(result.details.state, "busy");
  assert.equal(result.details.runId, FIXED_RUN_ID);
  assert.match(result.content[0].text, /already busy/);
  assert.equal(runCalls, 0);
});

test("status reports no tracked command before the first launch", async () => {
  const loaded = withHerdrEnv(() => loadExtension(async () => {
    throw new Error("Herdr should not be called");
  }));
  const result = await tool(loaded, HERDR_COMMAND_STATUS_TOOL_NAME).execute("call", {}, undefined);
  assert.equal(result.details.state, "none");
  assert.match(result.content[0].text, /No Herdr command is tracked/);
});
