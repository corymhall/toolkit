import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import systemPromptExtension, { selectSystemPrompt } from "../index.ts";

type Handler = (event: any, ctx: any) => any;
type Command = {
  handler: (args: string, ctx: any) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
};

function extensionHarness() {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, Command>();
  const pi = {
    on(name: string, handler: Handler) { handlers.set(name, handler); },
    registerCommand(name: string, command: Command) { commands.set(name, command); },
  } as unknown as ExtensionAPI;
  systemPromptExtension(pi);
  return { handlers, commands };
}

function commandContext(currentPrompt: string) {
  const editors: Array<{ title: string; text: string }> = [];
  const notifications: Array<{ message: string; level: string }> = [];
  return {
    ctx: {
      hasUI: true,
      getSystemPrompt() { return currentPrompt; },
      ui: {
        async editor(title: string, text: string) {
          editors.push({ title, text });
          return text;
        },
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    },
    editors,
    notifications,
  };
}

test("selects the last effective prompt when one has been captured", () => {
  assert.deepEqual(selectSystemPrompt("last", "current", "last effective"), {
    prompt: "last effective",
    usedFallback: false,
  });
  assert.deepEqual(selectSystemPrompt("current", "current", "last effective"), {
    prompt: "current",
    usedFallback: false,
  });
});

test("falls back to the current prompt before the first agent run", () => {
  assert.deepEqual(selectSystemPrompt("last", "current", undefined), {
    prompt: "current",
    usedFallback: true,
  });
});

test("captures the effective prompt at agent_start and displays it by default", async () => {
  const { handlers, commands } = extensionHarness();
  handlers.get("agent_start")!({}, { getSystemPrompt: () => "captured prompt" });

  const { ctx, editors, notifications } = commandContext("new current prompt");
  const command = commands.get("system-prompt")!;
  await command.handler("", ctx);

  assert.deepEqual(editors, [{
    title: "Last effective Pi system prompt (edits are discarded)",
    text: "captured prompt",
  }]);
  assert.deepEqual(notifications, []);
  assert.deepEqual(command.getArgumentCompletions?.("c"), [{ value: "current", label: "current" }]);
});

test("current mode reads the prompt at command invocation", async () => {
  const { commands } = extensionHarness();
  const { ctx, editors } = commandContext("current prompt");

  await commands.get("system-prompt")!.handler("current", ctx);

  assert.deepEqual(editors, [{
    title: "Current Pi system prompt (edits are discarded)",
    text: "current prompt",
  }]);
});

test("warns on fallback and reports invalid usage without opening the editor", async () => {
  const { commands } = extensionHarness();
  const command = commands.get("system-prompt")!;
  const fallback = commandContext("fallback prompt");

  await command.handler("last", fallback.ctx);
  assert.deepEqual(fallback.editors, [{
    title: "Current Pi system prompt (edits are discarded)",
    text: "fallback prompt",
  }]);
  assert.deepEqual(fallback.notifications, [{
    message: "No agent run has been captured yet; showing Pi's current assembled system prompt",
    level: "warning",
  }]);

  const invalid = commandContext("unused");
  await command.handler("other", invalid.ctx);
  assert.deepEqual(invalid.editors, []);
  assert.deepEqual(invalid.notifications, [{
    message: "Usage: /system-prompt [last|current]",
    level: "info",
  }]);
});
