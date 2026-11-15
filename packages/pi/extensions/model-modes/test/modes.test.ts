import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import modelModes from "../index.ts";

function harness(options: { missing?: boolean; authenticated?: boolean; busy?: boolean } = {}) {
  let command: Parameters<ExtensionAPI["registerCommand"]>[1];
  const calls: string[] = [];
  const notices: string[] = [];
  let effort = "low";
  let current = { provider: "openai-codex", id: "gpt-6.1-sol" };
  const pi = {
    registerCommand(_name: string, definition: typeof command) {
      command = definition;
    },
    getThinkingLevel: () => effort,
    setThinkingLevel(value: string) {
      calls.push(`effort:${value}`);
      effort = value;
    },
    async setModel(model: typeof current) {
      calls.push(`model:${model.id}`);
      if (options.authenticated === false) return false;
      current = model;
      return true;
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    get model() {
      return current;
    },
    hasUI: true,
    isIdle: () => !options.busy,
    modelRegistry: {
      find: (provider: string, id: string) => (options.missing ? undefined : { provider, id }),
    },
    ui: { notify: (message: string) => notices.push(message), select: async () => undefined },
  } as unknown as ExtensionCommandContext;
  modelModes(pi);
  return { run: (args: string) => command.handler(args, ctx), calls, notices };
}

test("switches model before effort and derives status from the resulting selection", async () => {
  const h = harness();
  await h.run("discuss");
  assert.deepEqual(h.calls, ["model:gpt-6.1-terra", "effort:medium"]);
  await h.run("status");
  assert.match(h.notices.at(-1)!, /^discuss: openai-codex\/gpt-6.1-terra, medium$/);
});

for (const options of [{ missing: true }, { authenticated: false }, { busy: true }]) {
  test(`does not change effort on failed or busy selection ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    await h.run("investigate");
    assert.equal(
      h.calls.some((call) => call.startsWith("effort:")),
      false,
    );
    assert.match(h.notices.at(-1)!, /unchanged|Wait/);
  });
}

test("unknown names and canceled picker leave selections unchanged", async () => {
  const h = harness();
  await h.run("unknown");
  await h.run("");
  assert.deepEqual(h.calls, []);
});
