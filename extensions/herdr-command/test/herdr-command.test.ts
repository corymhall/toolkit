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
  extractTranscript,
  HERDR_COMMAND_TOOL_NAME,
  parsePaneIdle,
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

function loadExtension(exec: (command: string, args: string[]) => Promise<any>, dependencies: Record<string, unknown> = {}) {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const handlers = new Map<string, (...args: any[]) => any>();
  const entries: Array<{ customType: string; data: unknown }> = [];
  const pi = {
    registerTool(tool: { name: string; execute: (...args: any[]) => Promise<any> }) { tools.push(tool); },
    on(event: string, handler: (...args: any[]) => any) { handlers.set(event, handler); },
    appendEntry(customType: string, data: unknown) { entries.push({ customType, data }); },
    exec,
  } as unknown as ExtensionAPI;
  herdrCommandExtension(pi, dependencies);
  return { tools, handlers, entries };
}

test("builds runtime-only completion markers and extracts nonzero exits", () => {
  const markers = buildRunMarkers(FIXED_RUN_ID);
  assert.equal(markers.endRegex, "^__PI_HERDR_12345678_1234_1234_1234_123456789ABC_EXIT__=[0-9]+$");
  const transcript = extractTranscript([
    "old output",
    markers.start,
    "line one",
    "line two",
    `${markers.endPrefix}2`,
    "shell prompt",
  ].join("\n"), markers);
  assert.deepEqual(transcript, {
    output: "line one\nline two",
    exitCode: 2,
    started: true,
    completed: true,
  });
});

test("builds a visible proxied command", () => {
  assert.equal(shellQuote("it's here"), `'it'"'"'s here'`);
  const markers = buildRunMarkers(FIXED_RUN_ID);
  const paneCommand = buildPaneCommand("printf 'actual command\\n'; exit 7", "/cwd path", markers);
  assert.match(paneCommand, /cd '\/cwd path' \|\| exit 125/);
  assert.match(paneCommand, /printf 'actual command\\n'; exit 7/);
  assert.match(paneCommand, new RegExp(markers.start));
  assert.match(paneCommand, new RegExp(markers.endPrefix));
});

test("keeps JSON-looking terminal output as command output", () => {
  assert.equal(parsePaneRead('{"command":"output"}\n'), '{"command":"output"}\n');
});

test("detects whether only the pane shell owns the foreground", () => {
  assert.equal(parsePaneIdle(JSON.stringify({ result: { process_info: {
    shell_pid: 10,
    foreground_processes: [{ pid: 10 }],
  } } })), true);
  assert.equal(parsePaneIdle(JSON.stringify({ result: { process_info: {
    shell_pid: 10,
    foreground_processes: [{ pid: 11 }],
  } } })), false);
});

