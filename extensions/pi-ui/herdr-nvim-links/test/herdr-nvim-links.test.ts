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

test("composes file renderers before history renders and reuses wrapped components", () => {
  withHerdrEnvironment(() => {
    let resolve: any;
    let transform: any;
    const base: Component = {
      render: () => ["\x1b]8;;file:///repo/main.ts\x07main.ts\x1b]8;;\x07"],
      invalidate() {},
    };
    let renders = 0;
    const original = {
      renderShell: "self",
      renderCall(_args: unknown, _theme: unknown, context: any) {
        assert.equal(context.lastComponent, renders++ === 0 ? undefined : base);
        return base;
      },
      renderResult() {
        return base;
      },
    };
    herdrNvimLinksExtension({
      registerTool() {
        throw new Error("Must not replace execution");
      },
      registerToolRenderer(handler: any) {
        resolve = handler;
      },
      registerMarkdownTransformer(handler: any) {
        transform = handler;
      },
    } as unknown as ExtensionAPI);
    assert.match(transform("[source](file:///repo/main.ts)"), /herdr-nvim:\/\/open\?/u);
    assert.equal(
      resolve("bash", () => original),
      original,
    );
    assert.equal(
      resolve("read", () => undefined),
      undefined,
    );
    const renderer = resolve("read", () => original);
    assert.equal(renderer.renderShell, "self");
    const first = renderer.renderCall(
      {},
      {},
      {
        args: { offset: 7 },
        cwd: "/repo",
        lastComponent: undefined,
      },
    );
    const second = renderer.renderCall(
      {},
      {},
      {
        args: { offset: 8 },
        cwd: "/repo",
        lastComponent: first,
      },
    );
    assert.equal(first, second);
    assert.match(second.render(80)[0], /line=8/u);
    const result = renderer.renderResult({}, {}, {}, { cwd: "/repo" });
    assert.match(result.render(80)[0], /herdr-nvim:\/\/open\?/u);
  });
});

test("does not register renderers outside Herdr", () => {
  const previous = process.env.HERDR_ENV;
  delete process.env.HERDR_ENV;
  try {
    herdrNvimLinksExtension({
      registerToolRenderer() {
        throw new Error("Unexpected renderer");
      },
    } as unknown as ExtensionAPI);
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = previous;
  }
});
