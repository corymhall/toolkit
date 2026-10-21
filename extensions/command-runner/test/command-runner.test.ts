import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  CompactToolCard,
  EmptyToolResult,
  type CompactTheme,
} from "../../pi-ui/tool-cards/rendering.ts";
import herdrCommandExtension from "../index.ts";
import {
  buildPaneCommand,
  buildRunMarkers,
  exitCodeFromTranscript,
  extractTranscript,
  HERDR_COMMAND_METADATA_SOURCE,
  HERDR_COMMAND_OWNER_TOKEN,
  HERDR_COMMAND_PANE_ENTRY,
  HERDR_COMMAND_RUN_TOKEN,
  HERDR_COMMAND_STARTED_AT_TOKEN,
  HERDR_COMMAND_RUN_ENTRY,
  COMMAND_STATUS_TOOL_NAME,
  START_COMMAND_TOOL_NAME,
  parsePaneProcessInfo,
  parsePaneRead,
  shellQuote,
} from "../command-runner.ts";

const FIXED_RUN_ID = "12345678-1234-1234-1234-123456789abc";
const plainTheme: CompactTheme = {
  fg: (_color, text) => text,
};

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

function paneList(
  created: boolean,
  ownerTerminalId = "term_parent",
  run?: { runId: string; startedAt: number },
) {
  return JSON.stringify({
    result: {
      panes: [
        { pane_id: "w1:p1", terminal_id: "term_parent", workspace_id: "w1", tab_id: "w1:t1" },
        ...(created
          ? [
              {
                pane_id: "w1:p2",
                terminal_id: "term_command",
                workspace_id: "w1",
                tab_id: "w1:t1",
                tokens: {
                  [HERDR_COMMAND_OWNER_TOKEN]: ownerTerminalId,
                  ...(run
                    ? {
                        [HERDR_COMMAND_RUN_TOKEN]: run.runId,
                        [HERDR_COMMAND_STARTED_AT_TOKEN]: String(run.startedAt),
                      }
                    : {}),
                },
              },
            ]
          : []),
      ],
    },
  });
}

function processInfo(idle: boolean, name = "make") {
  return JSON.stringify({
    result: {
      process_info: {
        shell_pid: 10,
        foreground_processes: idle
          ? [{ pid: 10, name: "zsh", cmdline: "zsh" }]
          : [{ pid: 11, name, cmdline: `${name} build` }],
      },
    },
  });
}

function loadExtension(
  exec: (command: string, args: string[]) => Promise<any>,
  dependencies: Record<string, unknown> = {},
) {
  const tools: Array<{
    name: string;
    description?: string;
    promptGuidelines?: string[];
    parameters?: { properties?: { waitMs?: { maximum?: number } } };
    renderCall?: (...args: any[]) => any;
    renderResult?: (...args: any[]) => any;
    renderShell?: string;
    execute: (...args: any[]) => Promise<any>;
  }> = [];
  const handlers = new Map<string, (...args: any[]) => any>();
  const entries: Array<{ customType: string; data: unknown }> = [];
  const pi = {
    registerTool(tool: {
      name: string;
      description?: string;
      promptGuidelines?: string[];
      parameters?: { properties?: { waitMs?: { maximum?: number } } };
      renderCall?: (...args: any[]) => any;
      renderResult?: (...args: any[]) => any;
      renderShell?: string;
      execute: (...args: any[]) => Promise<any>;
    }) {
      tools.push(tool);
    },
    on(event: string, handler: (...args: any[]) => any) {
      handlers.set(event, handler);
    },
    appendEntry(customType: string, data: unknown) {
      entries.push({ customType, data });
    },
    exec,
  } as unknown as ExtensionAPI;
  herdrCommandExtension(pi, dependencies);
  return { tools, handlers, entries };
}

function tool(loaded: ReturnType<typeof loadExtension>, name: string) {
  const found = loaded.tools.find((candidate) => candidate.name === name);
  assert.ok(found, `missing tool ${name}`);
  return found;
}

async function restoreSession(
  loaded: ReturnType<typeof loadExtension>,
  entries: Array<{ customType: string; data: unknown }>,
) {
  await loaded.handlers.get("session_start")?.(
    {},
    {
      sessionManager: {
        getBranch: () => entries.map((entry) => ({ type: "custom", ...entry })),
      },
    },
  );
}