test("visible proxy reports a failing command without changing the parent cwd", async () => {
  const directory = await mkdtemp(join(tmpdir(), "herdr-proxy-test-"));
  try {
    const markers = buildRunMarkers(FIXED_RUN_ID);
    const paneCommand = buildPaneCommand("pwd; printf no-newline; exit 7", directory, markers);
    const output = execFileSync("/bin/sh", ["-c", paneCommand], { encoding: "utf8" });
    assert.match(output, new RegExp(`${markers.start}\\n`));
    assert.match(output, new RegExp(`no-newline\\n${markers.endPrefix}7\\n$`));
    assert.match(output, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not expose the tool outside Herdr", () => {
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

test("creates one visible pane and returns a nonzero command immediately", async () => {
  const directory = await mkdtemp(join(tmpdir(), "herdr-command-test-"));
  const markers = buildRunMarkers(FIXED_RUN_ID);
  let created = false;
  let submitted = "";
  const calls: string[][] = [];

  try {
    const loaded = withHerdrEnv(() => loadExtension(async (command, args) => {
      assert.equal(command, "herdr");
      calls.push(args);
      if (args[0] === "pane" && args[1] === "list") return success(paneList(created));
      if (args[0] === "pane" && args[1] === "layout") return success(JSON.stringify({ result: { layout: {
        panes: [{ pane_id: "w1:p1", rect: { width: 200, height: 80 } }],
      } } }));
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
      if (args[0] === "wait" && args[1] === "output") {
        const match = args[args.indexOf("--match") + 1];
        return success(JSON.stringify({ result: {
          matched_line: match === `^${markers.start}$` ? markers.start : `${markers.endPrefix}2`,
        } }));
      }
      if (args[0] === "pane" && args[1] === "read") {
        return success([markers.start, "test failed quickly", `${markers.endPrefix}2`].join("\n"));
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    }, {
      randomUUID: () => FIXED_RUN_ID,
    }));

    assert.deepEqual(loaded.tools.map(tool => tool.name), [HERDR_COMMAND_TOOL_NAME]);
    const result = await loaded.tools[0].execute(
      "call",
      { command: "make test", cwd: directory, label: "tests" },
      undefined,
      undefined,
      { cwd: directory },
    );

    assert.match(submitted, /make test/);
    assert.match(submitted, new RegExp(markers.start));
    assert.match(submitted, new RegExp(markers.endPrefix));
    assert.doesNotMatch(submitted, /runner\.mjs|command\.txt/);
    assert.equal(result.details.exitCode, 2);
    assert.equal(result.details.timedOut, false);
    assert.match(result.content[0].text, /failed with exit code 2/);
    assert.match(result.content[0].text, /test failed quickly/);
    const splitCalls = calls.filter(args => args[0] === "pane" && args[1] === "split");
    assert.equal(splitCalls.length, 1);
    assert.equal(splitCalls[0][splitCalls[0].indexOf("--direction") + 1], "down");
    assert.equal(splitCalls[0][splitCalls[0].indexOf("--ratio") + 1], "0.9");
    assert.equal(calls.some(args => args[0] === "pane" && args[1] === "layout"), false);
    assert.deepEqual(loaded.entries.at(-1)?.data, {
      paneId: "w1:p2",
      terminalId: "term_command",
      workspaceId: "w1",
      tabId: "w1:t1",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("streams a heartbeat and returns current output at the overall timeout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "herdr-command-timeout-test-"));
  const markers = buildRunMarkers(FIXED_RUN_ID);
  let created = false;
  let clock = -600;
  const updates: any[] = [];

  try {
    const loaded = withHerdrEnv(() => loadExtension(async (_command, args) => {
      if (args[0] === "pane" && args[1] === "list") return success(paneList(created));
      if (args[0] === "pane" && args[1] === "layout") return success(JSON.stringify({ result: { layout: {
        panes: [{ pane_id: "w1:p1", rect: { width: 200, height: 80 } }],
      } } }));
      if (args[0] === "pane" && args[1] === "split") {
        created = true;
        return success(JSON.stringify({ result: { pane: {
          pane_id: "w1:p2", terminal_id: "term_command", workspace_id: "w1", tab_id: "w1:t1",
        } } }));
      }
      if (args[0] === "pane" && ["rename", "run"].includes(args[1])) return success();
      if (args[0] === "wait" && args[1] === "output") {
        const match = args[args.indexOf("--match") + 1];
        if (match === `^${markers.start}$`) {
          return success(JSON.stringify({ result: { matched_line: markers.start } }));
        }
        return { code: 1, stdout: "", stderr: '{"error":{"code":"timeout"}}', killed: false };
      }
      if (args[0] === "pane" && args[1] === "read") {
        return success([markers.start, "still working"].join("\n"));
      }
      if (args[0] === "pane" && args[1] === "process-info") {
        return success(JSON.stringify({ result: { process_info: {
          shell_pid: 10,
          foreground_processes: [{ pid: 11 }],
        } } }));
      }
      throw new Error(`Unexpected args: ${args.join(" ")}`);
    }, {
      heartbeatMs: 400,
      now: () => (clock += 600),
      randomUUID: () => FIXED_RUN_ID,
    }));

    const result = await loaded.tools[0].execute(
      "call",
      { command: "sleep 100", cwd: directory, timeoutMs: 1_000 },
      undefined,
      (update: any) => updates.push(update),
      { cwd: directory },
    );

    assert.equal(result.details.timedOut, true);
    assert.match(result.content[0].text, /timed out/);
    assert.match(result.content[0].text, /still working/);
    assert.equal(updates.length, 1);
    assert.match(updates[0].content[0].text, /Latest output:\nstill working/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
