import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import codexFastModeExtension, {
  CODEX_FAST_MODE_CHANGED_EVENT,
  CODEX_FAST_MODE_MODEL_IDS,
  loadCodexFastModeState,
  supportsCodexFastMode,
} from "../index.ts";

type Handler = (event: any, ctx: any) => any;
type Command = {
  handler: (args: string, ctx: any) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
};

function extensionHarness(statePath: string) {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, Command>();
  const emitted: Array<{ channel: string; value: unknown }> = [];
  const pi = {
    on(name: string, handler: Handler) { handlers.set(name, handler); },
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    events: {
      emit(channel: string, value: unknown) { emitted.push({ channel, value }); },
      on() { return () => {}; },
    },
  } as unknown as ExtensionAPI;
  codexFastModeExtension(pi, { statePath });
  return { handlers, commands, emitted };
}

function supportedModel(id = "gpt-5.5") {
  return { provider: "openai-codex", api: "openai-codex-responses", id };
}

test("recognizes only Codex catalog models that advertise the Fast tier", () => {
  assert.deepEqual([...CODEX_FAST_MODE_MODEL_IDS], [
    "gpt-5.4",
    "gpt-5.5",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
  ]);
  for (const id of CODEX_FAST_MODE_MODEL_IDS) assert.equal(supportsCodexFastMode(supportedModel(id)), true);
  assert.equal(supportsCodexFastMode(supportedModel("gpt-5.4-mini")), false);
  assert.equal(supportsCodexFastMode({ ...supportedModel(), provider: "openai" }), false);
  assert.equal(supportsCodexFastMode({ ...supportedModel(), api: "openai-responses" }), false);
  assert.equal(supportsCodexFastMode(undefined), false);
});

test("loads missing or malformed state as disabled", () => {
  const directory = mkdtempSync(join(tmpdir(), "codex-fast-state-"));
  try {
    const statePath = join(directory, "state.json");
    assert.deepEqual(loadCodexFastModeState(statePath), { enabled: false });
    writeFileSync(statePath, "not json");
    assert.deepEqual(loadCodexFastModeState(statePath), { enabled: false });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("injects priority only when Fast mode and model support are both active", async () => {
  const directory = mkdtempSync(join(tmpdir(), "codex-fast-payload-"));
  try {
    const statePath = join(directory, "state.json");
    writeFileSync(statePath, JSON.stringify({ enabled: true }));
    const { handlers } = extensionHarness(statePath);
    const beforeRequest = handlers.get("before_provider_request")!;

    assert.deepEqual(
      await beforeRequest({ payload: { model: "gpt-5.5", input: [] } }, { model: supportedModel() }),
      { model: "gpt-5.5", input: [], service_tier: "priority" },
    );
    assert.equal(
      await beforeRequest(
        { payload: { model: "gpt-5.5", service_tier: "default" } },
        { model: supportedModel() },
      ),
      undefined,
    );
    assert.equal(
      await beforeRequest({ payload: { model: "gpt-5.4-mini" } }, { model: supportedModel("gpt-5.4-mini") }),
      undefined,
    );
    assert.equal(
      await beforeRequest({ payload: { model: "different" } }, { model: supportedModel() }),
      undefined,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the command persists and broadcasts toggle changes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "codex-fast-command-"));
  try {
    const statePath = join(directory, "nested", "state.json");
    const { commands, emitted } = extensionHarness(statePath);
    const command = commands.get("codex-fast")!;
    const notifications: Array<{ message: string; level: string }> = [];
    const ctx = {
      hasUI: true,
      model: supportedModel(),
      ui: { notify(message: string, level: string) { notifications.push({ message, level }); } },
    };

    assert.deepEqual(command.getArgumentCompletions?.("st"), [{ value: "status", label: "status" }]);
    await command.handler("on", ctx);

    assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")), { enabled: true });
    assert.deepEqual(emitted, [{ channel: CODEX_FAST_MODE_CHANGED_EVENT, value: { enabled: true } }]);
    assert.deepEqual(notifications.at(-1), {
      message: "Codex Fast mode enabled for openai-codex/gpt-5.5",
      level: "info",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("status reports an enabled toggle as inactive on an unsupported model", async () => {
  const directory = mkdtempSync(join(tmpdir(), "codex-fast-status-"));
  try {
    const statePath = join(directory, "state.json");
    writeFileSync(statePath, JSON.stringify({ enabled: true }));
    const { commands } = extensionHarness(statePath);
    const notifications: Array<{ message: string; level: string }> = [];

    await commands.get("codex-fast")!.handler("status", {
      hasUI: true,
      model: supportedModel("gpt-5.4-mini"),
      ui: { notify(message: string, level: string) { notifications.push({ message, level }); } },
    });

    assert.deepEqual(notifications, [{
      message: "Codex Fast mode: ON, but openai-codex/gpt-5.4-mini does not advertise Fast mode",
      level: "warning",
    }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
