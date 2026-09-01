import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import piUiExtension from "../index.ts";
import { TOOL_CARD_CALL_RENDER_EVENT } from "../tool-cards/events.ts";

test("registers the UI modules through one extension entry point", () => {
  const previous = { ...process.env };
  process.env.HERDR_ENV = "1";
  process.env.HERDR_PANE_ID = "w1:p1";
  process.env.HERDR_WORKSPACE_ID = "w1";
  process.env.HERDR_TAB_ID = "w1:t1";

  try {
    const tools: string[] = [];
    const commands: string[] = [];
    const events: string[] = [];
    let markdownTransformers = 0;
    const pi = {
      registerTool(definition: { name: string }) {
        tools.push(definition.name);
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
        on(name: string) {
          events.push(name);
          return () => {};
        },
      },
    } as unknown as ExtensionAPI;

    piUiExtension(pi);

    assert.deepEqual(tools, ["bash", "read", "edit", "write", "grep", "find", "ls"]);
    assert.deepEqual(commands, ["status-refresh"]);
    assert.equal(markdownTransformers, 1);
    assert.ok(events.includes(TOOL_CARD_CALL_RENDER_EVENT));
  } finally {
    process.env = previous;
  }
});
