import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { codemodeCards } from "../codemode.ts";

initTheme("dark", false);
const { codemodeRenderers } = await import(
  new URL(
    "./extensions/codemode/renderer.js",
    import.meta.resolve("@earendil-works/pi-coding-agent"),
  ).href
);
const theme = { fg: (_: string, value: string) => value };
const result = (text: string) => ({ content: [{ type: "text", text }], details: undefined });
function setup() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const renderer = codemodeCards({
    on(name: string, handler: (...args: any[]) => any) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI)(codemodeRenderers);
  const emit = (name: string, event: any) => handlers.get(name)?.(event, { cwd: "/repo" });
  const context = {
    args: {
      code: 'text(await tools.edit({path:"README.md",edits:[{oldText:"secret source",newText:"new"}]}));',
    },
    toolCallId: "script",
    cwd: "/repo",
    state: {} as any,
    argsComplete: true,
    executionStarted: true,
    expanded: false,
    isError: false,
    isPartial: true,
    showImages: false,
    durationMs: undefined,
    outputPad: 0,
    keyText: () => "ctrl+o",
    keyHint: (_key: unknown, description: string) => `ctrl+o ${description}`,
    lastComponent: undefined,
    invalidate() {},
  };
  emit("tool_execution_start", { toolCallId: "script", toolName: "codemode" });
  const card = renderer.renderCall!(context.args, theme as any, context);
  function render(
    details: any,
    content: any[] = [],
    partial = false,
    expanded = false,
    failed = false,
  ) {
    renderer.renderResult!({ details, content }, { expanded, isPartial: partial }, theme as any, {
      ...context,
      expanded,
      isPartial: partial,
      isError: failed,
    });
    return card.render(100).join("\n");
  }
  return { emit, context, card, render, renderer };
}

