import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import commandRunner from "../index.ts";
import { CompactToolCard } from "../../pi-ui/tool-cards/rendering.ts";
import {
  buildRunMarkers,
  HERDR_COMMAND_OWNER_TOKEN,
  HERDR_COMMAND_PANE_ENTRY,
  HERDR_COMMAND_RUN_ENTRY,
  HERDR_COMMAND_RUN_TOKEN,
  HERDR_COMMAND_STARTED_AT_TOKEN,
} from "../command-runner.ts";

const run = {
  runId: "12345678-1234-1234-1234-123456789abc",
  terminalId: "command-terminal",
  command: "make test",
  cwd: process.cwd(),
  startedAt: 1_000,
};
const pane = {
  paneId: "command",
  terminalId: run.terminalId,
  workspaceId: "workspace",
  tabId: "tab",
};
const saved = [
  { customType: HERDR_COMMAND_PANE_ENTRY, data: pane },
  { customType: HERDR_COMMAND_RUN_ENTRY, data: run },
];
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "", killed: false });

function fixture(nextRunId = run.runId) {
  let currentRunId = run.runId;
  let observedAt = 10_000;
  let scheduled: (() => Promise<void>) | undefined;
  let transcript = `${buildRunMarkers(run.runId).start}\nbuilding`;
  let idle = false;
  let present = true;
  let error = false;
  let submissionError = false;
  let deliveryError = false;
  let readHook: (() => Promise<void>) | undefined;
  let backendRun = run;
  const messages: any[] = [];
  const notices: string[] = [];
  const entries: any[] = [];
  const calls: string[][] = [];
  const handlers = new Map<string, (...args: any[]) => any>();
  const tools = new Map<string, any>();
  const renderers = new Map<string, any>();
  const env = { ...process.env };
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "caller";
  process.env.HERDR_WORKSPACE_ID = "workspace";
  try {
    commandRunner(
      {
        registerTool: (tool: any) => tools.set(tool.name, tool),
        registerMessageRenderer: (name: string, renderer: any) => renderers.set(name, renderer),
        on: (event: string, handler: (...args: any[]) => any) => handlers.set(event, handler),
        appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
        sendMessage: (message: any, options: any) => {
          if (deliveryError) throw new Error("delivery unavailable");
          messages.push({ ...message, options });
        },
        exec: async (_command: string, args: string[], options?: { signal?: AbortSignal }) => {
          options?.signal?.throwIfAborted();
          calls.push(args);
          if (error) throw new Error("backend unavailable");
          switch (args[1]) {
            case "list":
              return ok(
                JSON.stringify({
                  result: {
                    panes: [
                      {
                        pane_id: "caller",
                        terminal_id: "caller-terminal",
                        workspace_id: "workspace",
                        tab_id: "tab",
                      },
                      ...(present
                        ? [
                            {
                              pane_id: pane.paneId,
                              terminal_id: pane.terminalId,
                              workspace_id: "workspace",
                              tab_id: "tab",
                              tokens: {
                                [HERDR_COMMAND_OWNER_TOKEN]: "caller-terminal",
                                [HERDR_COMMAND_RUN_TOKEN]: backendRun.runId,
                                [HERDR_COMMAND_STARTED_AT_TOKEN]: String(backendRun.startedAt),
                              },
                            },
                          ]
                        : []),
                    ],
                  },
                }),
              );
            case "read": {
              const snapshot = transcript;
              if (readHook) await readHook();
              return ok(snapshot);
            }
            case "process-info":
              return ok(
                JSON.stringify({
                  result: {
                    process_info: {
                      shell_pid: 10,
                      foreground_processes: [{ pid: idle ? 10 : 11, name: idle ? "zsh" : "make" }],
                    },
                  },
                }),
              );
            case "run":
              currentRunId = nextRunId;
              idle = false;
              transcript = `${buildRunMarkers(currentRunId).start}\nbuilding`;
              if (submissionError) throw new Error("submission response lost");
              return ok();
            case "rename":
            case "report-metadata":
              return ok();
            default:
              throw new Error(`Unexpected backend call ${args.join(" ")}`);
          }
        },
      } as unknown as ExtensionAPI,
      {
        now: () => observedAt,
        randomUUID: () => nextRunId,
        schedule: (callback) => {
          scheduled = callback;
          return () => {
            if (scheduled === callback) scheduled = undefined;
          };
        },
      },
    );
  } finally {
    process.env = env;
  }
  const context = (history: any[], mode = "tui") => ({
    cwd: process.cwd(),
    mode,
    ui: { notify: (message: string) => notices.push(message) },
    sessionManager: { getBranch: () => history.map((entry) => ({ type: "custom", ...entry })) },
  });
  return {
    messages,
    render(message: any, expanded = false) {
      return renderers.get("command-result")(
        message,
        { expanded, outputPad: 0 },
        {
          fg: (_color: string, text: string) => text,
        },
      );
    },
    notices,
    entries,
    calls,
    restore: (history = saved, mode = "tui", event = "session_start") =>
      handlers.get(event)!({}, context(history, mode)),
    shutdown: () => handlers.get("session_shutdown")!({ reason: "reload" }),
    start: (mode = "tui") =>
      tools
        .get("start_command")
        .execute("start", { command: run.command }, undefined, undefined, context([], mode)),
    status: (signal?: AbortSignal) => tools.get("command_status").execute("status", {}, signal),
    async tick() {
      const callback = scheduled;
      scheduled = undefined;
      assert.ok(callback, "watcher scheduled");
      await callback();
    },
    get watching() {
      return !!scheduled;
    },
    elapse(ms: number) {
      observedAt += ms;
    },
    complete(code = 0) {
      idle = true;
      transcript = `${buildRunMarkers(currentRunId).start}\n${Array.from({ length: 50 }, (_, i) => `output ${i}`).join("\n")}\n${buildRunMarkers(currentRunId).endPrefix}${code}`;
    },
    lose() {
      present = false;
    },
    fail() {
      error = true;
    },
    loseSubmission() {
      submissionError = true;
    },
    failDelivery() {
      deliveryError = true;
    },
    idleWithoutMarker() {
      idle = true;
    },
    setReadHook(hook: () => Promise<void>) {
      readHook = hook;
    },
    replaceRun() {
      backendRun = { ...run, runId: "aaaaaaaa-1234-1234-1234-123456789abc" };
    },
  };
}

