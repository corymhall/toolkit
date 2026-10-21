import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ToolRendererResolver } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import piUiExtension from "../index.ts";

test("registers the UI modules through one extension entry point", () => {
  const previous = { ...process.env };
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "w1:p1";
  process.env.HERDR_WORKSPACE_ID = "w1";
  process.env.HERDR_TAB_ID = "w1:t1";

  try {
    const tools: string[] = [];
    const commands: string[] = [];
    const renderers: ToolRendererResolver[] = [];
    let markdownTransformers = 0;
    const pi = {
      registerTool(definition: { name: string }) {
        tools.push(definition.name);
      },
      registerToolRenderer(resolve: ToolRendererResolver) {
        renderers.push(resolve);
      },
      registerCommand(name: string) {
        commands.push(name);
      },
      registerMarkdownTransformer() {
        markdownTransformers++;
      },
      on() {},
      events: {
        emit() {},
        on() {
          return () => {};
        },
      },
    } as unknown as ExtensionAPI;

    piUiExtension(pi);

    assert.deepEqual(tools, []);
    assert.equal(renderers.length, 1);
    const native = {
      renderResult: () => new Text("\x1b]8;;file:///repo/README.md\x07source\x1b]8;;\x07", 0, 0),
    };
    const resolve = (index: number): any =>
      index < renderers.length ? renderers[index]!("read", () => resolve(index + 1)) : native;
    const renderer = resolve(0);
    const context = {
      args: { path: "README.md", offset: 7 },
      cwd: "/repo",
      state: {},
      toolCallId: "read",
      argsComplete: true,
      executionStarted: true,
      expanded: true,
      isError: false,
      isPartial: false,
      showImages: false,
      lastComponent: undefined,
      invalidate() {},
    };
    const theme = { fg: (_: string, value: string) => value };
    const card = renderer.renderCall(context.args, theme, context);
    renderer.renderResult(
      { content: [{ type: "text", text: "source" }] },
      { expanded: true, isPartial: false },
      theme,
      context,
    );
    const rendered = card.render(120).join("\n");
    assert.match(rendered, /Path: README.md:7/u);
    assert.match(rendered, /file:\/\/\/repo\/README.md/u);
    assert.match(rendered, /source/u);
    assert.deepEqual(commands, ["status-refresh"]);
    assert.equal(markdownTransformers, 0);
  } finally {
    process.env = previous;
  }
});