test("renders compact start and status cards with expandable output", () => {
  withHerdrEnv(() => {
    const loaded = loadExtension(async () => ({ code: 0, stdout: "", stderr: "", killed: false }));
    const start = tool(loaded, START_COMMAND_TOOL_NAME);
    const startState = {};
    const startContext = {
      args: { command: "mise run validate" },
      argsComplete: true,
      cwd: "/repo",
      executionStarted: true,
      expanded: false,
      isError: false,
      isPartial: false,
      lastComponent: undefined,
      state: startState,
      toolCallId: "start-call",
    };
    const startRow = start.renderCall!(startContext.args, plainTheme, startContext);
    const startResult = start.renderResult!(
      {
        content: [{ type: "text", text: "Started" }],
        details: { state: "submitted", paneId: "wE:p2D" },
      },
      { expanded: false, isPartial: false },
      plainTheme,
      startContext,
    );

    assert.equal(start.renderShell, "self");
    assert.ok(startRow instanceof CompactToolCard);
    assert.ok(startResult instanceof EmptyToolResult);
    const startLines = startRow.render(100);
    assert.equal(startLines.length, 3);
    assert.match(startLines[1] ?? "", /➔ Command Start ● \| Command: \$ mise run validate/u);
    assert.doesNotMatch(startLines[1] ?? "", /wE:p2D|detached|words/u);

    const failedState = {};
    const failedContext = { ...startContext, isError: true, state: failedState };
    const failedRow = start.renderCall!(failedContext.args, plainTheme, failedContext);
    start.renderResult!(
      { content: [{ type: "text", text: "Herdr request failed" }] },
      { expanded: false, isPartial: false },
      plainTheme,
      failedContext,
    );
    const failedOutput = failedRow.render(100).join("\n");
    assert.match(failedOutput, /➔ Command Start ✗/u);
    assert.match(failedOutput, /Command: \$ mise run validate/u);
    assert.match(failedOutput, /failed/u);
    assert.match(failedOutput, /Herdr request failed/u);

    const status = tool(loaded, COMMAND_STATUS_TOOL_NAME);
    const statusState = {};
    const statusContext = {
      ...startContext,
      args: { waitMs: 2_000 },
      expanded: false,
      state: statusState,
      toolCallId: "status-call",
    };
    const statusRow = status.renderCall!(statusContext.args, plainTheme, statusContext);
    status.renderResult!(
      {
        content: [{ type: "text", text: "Command is still running.\n\npartial output" }],
        details: {
          state: "running",
          command: "mise run validate",
          durationMs: 5_000,
        },
      },
      { expanded: false, isPartial: false },
      plainTheme,
      statusContext,
    );
    const runningLines = statusRow.render(120);
    assert.equal(runningLines.length, 3);
    assert.match(runningLines[1] ?? "", /Command: \$ mise run validate/u);
    assert.match(runningLines[1] ?? "", /wait 2.0s · running · 5.0s/u);

    const completedResult = {
      content: [
        {
          type: "text",
          text: "Command failed.\nForeground: zsh\n\none\ntwo\nthree\nfour\nfive\nsix\ncompiler error\n\n[Recent output truncated to 120 lines / 4KB.]\n\n[The run's start marker is outside recent terminal scrollback; output may begin mid-stream.]",
        },
      ],
      details: {
        state: "completed",
        command: "mise run validate",
        exitCode: 2,
        durationMs: 14_000,
      },
    };
    const collapsed = status.renderResult!(
      completedResult,
      { expanded: false, isPartial: false },
      plainTheme,
      statusContext,
    );

    assert.ok(collapsed instanceof EmptyToolResult);
    const statusOutput = statusRow.render(120).join("\n");
    assert.match(statusOutput, /➔ Command Status ✗/u);
    assert.match(statusOutput, /Command: \$ mise run validate/u);
    assert.match(statusOutput, /exit 2 · 14s/u);
    assert.doesNotMatch(statusOutput, /wait 2.0s/u);
    assert.doesNotMatch(statusOutput, /\bone\b|\btwo\b/u);
    assert.match(statusOutput, /three/u);
    assert.match(statusOutput, /compiler error/u);
    assert.match(statusOutput, /\.\.\. 2 more lines/u);
    assert.doesNotMatch(statusOutput, /Recent output truncated|start marker/u);

    statusContext.expanded = true;
    const expanded = status.renderResult!(
      completedResult,
      { expanded: true, isPartial: false },
      plainTheme,
      statusContext,
    );
    assert.ok(expanded instanceof EmptyToolResult);
    assert.match(statusRow.render(120).join("\n"), /\bone\b/u);

    statusContext.expanded = false;
    status.renderResult!(
      {
        content: [{ type: "text", text: "Command completed.\n\nfirst line\nlast line" }],
        details: {
          state: "completed",
          command: "mise run validate",
          exitCode: 0,
          durationMs: 15_000,
        },
      },
      { expanded: false, isPartial: false },
      plainTheme,
      statusContext,
    );
    const successfulOutput = statusRow.render(120).join("\n");
    assert.match(successfulOutput, /➔ Command Status ✓/u);
    assert.match(successfulOutput, /exit 0 · 15s/u);
    assert.match(successfulOutput, /first line/u);
    assert.match(successfulOutput, /last line/u);
  });
});

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
  assert.equal(parsePaneProcessInfo(processInfo(true)).idle, true);
});