test("automatically watches a newly submitted command without blocking start", async () => {
  const f = fixture();
  await f.restore([]);
  f.complete(); // The existing pane must be idle before submission.
  const result = await f.start();
  assert.equal(result.details.state, "submitted");
  assert.match(result.content[0].text, /Completion will arrive automatically/);
  assert.equal(f.messages.length, 0);
  assert.equal(f.watching, true);
  f.complete();
  await f.tick();
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].details.exitCode, 0);
});

for (const code of [0, 2]) {
  test(`notifies once with exit ${code} and bounded output, then deduplicates after reload`, async () => {
    const f = fixture();
    await f.restore();
    await f.tick();
    assert.equal(f.messages.length, 0);
    assert.equal(f.watching, true);
    assert.equal(
      f.calls.some((args) => args[1] === "wait-output"),
      false,
    );
    f.complete(code);
    await f.tick();
    assert.equal(f.messages.length, 1);
    const message = f.messages[0];
    assert.deepEqual(message.options, { deliverAs: "followUp", triggerTurn: true });
    assert.equal(message.details.exitCode, code);
    assert.match(message.content, /make test/);
    assert.match(message.content, /output 49/);
    assert.doesNotMatch(message.content, /output 0\n/);
    assert.equal(f.watching, false);
    await f.shutdown();
    await f.restore([...saved, ...f.entries]);
    assert.equal(f.watching, false);
    assert.equal(f.messages.length, 1);
  });
}

test("explicit completed status acknowledges the result without a duplicate follow-up", async () => {
  const f = fixture();
  await f.restore();
  f.complete();
  assert.equal((await f.status()).details.state, "completed");
  assert.equal(f.watching, false);
  assert.equal(f.messages.length, 0);
  await f.restore([...saved, ...f.entries]);
  assert.equal(f.watching, false);
});

for (const failure of ["lose", "fail"] as const) {
  test(`reports unavailable tracking instead of success when backend ${failure}s`, async () => {
    const f = fixture();
    await f.restore();
    f[failure]();
    await f.tick();
    assert.equal(f.messages[0].details.state, "lost");
    assert.equal(f.messages[0].details.exitCode, undefined);
    assert.equal(f.watching, false);
    assert.equal(
      f.calls.some((args) => args[1] === "run"),
      false,
    );
  });
}

test("uncertain submission response retains its watcher and never resubmits", async () => {
  const f = fixture();
  await f.restore([]);
  f.complete();
  f.loseSubmission();
  await assert.rejects(f.start(), /submission response lost/);
  assert.equal(f.watching, true);
  f.complete();
  await f.tick();
  assert.equal(f.messages[0].details.exitCode, 0);
  assert.equal(f.calls.filter((args) => args[1] === "run").length, 1);
});

test("shutdown invalidates in-flight observations before they can notify another session", async () => {
  const f = fixture();
  await f.restore();
  f.complete();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.setReadHook(async () => {
    entered();
    await pending;
  });
  const tick = f.tick();
  await reading;
  const shutdown = f.shutdown();
  release();
  await Promise.all([tick, shutdown]);
  assert.equal(f.messages.length, 0);
  assert.equal(f.watching, false);
});

test("adoption in a new conversation does not subscribe to a previous session's run", async () => {
  const f = fixture();
  await f.restore([]);
  assert.equal(f.watching, false);
});

test("tree navigation restores the branch subscription and reports replaced tracking", async () => {
  const f = fixture();
  await f.restore();
  f.replaceRun();
  await f.restore(saved, "tui", "session_tree");
  await f.tick();
  assert.equal(f.messages[0].details.runId, run.runId);
  assert.equal(f.messages[0].details.state, "lost");
});