test("collapsed batches show actions and child failures instead of script and argument JSON", () => {
  const { emit, render, card } = setup();
  emit("tool_execution_start", {
    parentToolCallId: "script",
    toolCallId: "script/1",
    toolName: "edit",
    args: { path: "README.md", edits: [{ oldText: "secret source", newText: "new" }] },
  });
  emit("tool_execution_end", {
    parentToolCallId: "script",
    toolCallId: "script/1",
    toolName: "edit",
    isError: false,
    result: result("Successfully replaced 1 block"),
  });
  emit("tool_execution_start", {
    parentToolCallId: "script",
    toolCallId: "script/2",
    toolName: "bash",
    args: { command: "npm run format && npm run test:pi-ui" },
  });
  const output =
    Array.from({ length: 60 }, (_, i) => `✔ passing test ${i}`).join("\n") +
    "\nℹ tests 46\nℹ pass 45\nℹ fail 1\n✖ failing tests:\n✖ codemode renders output\nError: Theme not initialized. Call initTheme() first.\n    at renderer.js:31\nCommand exited with code 1";
  emit("tool_execution_end", {
    parentToolCallId: "script",
    toolCallId: "script/2",
    toolName: "bash",
    isError: true,
    result: result(output),
  });
  const details = {
    calls: [
      {
        id: "script/1",
        name: "edit",
        args: '{"path":"README.md","edits":[{"oldT...',
        status: "ok",
        durationMs: 3,
      },
      {
        id: "script/2",
        name: "bash",
        args: '{"command":"npm run format && npm run test:pi-ui"}',
        status: "error",
        durationMs: 3700,
        error: output,
      },
    ],
  };
  const displayed = render(details);
  assert.match(displayed, /Tool calls · 1 failed/u);
  assert.match(displayed, /✓ Edit  README.md/u);
  assert.match(displayed, /✗ Run  npm run format && npm run test:pi-ui/u);
  assert.match(displayed, /ℹ pass 45/u);
  assert.match(displayed, /ℹ fail 1/u);
  assert.match(displayed, /Error: Theme not initialized/u);
  assert.doesNotMatch(displayed, /secret source|oldText|text\(await|passing test 0|words/u);
  assert.ok(card.render(40).every((line) => visibleWidth(line) <= 40));

  const persisted = emit("tool_result", {
    toolCallId: "script",
    toolName: "codemode",
    details,
    content: [],
  });
  emit("tool_execution_end", { toolCallId: "script", toolName: "codemode" });
  // History reconstructs the same actionable display after all live event state is gone.
  const restored = setup();
  restored.emit("session_start", {});
  const history = restored.render(JSON.parse(JSON.stringify(persisted.details)));
  assert.equal(history, displayed);
});

test("successful batches stay compact and expansion retains native script and complete output", () => {
  const { render, card } = setup();
  const details = {
    calls: [
      {
        id: "script/1",
        name: "edit",
        args: '{"path":"README.md","edits":[{"oldText":"long...',
        status: "ok",
        durationMs: 7,
      },
      {
        id: "script/2",
        name: "bash",
        args: '{"command":"git diff --check; pi list"}',
        status: "ok",
        durationMs: 436,
      },
      {
        id: "script/3",
        name: "read",
        args: '{"path":"/repo/settings.json"}',
        status: "ok",
        durationMs: 1,
      },
    ],
  };
  const content = [
    { type: "text", text: "Script completed\nWall time 0.5 seconds\nOutput:\n" },
    { type: "text", text: "x".repeat(1000) },
  ];
  const collapsed = render(details, content);
  assert.match(collapsed, /Tool calls · completed/u);
  assert.match(collapsed, /Edit  README.md/u);
  assert.match(collapsed, /Run  git diff --check; pi list/u);
  assert.match(collapsed, /Read  settings.json/u);
  assert.ok(card.render(100).length <= 8);
  assert.doesNotMatch(collapsed, /oldText|Script completed|xxxx|words/u);
  const expanded = render(details, content, false, true);
  assert.match(expanded, /Script/u);
  assert.match(expanded, /secret source/u);
  assert.match(expanded, /Full result/u);
  assert.match(expanded, /xxxxx/u);
  assert.ok(card.render(40).every((line) => visibleWidth(line) <= 40));
  assert.ok(card.render(40).length > 30);
});

test("successful command summaries keep pass counts ahead of the timing footer", () => {
  const { emit, render } = setup();
  emit("tool_execution_start", {
    parentToolCallId: "script",
    toolCallId: "script/1",
    toolName: "bash",
    args: { command: "npm run test:pi-ui" },
  });
  emit("tool_execution_end", {
    parentToolCallId: "script",
    toolCallId: "script/1",
    toolName: "bash",
    isError: false,
    result: result(
      "ℹ tests 50\nℹ suites 0\nℹ pass 50\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 4000",
    ),
  });
  const display = render({
    calls: [{ id: "script/1", name: "bash", args: "{}", status: "ok" }],
  });
  assert.match(display, /ℹ pass 50/u);
  assert.match(display, /ℹ fail 0/u);
  assert.doesNotMatch(display, /duration_ms|cancelled|skipped/u);
});

test("running commands show recent progress and request a parent redraw", () => {
  const { emit, render, context, renderer } = setup();
  let redraws = 0;
  context.invalidate = () => {
    redraws++;
  };
  // Install the live row callback through a normal call render.
  renderer.renderCall!(context.args, theme as any, context);
  emit("tool_execution_start", {
    parentToolCallId: "script",
    toolCallId: "script/1",
    toolName: "bash",
    args: { command: "mise run validate" },
  });
  const partial = {
    calls: [
      { id: "script/?", name: "bash", args: '{"command":"mise run validate"}', status: "running" },
    ],
  };
  assert.match(render(partial, [], true), /Tool calls · running/u);
  emit("tool_execution_update", {
    parentToolCallId: "script",
    toolCallId: "script/1",
    toolName: "bash",
    partialResult: result("Installing dependencies\nRunning tests"),
  });
  const displayed = render(partial, [], true);
  assert.match(displayed, /● Run  mise run validate/u);
  assert.match(displayed, /Running tests/u);
  assert.doesNotMatch(displayed, /completed/u);
  assert.equal(redraws, 1);
});

test("hidden earlier reads do not mislabel running calls and multiline commands keep one row", () => {
  const { emit, render, card } = setup();
  const calls = Array.from({ length: 12 }, (_, i) => {
    emit("tool_execution_start", {
      parentToolCallId: "script",
      toolCallId: `script/${i}`,
      toolName: "read",
      args: { path: `source-${i}.ts` },
    });
    return { id: "script/?", name: "read", args: '{"path":"truncated', status: "running" };
  });
  const display = render({ calls }, [], true);
  assert.match(display, /4 actions hidden/u);
  assert.match(display, /Read  source-11.ts/u);
  assert.doesNotMatch(display, /Read  source-0.ts/u);
  emit("tool_execution_start", {
    parentToolCallId: "script",
    toolCallId: "script/command",
    toolName: "bash",
    args: { command: "set -eu\nnpm run test:pi-ui" },
  });
  render(
    { calls: [{ id: "script/command", name: "bash", args: "{}", status: "running" }] },
    [],
    true,
  );
  assert.match(card.render(100).join("\n"), /Run  set -eu npm run test:pi-ui/u);
  assert.ok(card.render(100).every((line) => !line.includes("\n") && visibleWidth(line) <= 100));
});

test("script-only output, cancellation, and early failures remain visible in bounded cards", () => {
  const { render, card } = setup();
  assert.match(
    render(
      { calls: [] },
      [{ type: "text", text: "Script error:\nSyntaxError: Unexpected token" }],
      false,
      false,
      true,
    ),
    /script failed/u,
  );
  assert.match(card.render(100).join("\n"), /SyntaxError/u);
  assert.match(
    render({ calls: [] }, [{ type: "text", text: "Generated report: /tmp/report.md" }]),
    /Generated report/u,
  );
  const calls = Array.from({ length: 30 }, (_, i) => ({
    id: `script/${i}`,
    name: "read",
    args: JSON.stringify({ path: `file-${i}.ts` }),
    status: i === 0 ? "error" : "ok",
    error: i === 0 ? "Permission denied" : undefined,
  }));
  const display = render({ calls });
  assert.match(display, /1 failed/u);
  assert.match(display, /file-0.ts/u);
  assert.match(display, /Permission denied/u);
  assert.match(display, /actions hidden/u);
  assert.ok(card.render(100).length < 20);
  assert.match(
    render({
      calls: [{ id: "script/1", name: "read", args: '{"path":"README.md"}', status: "cancelled" }],
    }),
    /1 cancelled/u,
  );
});