test("visible proxy reports a failing command without changing the parent cwd", async () => {
  const directory = await mkdtemp(join(tmpdir(), "herdr-proxy-test-"));
  try {
    const markers = buildRunMarkers(FIXED_RUN_ID);
    const paneCommand = buildPaneCommand("pwd; printf no-newline; exit 7", directory, markers);
    const output = execFileSync(
      "/bin/sh",
      ["-c", `cd() { printf 'interactive picker should not run\\n'; }; ${paneCommand}`],
      { encoding: "utf8" },
    );
    assert.match(output, new RegExp(`${markers.start}\\n`));
    assert.match(output, new RegExp(`no-newline\\n${markers.endPrefix}7\\n$`));
    assert.match(output, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, /interactive picker should not run/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not expose tools outside Herdr and Rex", () => {
  const previous = process.env.HERDR_ENV;
  delete process.env.HERDR_ENV;
  const rexBlock = process.env.REX_BLOCK;
  delete process.env.REX_BLOCK;
  try {
    const { tools } = loadExtension(async () => success());
    assert.deepEqual(tools, []);
  } finally {
    if (rexBlock !== undefined) process.env.REX_BLOCK = rexBlock;
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
    const loaded = withHerdrEnv(() =>
      loadExtension(
        async (command, args) => {
          assert.equal(command, "herdr");
          calls.push(args);
          if (args[0] === "pane" && args[1] === "list") return success(paneList(created));
          if (args[0] === "pane" && args[1] === "split") {
            created = true;
            return success(
              JSON.stringify({
                result: {
                  pane: {
                    pane_id: "w1:p2",
                    terminal_id: "term_command",
                    workspace_id: "w1",
                    tab_id: "w1:t1",
                  },
                },
              }),
            );
          }
          if (args[0] === "pane" && args[1] === "report-metadata") return success();
          if (args[0] === "pane" && args[1] === "rename") return success();
          if (args[0] === "pane" && args[1] === "run") {
            submitted = args[3];
            return success();
          }
          throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
        },
        {
          now: () => 1_000,
          randomUUID: () => FIXED_RUN_ID,
        },
      ),
    );

    assert.deepEqual(
      loaded.tools.map((candidate) => candidate.name),
      [START_COMMAND_TOOL_NAME, COMMAND_STATUS_TOOL_NAME],
    );
    const startTool = tool(loaded, START_COMMAND_TOOL_NAME);
    const statusTool = tool(loaded, COMMAND_STATUS_TOOL_NAME);
    assert.match(startTool.description ?? "", /return immediately/);
    assert.match(startTool.promptGuidelines?.join("\n") ?? "", /continue useful independent work/);
    assert.match(statusTool.description ?? "", /bounded wait of at most 30 minutes/);
    const statusGuidelines = statusTool.promptGuidelines?.join("\n") ?? "";
    assert.match(statusGuidelines, /instead of fixed bash sleeps/);
    assert.match(statusGuidelines, /1–2 minute wait/);
    assert.match(statusGuidelines, /at most 1–2 read-only diagnostics/);
    assert.match(statusGuidelines, /Never restart or terminate/);
    assert.equal(statusTool.parameters?.properties?.waitMs?.maximum, 30 * 60_000);
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
    assert.equal(
      calls.some((args) => args[1] === "wait-output" || args[1] === "read"),
      false,
    );

    const split = calls.find((args) => args[0] === "pane" && args[1] === "split");
    assert.ok(split);
    assert.equal(split[split.indexOf("--direction") + 1], "down");
    assert.equal(split[split.indexOf("--ratio") + 1], "0.9");
    const metadata = calls.filter((args) => args[0] === "pane" && args[1] === "report-metadata");
    assert.deepEqual(metadata[0], [
      "pane",
      "report-metadata",
      "w1:p2",
      "--source",
      HERDR_COMMAND_METADATA_SOURCE,
      "--token",
      `${HERDR_COMMAND_OWNER_TOKEN}=term_parent`,
    ]);
    assert.deepEqual(metadata[1], [
      "pane",
      "report-metadata",
      "w1:p2",
      "--source",
      HERDR_COMMAND_METADATA_SOURCE,
      "--token",
      `${HERDR_COMMAND_RUN_TOKEN}=${FIXED_RUN_ID}`,
      "--token",
      `${HERDR_COMMAND_STARTED_AT_TOKEN}=1000`,
    ]);
    assert.ok(
      calls.findIndex((args) => args === metadata[1]) <
        calls.findIndex((args) => args[0] === "pane" && args[1] === "run"),
      "run metadata must be stored before pane run",
    );
    assert.deepEqual(
      loaded.entries.map((entry) => entry.customType),
      [HERDR_COMMAND_PANE_ENTRY, HERDR_COMMAND_RUN_ENTRY],
    );
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

test("adopts a tagged command pane across Pi sessions instead of splitting", async () => {
  const calls: string[][] = [];
  const loaded = withHerdrEnv(() =>
    loadExtension(
      async (_command, args) => {
        calls.push(args);
        if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
        if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(true));
        if (args[0] === "pane" && args[1] === "rename") return success();
        if (args[0] === "pane" && args[1] === "report-metadata") return success();
        if (args[0] === "pane" && args[1] === "run") return success();
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
      {
        now: () => 1_000,
        randomUUID: () => FIXED_RUN_ID,
      },
    ),
  );

  await restoreSession(loaded, []);
  const result = await tool(loaded, START_COMMAND_TOOL_NAME).execute(
    "call",
    { command: "make build", cwd: "/", label: "build" },
    undefined,
    undefined,
    { cwd: "/" },
  );

  assert.equal(result.details.paneId, "w1:p2");
  assert.equal(
    calls.some((args) => args[0] === "pane" && args[1] === "split"),
    false,
  );
  assert.equal(
    calls.some(
      (args) =>
        args[0] === "pane" &&
        args[1] === "report-metadata" &&
        args.includes(`${HERDR_COMMAND_OWNER_TOKEN}=term_parent`),
    ),
    false,
  );
  assert.equal(
    calls.some(
      (args) =>
        args[0] === "pane" &&
        args[1] === "report-metadata" &&
        args.includes(`${HERDR_COMMAND_RUN_TOKEN}=${FIXED_RUN_ID}`),
    ),
    true,
  );
  assert.equal(
    calls.some((args) => args[0] === "pane" && args[1] === "run" && args[2] === "w1:p2"),
    true,
  );
  assert.deepEqual(
    loaded.entries.map((entry) => entry.customType),
    [HERDR_COMMAND_PANE_ENTRY, HERDR_COMMAND_RUN_ENTRY],
  );
});

test("retains run metadata when Herdr submission fails after an uncertain client response", async () => {
  const calls: string[][] = [];
  const loaded = withHerdrEnv(() =>
    loadExtension(
      async (_command, args) => {
        calls.push(args);
        if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
        if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(true));
        if (args[0] === "pane" && args[1] === "report-metadata") return success();
        if (args[0] === "pane" && args[1] === "run") {
          return { code: 1, stdout: "", stderr: "connection closed", killed: false };
        }
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
      { randomUUID: () => FIXED_RUN_ID },
    ),
  );

  await restoreSession(loaded, []);
  await assert.rejects(
    tool(loaded, START_COMMAND_TOOL_NAME).execute(
      "call",
      { command: "make build", cwd: "/" },
      undefined,
      undefined,
      { cwd: "/" },
    ),
    /herdr pane run failed: connection closed/,
  );

  const metadata = calls.find((args) => args[0] === "pane" && args[1] === "report-metadata");
  assert.ok(metadata?.includes(`${HERDR_COMMAND_RUN_TOKEN}=${FIXED_RUN_ID}`));
  assert.equal(
    calls.some((args) => args.includes("--clear-token")),
    false,
  );
});

test("recovers a silent running command from pane metadata after Pi exits before session persistence", async () => {
  const markers = buildRunMarkers(FIXED_RUN_ID);
  const loaded = withHerdrEnv(() =>
    loadExtension(
      async (_command, args) => {
        if (args[0] === "pane" && args[1] === "list") {
          return success(paneList(true, "term_parent", { runId: FIXED_RUN_ID, startedAt: 1_000 }));
        }
        if (args[0] === "pane" && args[1] === "read") return success(markers.start);
        if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(false));
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
      { now: () => 4_000 },
    ),
  );

  await restoreSession(loaded, []);
  const result = await tool(loaded, COMMAND_STATUS_TOOL_NAME).execute("call", {}, undefined);

  assert.equal(result.details.state, "running");
  assert.equal(result.details.runId, FIXED_RUN_ID);
  assert.equal(result.details.startedAt, 1_000);
  assert.equal(result.details.command, undefined);
  assert.match(result.content[0].text, /still running after 3\.0s/);
  assert.match(result.content[0].text, /\(no output yet\)/);
});

test("tags an untagged pane restored from an older Pi session", async () => {
  const calls: string[][] = [];
  const untaggedPaneList = JSON.stringify({
    result: {
      panes: [
        { pane_id: "w1:p1", terminal_id: "term_parent", workspace_id: "w1", tab_id: "w1:t1" },
        { pane_id: "w1:p2", terminal_id: "term_command", workspace_id: "w1", tab_id: "w1:t1" },
      ],
    },
  });
  const loaded = withHerdrEnv(() =>
    loadExtension(async (_command, args) => {
      calls.push(args);
      if (args[0] === "pane" && args[1] === "list") return success(untaggedPaneList);
      if (args[0] === "pane" && args[1] === "report-metadata") return success();
      throw new Error(`Unexpected args: ${args.join(" ")}`);
    }),
  );

  await restoreSession(loaded, [
    {
      customType: HERDR_COMMAND_PANE_ENTRY,
      data: { paneId: "w1:p2", terminalId: "term_command", workspaceId: "w1", tabId: "w1:t1" },
    },
  ]);

  const metadata = calls.find((args) => args[0] === "pane" && args[1] === "report-metadata");
  assert.deepEqual(metadata, [
    "pane",
    "report-metadata",
    "w1:p2",
    "--source",
    HERDR_COMMAND_METADATA_SOURCE,
    "--token",
    `${HERDR_COMMAND_OWNER_TOKEN}=term_parent`,
  ]);
});

test("does not steal a command pane owned by another Pi terminal", async () => {
  let created = false;
  const calls: string[][] = [];
  const loaded = withHerdrEnv(() =>
    loadExtension(
      async (_command, args) => {
        calls.push(args);
        if (args[0] === "pane" && args[1] === "list") {
          return success(
            JSON.stringify({
              result: {
                panes: [
                  {
                    pane_id: "w1:p1",
                    terminal_id: "term_parent",
                    workspace_id: "w1",
                    tab_id: "w1:t1",
                  },
                  {
                    pane_id: "w1:p2",
                    terminal_id: "term_foreign_command",
                    workspace_id: "w1",
                    tab_id: "w1:t1",
                    tokens: { [HERDR_COMMAND_OWNER_TOKEN]: "term_other_parent" },
                  },
                  ...(created
                    ? [
                        {
                          pane_id: "w1:p3",
                          terminal_id: "term_own_command",
                          workspace_id: "w1",
                          tab_id: "w1:t1",
                          tokens: { [HERDR_COMMAND_OWNER_TOKEN]: "term_parent" },
                        },
                      ]
                    : []),
                ],
              },
            }),
          );
        }
        if (args[0] === "pane" && args[1] === "split") {
          created = true;
          return success(
            JSON.stringify({
              result: {
                pane: {
                  pane_id: "w1:p3",
                  terminal_id: "term_own_command",
                  workspace_id: "w1",
                  tab_id: "w1:t1",
                },
              },
            }),
          );
        }
        if (args[0] === "pane" && args[1] === "report-metadata") return success();
        if (args[0] === "pane" && args[1] === "rename") return success();
        if (args[0] === "pane" && args[1] === "run") return success();
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
      { randomUUID: () => FIXED_RUN_ID },
    ),
  );

  await restoreSession(loaded, [
    {
      customType: HERDR_COMMAND_PANE_ENTRY,
      data: {
        paneId: "w1:p2",
        terminalId: "term_foreign_command",
        workspaceId: "w1",
        tabId: "w1:t1",
      },
    },
  ]);
  const result = await tool(loaded, START_COMMAND_TOOL_NAME).execute(
    "call",
    { command: "make build", cwd: "/" },
    undefined,
    undefined,
    { cwd: "/" },
  );

  assert.equal(result.details.paneId, "w1:p3");
  assert.equal(
    calls.some((args) => args[0] === "pane" && args[1] === "split"),
    true,
  );
  assert.equal(
    calls.some((args) => args[0] === "pane" && args[1] === "run" && args[2] === "w1:p2"),
    false,
  );
});

test("reports an adopted pane owned by another running session as busy", async () => {
  let runCalls = 0;
  const loaded = withHerdrEnv(() =>
    loadExtension(async (_command, args) => {
      if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
      if (args[0] === "pane" && args[1] === "process-info")
        return success(processInfo(false, "make"));
      if (args[0] === "pane" && args[1] === "run") {
        runCalls++;
        return success();
      }
      throw new Error(`Unexpected args: ${args.join(" ")}`);
    }),
  );

  await restoreSession(loaded, []);
  const result = await tool(loaded, START_COMMAND_TOOL_NAME).execute(
    "call",
    { command: "make test", cwd: "/" },
    undefined,
    undefined,
    { cwd: "/" },
  );

  assert.equal(result.details.state, "busy");
  assert.equal(result.details.runId, undefined);
  assert.equal(runCalls, 0);
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
  const loaded = withHerdrEnv(() =>
    loadExtension(
      async (_command, args) => {
        calls.push(args);
        if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
        if (args[0] === "pane" && args[1] === "read") {
          return success([markers.start, "compiling package", "still working"].join("\n"));
        }
        if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(false));
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
      { now: () => 4_000 },
    ),
  );
  await restoreSession(loaded, [
    {
      customType: HERDR_COMMAND_PANE_ENTRY,
      data: {
        paneId: "w1:p2",
        terminalId: "term_command",
        workspaceId: "w1",
        tabId: "w1:t1",
      },
    },
    { customType: HERDR_COMMAND_RUN_ENTRY, data: run },
  ]);

  const result = await tool(loaded, COMMAND_STATUS_TOOL_NAME).execute("call", {}, undefined);
  assert.equal(result.details.state, "running");
  assert.equal(result.details.durationMs, 3_000);
  assert.deepEqual(result.details.foregroundProcesses, [
    { pid: 11, name: "make", cmdline: "make build" },
  ]);
  assert.match(result.content[0].text, /still running/);
  assert.match(result.content[0].text, /compiling package/);
  assert.match(result.content[0].text, /Foreground: make/);
  assert.equal(
    calls.some((args) => args[1] === "wait-output"),
    false,
  );
});

test("reports a completed nonzero command and recovers it after session reload", async () => {
  const markers = buildRunMarkers(FIXED_RUN_ID);
  const loaded = withHerdrEnv(() =>
    loadExtension(
      async (_command, args) => {
        if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
        if (args[0] === "pane" && args[1] === "read") {
          return success(
            [markers.start, "build failed", `${markers.endPrefix}2`, "prompt"].join("\n"),
          );
        }
        if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(true));
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
      { now: () => 6_000 },
    ),
  );
  await restoreSession(loaded, [
    {
      customType: HERDR_COMMAND_PANE_ENTRY,
      data: {
        paneId: "w1:p2",
        terminalId: "term_command",
        workspaceId: "w1",
        tabId: "w1:t1",
      },
    },
    {
      customType: HERDR_COMMAND_RUN_ENTRY,
      data: {
        runId: FIXED_RUN_ID,
        terminalId: "term_command",
        command: "make build",
        cwd: "/repo",
        startedAt: 1_000,
      },
    },
  ]);

  const result = await tool(loaded, COMMAND_STATUS_TOOL_NAME).execute("call", {}, undefined);
  assert.equal(result.details.state, "completed");
  assert.equal(result.details.exitCode, 2);
  assert.match(result.content[0].text, /failed with exit code 2/);
  assert.match(result.content[0].text, /build failed/);
});

test("optionally waits for a bounded interval without turning status timeouts into errors", async () => {
  const markers = buildRunMarkers(FIXED_RUN_ID);
  const calls: string[][] = [];
  const loaded = withHerdrEnv(() =>
    loadExtension(
      async (_command, args) => {
        calls.push(args);
        if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
        if (args[0] === "pane" && args[1] === "read")
          return success([markers.start, "still building"].join("\n"));
        if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(false));
        if (args[0] === "pane" && args[1] === "wait-output") return timeout();
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
      { now: () => 4_000 },
    ),
  );
  await restoreSession(loaded, [
    {
      customType: HERDR_COMMAND_PANE_ENTRY,
      data: {
        paneId: "w1:p2",
        terminalId: "term_command",
        workspaceId: "w1",
        tabId: "w1:t1",
      },
    },
    {
      customType: HERDR_COMMAND_RUN_ENTRY,
      data: {
        runId: FIXED_RUN_ID,
        terminalId: "term_command",
        command: "make build",
        cwd: "/repo",
        startedAt: 1_000,
      },
    },
  ]);

  const result = await tool(loaded, COMMAND_STATUS_TOOL_NAME).execute(
    "call",
    { waitMs: 5_000, lines: 20 },
    undefined,
  );
  assert.equal(result.details.state, "running");
  const wait = calls.find((args) => args[0] === "pane" && args[1] === "wait-output");
  assert.ok(wait);
  assert.equal(wait[wait.indexOf("--timeout") + 1], "5000");
  assert.equal(wait[wait.indexOf("--regex") + 1], markers.endRegex);
  assert.equal(wait.includes("--match"), false);
});

test("does not submit a second command while the first launch is still reaching the shell", async () => {
  let runCalls = 0;
  const loaded = withHerdrEnv(() =>
    loadExtension(
      async (_command, args) => {
        if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
        if (args[0] === "pane" && args[1] === "process-info") return success(processInfo(true));
        if (args[0] === "pane" && args[1] === "read") return success("old shell prompt");
        if (args[0] === "pane" && args[1] === "run") {
          runCalls++;
          return success();
        }
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
      { now: () => 1_000 },
    ),
  );
  await restoreSession(loaded, [
    {
      customType: HERDR_COMMAND_PANE_ENTRY,
      data: {
        paneId: "w1:p2",
        terminalId: "term_command",
        workspaceId: "w1",
        tabId: "w1:t1",
      },
    },
    {
      customType: HERDR_COMMAND_RUN_ENTRY,
      data: {
        runId: FIXED_RUN_ID,
        terminalId: "term_command",
        command: "make build",
        cwd: "/repo",
        startedAt: 1_000,
      },
    },
  ]);

  const result = await tool(loaded, START_COMMAND_TOOL_NAME).execute(
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
  const loaded = withHerdrEnv(() =>
    loadExtension(async (_command, args) => {
      if (args[0] === "pane" && args[1] === "list") return success(paneList(true));
      if (args[0] === "pane" && args[1] === "process-info")
        return success(processInfo(false, "go"));
      if (args[0] === "pane" && args[1] === "run") {
        runCalls++;
        return success();
      }
      throw new Error(`Unexpected args: ${args.join(" ")}`);
    }),
  );
  await restoreSession(loaded, [
    {
      customType: HERDR_COMMAND_PANE_ENTRY,
      data: {
        paneId: "w1:p2",
        terminalId: "term_command",
        workspaceId: "w1",
        tabId: "w1:t1",
      },
    },
    {
      customType: HERDR_COMMAND_RUN_ENTRY,
      data: {
        runId: FIXED_RUN_ID,
        terminalId: "term_command",
        command: "go test ./...",
        cwd: "/repo",
        startedAt: 1_000,
      },
    },
  ]);

  const result = await tool(loaded, START_COMMAND_TOOL_NAME).execute(
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
  const loaded = withHerdrEnv(() =>
    loadExtension(async () => {
      throw new Error("Herdr should not be called");
    }),
  );
  const result = await tool(loaded, COMMAND_STATUS_TOOL_NAME).execute("call", {}, undefined);
  assert.equal(result.details.state, "none");
  assert.match(result.content[0].text, /No command is tracked/);
});