for (const mode of ["print", "json"]) {
  test(`${mode} sessions do not promise automatic notifications`, async () => {
    const f = fixture();
    await f.restore([], mode);
    f.complete();
    const result = await f.start(mode);
    assert.match(result.content[0].text, /notifications are unavailable/);
    assert.equal(f.watching, false);
  });
}

test("RPC sessions receive completion follow-ups", async () => {
  const f = fixture();
  await f.restore(saved, "rpc");
  f.complete();
  await f.tick();
  assert.equal(f.messages[0].details.exitCode, 0);
});

test("cancelling a status check leaves the background watcher active", async () => {
  const f = fixture();
  await f.restore();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.status(controller.signal));
  assert.equal(f.watching, true);
  f.complete();
  await f.tick();
  assert.equal(f.messages[0].details.exitCode, 0);
});

test("an idle shell without a completion marker reports unavailable tracking", async () => {
  const f = fixture();
  await f.restore();
  f.idleWithoutMarker();
  await f.tick();
  assert.equal(f.messages[0].details.state, "lost");
  assert.equal(f.messages[0].details.exitCode, undefined);
});

test("completion between transcript and process inspection is reread before declaring lost", async () => {
  const f = fixture();
  await f.restore();
  f.setReadHook(async () => {
    f.complete(2);
  });
  await f.tick();
  assert.equal(f.messages[0].details.state, "completed");
  assert.equal(f.messages[0].details.exitCode, 2);
});

test("delivery errors stop monitoring visibly without an unhandled rejection", async () => {
  const f = fixture();
  await f.restore();
  f.complete();
  f.failDelivery();
  await f.tick();
  assert.equal(f.watching, false);
  assert.equal(f.messages.length, 0);
  assert.match(f.notices[0], /delivery unavailable.*command_status/);
});

test("reusing the pane delivers the previous outcome before submitting another command", async () => {
  const nextRunId = "bbbbbbbb-1234-1234-1234-123456789abc";
  const f = fixture(nextRunId);
  await f.restore();
  f.complete(2);
  const result = await f.start();
  assert.equal(result.details.state, "submitted");
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].details.exitCode, 2);
  assert.equal(f.watching, true);
  f.complete();
  await f.tick();
  assert.equal(f.messages[1].details.runId, nextRunId);
  assert.equal(f.messages[1].details.exitCode, 0);
});

for (const code of [0, 2]) {
  test(`completion card with exit ${code} previews output and expands retained details`, async () => {
    const f = fixture();
    await f.restore();
    f.complete(code);
    await f.tick();
    const message = f.messages[0];
    const original = JSON.stringify(message);
    const card = f.render(message);
    assert.ok(card instanceof CompactToolCard);
    const collapsed = card.render(120).join("\n");
    assert.match(
      collapsed,
      new RegExp(`Command Result ${code === 0 ? "✓" : "✗"}.*exit ${code}.*9.0s`),
    );
    assert.match(collapsed, /Command: \$ make test/);
    assert.match(collapsed, /output 49/);
    assert.doesNotMatch(collapsed, /output 30\s/);
    assert.match(collapsed, /more lines, press/);
    const expanded = f.render(message, true).render(120).join("\n");
    assert.match(expanded, /output 30\s/);
    assert.match(expanded, /Recent output truncated/);
    assert.equal(
      JSON.stringify(message),
      original,
      "rendering must preserve the model-facing notification",
    );
  });
}

test("lost tracking card shows warning and diagnostic text without implying success", async () => {
  const f = fixture();
  await f.restore();
  f.fail();
  await f.tick();
  const card = f.render(f.messages[0]).render(160).join("\n");
  assert.match(card, /Command Result !.*lost/);
  assert.match(card, /backend unavailable/);
  assert.doesNotMatch(card, /✓|exit 0/);
});

test("notifications without structured details retain Pi's default rendering", () => {
  const f = fixture();
  assert.equal(f.render({ content: "Historical notification" }), undefined);
});

test("late completion discovery reports observation age rather than claiming execution duration", async () => {
  const f = fixture();
  f.complete();
  f.elapse(60 * 60_000);
  await f.restore();
  await f.tick();
  const message = f.messages[0];
  assert.match(message.content, /completed successfully, observed 3609.0s after submission/);
  const card = f.render(message).render(160).join("\n");
  assert.match(card, /exit 0.*observed after 3609s/);
});

test("saved completion cards render without an active terminal backend", async () => {
  const f = fixture();
  await f.restore();
  f.complete();
  await f.tick();
  let renderer: any;
  const previous = { ...process.env };
  try {
    delete process.env.HERDR_ENV;
    delete process.env.REX_BLOCK;
    commandRunner({
      registerMessageRenderer: (_name: string, render: any) => {
        renderer = render;
      },
      registerTool: () => assert.fail("No backend tools should be registered"),
    } as unknown as ExtensionAPI);
  } finally {
    process.env = previous;
  }
  const card = renderer(
    f.messages[0],
    { expanded: false, outputPad: 0 },
    {
      fg: (_color: string, text: string) => text,
    },
  );
  assert.ok(card instanceof CompactToolCard);
  assert.match(card.render(120).join("\n"), /Command Result ✓.*exit 0/);
});
