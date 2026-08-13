import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import sessionDefaultModelExtension, {
  isSessionDefaultModel,
  loadSessionDefaultModel,
  type SessionDefaultModel,
} from "../index.ts";

type Handler = (event: any, ctx: any) => any;
type Command = {
  handler: (args: string, ctx: any) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
};

function extensionHarness(statePath: string, thinkingLevel = "medium") {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, Command>();
  const selectedModels: any[] = [];
  const selectedThinkingLevels: string[] = [];
  let currentThinkingLevel = thinkingLevel;
  const pi = {
    on(name: string, handler: Handler) { handlers.set(name, handler); },
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    async setModel(model: any) {
      selectedModels.push(model);
      return true;
    },
    getThinkingLevel() { return currentThinkingLevel; },
    setThinkingLevel(level: string) {
      currentThinkingLevel = level;
      selectedThinkingLevels.push(level);
    },
  } as unknown as ExtensionAPI;
  sessionDefaultModelExtension(pi, { statePath });
  return { handlers, commands, selectedModels, selectedThinkingLevels };
}

function state(overrides: Partial<SessionDefaultModel> = {}): SessionDefaultModel {
  return {
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    thinkingLevel: "medium",
    ...overrides,
  };
}

function context(options: {
  entries?: unknown[];
  currentModel?: { provider: string; id: string };
  availableModel?: any;
} = {}) {
  const notifications: Array<{ message: string; level: string }> = [];
  return {
    ctx: {
      hasUI: true,
      model: options.currentModel ?? { provider: "openai-codex", id: "gpt-5.6-terra" },
      thinkingLevel: "xhigh",
      sessionManager: { getEntries: () => options.entries ?? [] },
      modelRegistry: {
        find: () => options.availableModel ?? {
          provider: "openai-codex",
          id: "gpt-5.6-sol",
          reasoning: true,
        },
      },
      ui: { notify(message: string, level: string) { notifications.push({ message, level }); } },
    },
    notifications,
  };
}

test("validates and loads only complete state", () => {
  const directory = mkdtempSync(join(tmpdir(), "session-default-state-"));
  try {
    const statePath = join(directory, "state.json");
    assert.equal(loadSessionDefaultModel(statePath), undefined);
    assert.equal(isSessionDefaultModel(state()), true);
    assert.equal(isSessionDefaultModel({ ...state(), thinkingLevel: "extreme" }), false);

    writeFileSync(statePath, JSON.stringify(state({ thinkingLevel: "xhigh" })));
    assert.deepEqual(loadSessionDefaultModel(statePath), state({ thinkingLevel: "xhigh" }));

    writeFileSync(statePath, "not json");
    assert.equal(loadSessionDefaultModel(statePath), undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("applies the saved default to an empty new session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "session-default-apply-"));
  try {
    const statePath = join(directory, "state.json");
    writeFileSync(statePath, JSON.stringify(state()));
    const harness = extensionHarness(statePath, "xhigh");
    const { ctx } = context();

    await harness.handlers.get("session_start")!({ reason: "startup" }, ctx);

    assert.deepEqual(harness.selectedModels.map(model => `${model.provider}/${model.id}`), [
      "openai-codex/gpt-5.6-sol",
    ]);
    assert.deepEqual(harness.selectedThinkingLevels, ["medium"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("does not replace model state in a resumed session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "session-default-resume-"));
  try {
    const statePath = join(directory, "state.json");
    writeFileSync(statePath, JSON.stringify(state()));
    const harness = extensionHarness(statePath, "xhigh");
    const { ctx } = context({ entries: [{ type: "thinking_level_change", thinkingLevel: "xhigh" }] });

    await harness.handlers.get("session_start")!({ reason: "resume" }, ctx);

    assert.deepEqual(harness.selectedModels, []);
    assert.deepEqual(harness.selectedThinkingLevels, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("save captures the current model and clear disables the default", async () => {
  const directory = mkdtempSync(join(tmpdir(), "session-default-command-"));
  try {
    const statePath = join(directory, "nested", "state.json");
    const harness = extensionHarness(statePath, "xhigh");
    const { ctx, notifications } = context({
      currentModel: { provider: "openai-codex", id: "gpt-5.6-sol" },
    });
    const command = harness.commands.get("session-default")!;

    assert.deepEqual(command.getArgumentCompletions?.("s"), [
      { value: "save", label: "save" },
      { value: "show", label: "show" },
    ]);
    await command.handler("save", ctx);
    assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")), state({ thinkingLevel: "xhigh" }));
    assert.deepEqual(notifications.at(-1), {
      message: "New session default saved: openai-codex/gpt-5.6-sol xhigh",
      level: "info",
    });

    await command.handler("clear", ctx);
    assert.equal(existsSync(statePath), false);
    await command.handler("show", ctx);
    assert.deepEqual(notifications.at(-1), {
      message: "No new session default is saved",
      level: "info",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reports an unavailable saved model without changing the session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "session-default-missing-"));
  try {
    const statePath = join(directory, "state.json");
    writeFileSync(statePath, JSON.stringify(state()));
    const harness = extensionHarness(statePath, "xhigh");
    const { ctx, notifications } = context({ availableModel: null });
    ctx.modelRegistry.find = () => undefined;

    await harness.handlers.get("session_start")!({ reason: "new" }, ctx);

    assert.deepEqual(harness.selectedModels, []);
    assert.deepEqual(harness.selectedThinkingLevels, []);
    assert.deepEqual(notifications, [{
      message: "Session default model is not available: openai-codex/gpt-5.6-sol medium",
      level: "warning",
    }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
