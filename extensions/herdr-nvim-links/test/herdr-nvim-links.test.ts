import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import herdrNvimLinksExtension from "../index.ts";
import {
  buildHerdrNvimUrl,
  HerdrNvimLinkComponent,
  rewriteFileHyperlinks,
  rewriteFileUrlsInMarkdown,
  type HerdrLinkContext,
} from "../herdr-nvim-links.ts";

const context: HerdrLinkContext = {
  sourcePane: "w1:p1",
  workspace: "w1",
  tab: "w1:t1",
  cwd: "/repo with spaces",
  socket: "/tmp/herdr.sock",
  line: 42,
};

function withHerdrEnvironment<T>(fn: () => T): T {
  const previous = { ...process.env };
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "w1:p1";
  process.env.HERDR_WORKSPACE_ID = "w1";
  process.env.HERDR_TAB_ID = "w1:t1";
  process.env.HERDR_SOCKET_PATH = "/tmp/herdr.sock";
  try {
    return fn();
  } finally {
    process.env = previous;
  }
}

test("builds a percent-encoded Herdr Neovim URL", () => {
  const result = new URL(buildHerdrNvimUrl("file:///repo%20with%20spaces/main.ts", context));
  assert.equal(result.protocol, "herdr-nvim:");
  assert.equal(result.host, "open");
  assert.equal(result.searchParams.get("file"), "file:///repo%20with%20spaces/main.ts");
  assert.equal(result.searchParams.get("sourcePane"), "w1:p1");
  assert.equal(result.searchParams.get("workspace"), "w1");
  assert.equal(result.searchParams.get("tab"), "w1:t1");
  assert.equal(result.searchParams.get("cwd"), "/repo with spaces");
  assert.equal(result.searchParams.get("socket"), "/tmp/herdr.sock");
  assert.equal(result.searchParams.get("line"), "42");
});

test("rewrites BEL- and ST-terminated file hyperlinks only", () => {
  const bel = "\x1b]8;;file:///repo/a.ts\x07a.ts\x1b]8;;\x07";
  const st = "\x1b]8;id=x;file:///repo/b.ts\x1b\\b.ts\x1b]8;;\x1b\\";
  const web = "\x1b]8;;https://example.com\x07example\x1b]8;;\x07";
  const rewritten = rewriteFileHyperlinks(`${bel} ${st} ${web}`, context);

  assert.match(rewritten, /herdr-nvim:\/\/open\?/);
  assert.match(rewritten, /id=x;herdr-nvim:\/\/open\?/);
  assert.match(rewritten, /https:\/\/example\.com/);
  assert.ok(rewritten.includes("\u001b]8;;\u0007"));
  assert.ok(rewritten.includes("\u001b]8;;\u001b\\"));
});

test("rewrites file URLs throughout Markdown without changing visible labels", () => {
  const markdown = [
    '[source](file:///repo/main.ts "Main source")',
    "<file:///repo/README.md>",
    "See file:///repo/config.json.",
    "Keep https://example.com and file://server/share unchanged.",
    "[file:///repo/label.ts](https://example.com/file)",
    "[remote](file://server/share)",
  ].join("\n\n");
  const rewritten = rewriteFileUrlsInMarkdown(markdown, context);

  assert.match(rewritten, /^\[source\]\(herdr-nvim:\/\/open\?/);
  assert.match(rewritten, /"Main source"\)/);
  assert.match(rewritten, /\[file:\/\/\/repo\/README\.md\]\(herdr-nvim:\/\/open\?/);
  assert.match(rewritten, /See \[file:\/\/\/repo\/config\.json\]\(herdr-nvim:\/\/open\?[^\n]+\)\./);
  assert.match(rewritten, /https:\/\/example\.com/);
  assert.match(rewritten, /file:\/\/server\/share unchanged/);
  assert.match(rewritten, /\[file:\/\/\/repo\/label\.ts\]\(https:\/\/example\.com\/file\)/);
  assert.match(rewritten, /\[remote\]\(file:\/\/server\/share\)/);

  const targets = [...rewritten.matchAll(/herdr-nvim:\/\/open\?[^)\s]+/g)].map(
    (match) => new URL(match[0]),
  );
  assert.deepEqual(
    targets.map((target) => target.searchParams.get("file")),
    ["file:///repo/main.ts", "file:///repo/README.md", "file:///repo/config.json"],
  );
});

test("rewrites reference destinations but not code or raw HTML", () => {
  const markdown = [
    "[source][main]",
    "",
    '[main]: file:///repo/main.ts "Main source"',
    "",
    "`file:///repo/inline.ts`",
    "",
    "```text",
    "file:///repo/block.ts",
    "```",
    "",
    "<span>file:///repo/raw.ts</span>",
    "",
    "- `file:///repo/list-code.ts` and file:///repo/list.ts",
    "",
    "> `file:///repo/quote-code.ts` and file:///repo/quote.ts",
  ].join("\n");
  const rewritten = rewriteFileUrlsInMarkdown(markdown, context);

  assert.match(rewritten, /^\[source\]\[main\]/);
  assert.match(rewritten, /\[main\]: herdr-nvim:\/\/open\?/);
  assert.match(rewritten, /`file:\/\/\/repo\/inline\.ts`/);
  assert.match(rewritten, /```text\nfile:\/\/\/repo\/block\.ts\n```/);
  assert.match(rewritten, /<span>file:\/\/\/repo\/raw\.ts<\/span>/);
  assert.match(rewritten, /`file:\/\/\/repo\/list-code\.ts` and \[file:\/\/\/repo\/list\.ts\]/);
  assert.match(rewritten, /`file:\/\/\/repo\/quote-code\.ts` and \[file:\/\/\/repo\/quote\.ts\]/);
  assert.equal((rewritten.match(/herdr-nvim:\/\/open\?/g) ?? []).length, 3);
});

