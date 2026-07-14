import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const CODEX_FAST_MODE_CHANGED_EVENT = "codex-fast-mode:changed";

// These are the models whose current OpenAI Codex catalog entry advertises the
// `priority` service tier with the display name "Fast". Keep this conservative:
// an unknown model is left unchanged rather than tested with a live request.
export const CODEX_FAST_MODE_MODEL_IDS = new Set([
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
]);

export type CodexFastModeModel = {
  provider?: string;
  api?: string;
  id?: string;
};

export type CodexFastModeState = {
  enabled: boolean;
};

export type CodexFastModeChanged = CodexFastModeState;

export function supportsCodexFastMode(model: CodexFastModeModel | undefined): boolean {
  return model?.provider === "openai-codex"
    && model.api === "openai-codex-responses"
    && typeof model.id === "string"
    && CODEX_FAST_MODE_MODEL_IDS.has(model.id);
}

export function isCodexFastModeActive(
  model: CodexFastModeModel | undefined,
  enabled: boolean,
): boolean {
  return enabled && supportsCodexFastMode(model);
}

export function isCodexFastModeChanged(value: unknown): value is CodexFastModeChanged {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).enabled === "boolean";
}

export function getCodexFastModeStatePath(): string {
  return join(getAgentDir(), "state", "codex-fast-mode.json");
}

export function loadCodexFastModeState(
  statePath = getCodexFastModeStatePath(),
): CodexFastModeState {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
    if (isCodexFastModeChanged(parsed)) return { enabled: parsed.enabled };
  } catch {
    // Missing and malformed state both use the safe default.
  }
  return { enabled: false };
}

export function saveCodexFastModeState(
  state: CodexFastModeState,
  statePath = getCodexFastModeStatePath(),
): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function currentModelDescription(model: CodexFastModeModel | undefined): string {
  if (!model?.provider || !model.id) return "the current model";
  return `${model.provider}/${model.id}`;
}

export default function codexFastModeExtension(
  pi: ExtensionAPI,
  dependencies: {
    statePath?: string;
    loadState?: typeof loadCodexFastModeState;
    saveState?: typeof saveCodexFastModeState;
  } = {},
) {
  const statePath = dependencies.statePath ?? getCodexFastModeStatePath();
  const loadState = dependencies.loadState ?? loadCodexFastModeState;
  const saveState = dependencies.saveState ?? saveCodexFastModeState;
  let enabled = loadState(statePath).enabled;

  pi.on("before_provider_request", (event, ctx) => {
    if (!isCodexFastModeActive(ctx.model, enabled)) return undefined;
    if (!isRecord(event.payload)) return undefined;
    if (event.payload.model !== ctx.model?.id) return undefined;

    // Compose with provider configuration or earlier payload hooks instead of
    // silently replacing an explicit service-tier choice.
    if ("service_tier" in event.payload) return undefined;

    return {
      ...event.payload,
      service_tier: "priority",
    };
  });

  pi.registerCommand("codex-fast", {
    description: "Toggle OpenAI Codex Fast mode",
    getArgumentCompletions(prefix) {
      const normalized = prefix.trim().toLowerCase();
      const matches = ["on", "off", "status"].filter(option => option.startsWith(normalized));
      return matches.length > 0 ? matches.map(value => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action !== "on" && action !== "off" && action !== "status") {
        if (ctx.hasUI) ctx.ui.notify("Usage: /codex-fast [on|off|status]", "info");
        return;
      }

      if (action === "status") {
        if (!ctx.hasUI) return;
        if (!enabled) {
          ctx.ui.notify("Codex Fast mode: OFF", "info");
        } else if (supportsCodexFastMode(ctx.model)) {
          ctx.ui.notify(`Codex Fast mode: ON for ${currentModelDescription(ctx.model)}`, "info");
        } else {
          ctx.ui.notify(
            `Codex Fast mode: ON, but ${currentModelDescription(ctx.model)} does not advertise Fast mode`,
            "warning",
          );
        }
        return;
      }

      enabled = action === "on";
      saveState({ enabled }, statePath);
      pi.events.emit(CODEX_FAST_MODE_CHANGED_EVENT, { enabled } satisfies CodexFastModeChanged);

      if (!ctx.hasUI) return;
      if (!enabled) {
        ctx.ui.notify("Codex Fast mode disabled", "info");
      } else if (supportsCodexFastMode(ctx.model)) {
        ctx.ui.notify(`Codex Fast mode enabled for ${currentModelDescription(ctx.model)}`, "info");
      } else {
        ctx.ui.notify(
          `Codex Fast mode enabled, but ${currentModelDescription(ctx.model)} does not advertise Fast mode`,
          "warning",
        );
      }
    },
  });
}
