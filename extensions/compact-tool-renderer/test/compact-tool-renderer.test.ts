import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import compactToolRendererExtension from "../index.ts";
import {
  CompactToolRow,
  describeToolCall,
  EmptyToolResult,
  hasExpandableResult,
  renderCompactDescription,
  renderCompactRow,
  summarizeToolResult,
  type CompactTheme,
} from "../rendering.ts";

const plainTheme: CompactTheme = {
  fg: (_color, text) => text,
};

test("describes built-in calls without their full arguments", () => {
  assert.equal(describeToolCall("bash", { command: "mise run build" }, "/repo"), "mise run build");
  assert.equal(
    describeToolCall("read", { path: "/repo/src/index.ts", offset: 10, limit: 5 }, "/repo"),
    "Explored src/index.ts:10-14",
  );
  assert.equal(
    describeToolCall("edit", { path: "src/index.ts", edits: [{}, {}] }, "/repo"),
    "Edited src/index.ts · 2 changes",
  );
  assert.equal(
    describeToolCall("grep", { pattern: "renderCall", path: "extensions" }, "/repo"),
    "Explored /renderCall/ in extensions",
  );
  assert.equal(
    describeToolCall("write", { path: "README.md", content: "one line" }, "/repo"),
    "Edited README.md · 1 line",
  );
});

test("makes local file rows clickable without changing their visible text", () => {
  const rendered = renderCompactRow(
    "read",
    { path: "src/index.ts" },
    "/repo",
    {
      argsComplete: true,
      executionStarted: true,
      expanded: false,
      isError: false,
      isPartial: false,
    },
    undefined,
    plainTheme,
  );

  assert.match(rendered.text, /file:\/\/\/repo\/src\/index\.ts/u);
  assert.match(rendered.text, /Explored src\/index\.ts/u);
});

test("summarizes results for the compact row", () => {
  assert.equal(
    summarizeToolResult("bash", { content: [{ type: "text", text: "one" }] }),
    undefined,
  );
  assert.equal(
    summarizeToolResult(
      "bash",
      { content: [{ type: "text", text: "(no output)\n\nCommand exited with code 7" }] },
      true,
    ),
    "exit code: 7",
  );
  assert.equal(
    summarizeToolResult("read", { content: [{ type: "text", text: "one\ntwo\nthree" }] }),
    "3 lines",
  );
  assert.equal(
    summarizeToolResult("find", { content: [{ type: "text", text: "a.ts\nb.ts" }] }),
    "2 files",
  );
  assert.equal(
    summarizeToolResult("grep", { content: [{ type: "text", text: "match\ncontext" }] }),
    "2 results",
  );
  assert.equal(
    summarizeToolResult("edit", {
      content: [{ type: "text", text: "done" }],
      details: { diff: "--- a\n+++ b\n-old\n+new\n+more" },
    }),
    "+2 -1",
  );
});

test("shows disclosure only for useful expandable output", () => {
  assert.equal(
    hasExpandableResult("bash", { content: [{ type: "text", text: "(no output)" }] }),
    false,
  );
  assert.equal(
    hasExpandableResult("bash", { content: [{ type: "text", text: "compiler output" }] }),
    true,
  );
  assert.equal(
    hasExpandableResult("bash", {
      content: [{ type: "text", text: "(no output)\n\nCommand exited with code 1" }],
    }),
    false,
  );
  assert.equal(
    hasExpandableResult("write", { content: [{ type: "text", text: "Permission denied" }] }, true),
    true,
  );
  const rendered = renderCompactRow(
    "bash",
    { command: "mkdir -p output" },
    "/repo",
    {
      argsComplete: true,
      executionStarted: true,
      expanded: false,
      expandable: false,
      isError: false,
      isPartial: false,
    },
    undefined,
    plainTheme,
  );
  assert.deepEqual(new CompactToolRow().update(rendered.text, rendered.suffix).render(80), [
    "$ mkdir -p output",
  ]);

  const failed = renderCompactRow(
    "bash",
    { command: "git grep missing" },
    "/repo",
    {
      argsComplete: true,
      executionStarted: true,
      expanded: false,
      expandable: false,
      isError: true,
      isPartial: false,
    },
    "exit code: 1",
    plainTheme,
  );
  assert.deepEqual(new CompactToolRow().update(failed.text, failed.suffix).render(80), [
    "$ git grep missing · exit code: 1",
  ]);
});

test("uses semantic status, normal text, and muted metadata colors", () => {
  const themed: CompactTheme = {
    fg: (color, text) => `<${color}>${text}</${color}>`,
  };
  assert.deepEqual(
    renderCompactDescription(
      "Explored src/index.ts",
      { symbol: "✓", color: "success", expanded: false },
      "42 lines",
      themed,
    ),
    {
      text: "<success>✓</success> <text>Explored src/index.ts</text><muted> · 42 lines</muted>",
      suffix: "<muted> ▸</muted>",
    },
  );
});

test("renders status, summary, and disclosure marker on one bounded line", () => {
  const rendered = renderCompactRow(
    "bash",
    { command: "mise run build" },
    "/repo",
    {
      argsComplete: true,
      executionStarted: true,
      expanded: false,
      isError: false,
      isPartial: false,
    },
    undefined,
    plainTheme,
  );
  const row = new CompactToolRow().update(rendered.text, rendered.suffix);

  assert.deepEqual(row.render(80), ["$ mise run build ▸"]);
  assert.ok(visibleWidth(row.render(20)[0]) <= 20);
  assert.match(row.render(20)[0], / ▸$/u);
});

test("registers compact renderers before session_start so reload can rebuild history", () => {
  const registered: any[] = [];
  const listeners = new Map<string, (value: unknown) => void>();
  const pi = {
    on() {},
    registerTool(definition: any) {
      registered.push(definition);
    },
    events: {
      on(name: string, handler: (value: unknown) => void) {
        listeners.set(name, handler);
        return () => listeners.delete(name);
      },
      emit(name: string, value: unknown) {
        listeners.get(name)?.(value);
      },
    },
  } as unknown as ExtensionAPI;

  compactToolRendererExtension(pi);

  assert.deepEqual(
    registered.map((definition) => definition.name),
    ["bash", "read", "edit", "write", "grep", "find", "ls"],
  );
  assert.equal(registered[0].renderShell, "self");

  const state = {};
  const context = {
    args: { command: "mise run build" },
    argsComplete: true,
    cwd: "/repo",
    executionStarted: true,
    expanded: false,
    isError: false,
    isPartial: false,
    lastComponent: undefined,
    state,
  };
  const row = registered[0].renderCall(context.args, plainTheme, context);
  const result = registered[0].renderResult(
    { content: [{ type: "text", text: "one\ntwo" }] },
    { expanded: false, isPartial: false },
    plainTheme,
    { ...context, lastComponent: undefined },
  );

  assert.ok(row instanceof CompactToolRow);
  assert.ok(result instanceof EmptyToolResult);
  assert.deepEqual(row.render(80), ["$ mise run build ▸"]);
});
