import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import codexCommentaryExtension, {
  CODEX_COMMENTARY_INSTRUCTIONS,
  shouldEnableCodexCommentary,
} from "../index.ts";

type BeforeAgentStart = (
  event: { systemPrompt: string },
  ctx: { model?: { provider?: string; api?: string } },
) => { systemPrompt: string } | undefined;

function loadHandler(): BeforeAgentStart {
  let handler: BeforeAgentStart | undefined;
  const pi = {
    on(name: string, registered: BeforeAgentStart) {
      if (name === "before_agent_start") handler = registered;
    },
  } as unknown as ExtensionAPI;
  codexCommentaryExtension(pi);
  assert.ok(handler);
  return handler;
}

test("enables commentary only for the OpenAI Codex Responses API", () => {
  assert.equal(shouldEnableCodexCommentary({
    provider: "openai-codex",
    api: "openai-codex-responses",
  }), true);
  assert.equal(shouldEnableCodexCommentary({
    provider: "openai",
    api: "openai-responses",
  }), false);
  assert.equal(shouldEnableCodexCommentary({
    provider: "openai-codex",
    api: "openai-responses",
  }), false);
  assert.equal(shouldEnableCodexCommentary(undefined), false);
});

test("appends Codex commentary instructions to the existing system prompt", () => {
  const result = loadHandler()(
    { systemPrompt: "base system prompt" },
    { model: { provider: "openai-codex", api: "openai-codex-responses" } },
  );

  assert.deepEqual(result, {
    systemPrompt: `base system prompt\n\n${CODEX_COMMENTARY_INSTRUCTIONS}`,
  });
  assert.match(result!.systemPrompt, /start with a message in the `commentary` channel/);
  assert.match(result!.systemPrompt, /final answer must always be fully self-contained/);
  assert.doesNotMatch(result!.systemPrompt, /collapsed after the final answer/);
});

test("leaves other providers unchanged", () => {
  const result = loadHandler()(
    { systemPrompt: "base system prompt" },
    { model: { provider: "anthropic", api: "anthropic-messages" } },
  );

  assert.equal(result, undefined);
});