test("component delegates lifecycle and rewrites rendered lines", () => {
  let invalidated = false;
  let input = "";
  const inner: Component = {
    wantsKeyRelease: true,
    render: () => ["\x1b]8;;file:///repo/main.go\x07main.go\x1b]8;;\x07"],
    handleInput: (value) => {
      input = value;
    },
    invalidate: () => {
      invalidated = true;
    },
  };
  const wrapped = new HerdrNvimLinkComponent(inner, context);

  assert.equal(wrapped.wantsKeyRelease, true);
  assert.match(wrapped.render(80)[0], /herdr-nvim:\/\/open\?/);
  wrapped.handleInput("x");
  wrapped.invalidate();
  assert.equal(input, "x");
  assert.equal(invalidated, true);
});

test("overrides only local built-in file tools in TUI mode", () => {
  withHerdrEnvironment(() => {
    const handlers = new Map<string, (...args: any[]) => void>();
    const registered: any[] = [];
    const markdownTransformers: Array<(markdown: string, context: unknown) => string> = [];
    const baseComponent: Component = {
      render: () => ["\x1b]8;;file:///repo/main.ts\x07main.ts\x1b]8;;\x07"],
      invalidate() {},
    };
    let renderCalls = 0;
    const renderCall = (
      _args: unknown,
      _theme: unknown,
      renderContext: { lastComponent?: Component },
    ) => {
      assert.equal(renderContext.lastComponent, renderCalls === 0 ? undefined : baseComponent);
      renderCalls++;
      return baseComponent;
    };
    const definitions = [
      { name: "read", execute() {}, renderCall },
      { name: "edit", execute() {}, renderCall },
      { name: "write", execute() {}, renderCall },
    ];
    const pi = {
      on(name: string, handler: (...args: any[]) => void) {
        handlers.set(name, handler);
      },
      events: { on: () => () => {}, emit() {} },
      getAllTools() {
        return [
          { name: "read", sourceInfo: { source: "builtin" } },
          { name: "edit", sourceInfo: { source: "other-extension" } },
          { name: "write", sourceInfo: { source: "builtin" } },
        ];
      },
      registerTool(definition: any) {
        registered.push(definition);
      },
      registerMarkdownTransformer(transformer: (markdown: string, context: unknown) => string) {
        markdownTransformers.push(transformer);
      },
    } as unknown as ExtensionAPI;

    herdrNvimLinksExtension(pi, { createDefinitions: () => definitions });
    handlers.get("session_start")?.({}, { mode: "tui", cwd: "/repo" });

    assert.equal(markdownTransformers.length, 1);
    const streamed = markdownTransformers[0]("[source](file:///repo/main.ts)", {
      messageType: "assistant",
      isStreaming: true,
      availableWidth: 80,
    });
    assert.match(streamed, /^\[source\]\(herdr-nvim:\/\/open\?/);
    assert.match(streamed, /sourcePane=w1%3Ap1/);

    assert.deepEqual(
      registered.map((tool) => tool.name),
      ["read", "write"],
    );
    const first = registered[0].renderCall(
      { offset: 7 },
      {},
      { cwd: "/repo", lastComponent: undefined },
    );
    const second = registered[0].renderCall(
      { offset: 8 },
      {},
      { cwd: "/repo", lastComponent: first },
    );
    assert.equal(second, first);
    assert.equal(renderCalls, 2);
    assert.match(second.render(80)[0], /line=8/);
  });
});

test("decorates compact file rows when history is rendered", () => {
  withHerdrEnvironment(() => {
    let compactListener: ((value: unknown) => void) | undefined;
    const pi = {
      on() {},
      events: {
        on(_name: string, handler: (value: unknown) => void) {
          compactListener = handler;
          return () => {};
        },
        emit() {},
      },
      registerMarkdownTransformer() {},
    } as unknown as ExtensionAPI;
    herdrNvimLinksExtension(pi);

    const component: Component = {
      render: () => ["\x1b]8;;file:///repo/main.ts\x07Read main.ts\x1b]8;;\x07"],
      invalidate() {},
    };
    const event = {
      toolName: "read",
      args: { path: "main.ts", offset: 4 },
      component,
      renderContext: { cwd: "/repo", lastComponent: undefined },
    };
    compactListener!(event);

    const decorated = event.component;
    assert.match(decorated.render(80)[0], /herdr-nvim:\/\/open\?/u);
    assert.match(decorated.render(80)[0], /line=4/u);
  });
});

test("does not override tools outside Herdr or outside TUI mode", () => {
  const previous = process.env.HERDR_ENV;
  delete process.env.HERDR_ENV;
  try {
    let subscribed = false;
    herdrNvimLinksExtension({
      on() {
        subscribed = true;
      },
    } as unknown as ExtensionAPI);
    assert.equal(subscribed, false);
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = previous;
  }

  withHerdrEnvironment(() => {
    const handlers = new Map<string, (...args: any[]) => void>();
    let registrations = 0;
    const pi = {
      on(name: string, handler: (...args: any[]) => void) {
        handlers.set(name, handler);
      },
      events: { on: () => () => {}, emit() {} },
      getAllTools: () => [{ name: "read", sourceInfo: { source: "builtin" } }],
      registerTool() {
        registrations++;
      },
      registerMarkdownTransformer() {},
    } as unknown as ExtensionAPI;
    herdrNvimLinksExtension(pi, { createDefinitions: () => [] });
    handlers.get("session_start")?.({}, { mode: "rpc", cwd: "/repo" });
    assert.equal(registrations, 0);
  });
});
