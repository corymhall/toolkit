import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildSessionContext,
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type SessionDefaultModel = {
  provider: string;
  model: string;
  thinkingLevel: ThinkingLevel;
};

export type SessionDefaultCliOverrides = {
  model: boolean;
  thinkingLevel: boolean;
};

export function getSessionDefaultCliOverrides(args: readonly string[]): SessionDefaultCliOverrides {
  let model = false;
  let thinkingLevel = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--model" && index + 1 < args.length) {
      model = true;
      thinkingLevel ||= /:(?:off|minimal|low|medium|high|xhigh|max)$/.test(args[++index]);
    } else if ((argument === "--provider" || argument === "--models") && index + 1 < args.length) {
      model = true;
      index++;
    } else if (argument === "--thinking" && index + 1 < args.length) {
      thinkingLevel = true;
      index++;
    }
  }

  return { model, thinkingLevel };
}

export function getSessionDefaultModelStatePath(): string {
  return join(getAgentDir(), "state", "session-default-model.json");
}

export function isSessionDefaultModel(value: unknown): value is SessionDefaultModel {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.provider === "string" &&
    state.provider.length > 0 &&
    typeof state.model === "string" &&
    state.model.length > 0 &&
    typeof state.thinkingLevel === "string" &&
    THINKING_LEVELS.includes(state.thinkingLevel as ThinkingLevel)
  );
}

export function loadSessionDefaultModel(
  statePath = getSessionDefaultModelStatePath(),
): SessionDefaultModel | undefined {
  try {
    const value = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
    return isSessionDefaultModel(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveSessionDefaultModel(
  state: SessionDefaultModel,
  statePath = getSessionDefaultModelStatePath(),
): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function describe(state: SessionDefaultModel): string {
  return `${state.provider}/${state.model} ${state.thinkingLevel}`;
}

export default function sessionDefaultModelExtension(
  pi: ExtensionAPI,
  dependencies: {
    statePath?: string;
    loadState?: typeof loadSessionDefaultModel;
    saveState?: typeof saveSessionDefaultModel;
    startupArgs?: readonly string[];
  } = {},
) {
  const statePath = dependencies.statePath ?? getSessionDefaultModelStatePath();
  const loadState = dependencies.loadState ?? loadSessionDefaultModel;
  const saveState = dependencies.saveState ?? saveSessionDefaultModel;
  const cliOverrides = getSessionDefaultCliOverrides(
    dependencies.startupArgs ?? process.argv.slice(2),
  );
  let savedDefault = loadState(statePath);

  pi.on("session_start", async (event, ctx) => {
    if (
      !savedDefault ||
      event.reason === "reload" ||
      event.reason === "resume" ||
      event.reason === "fork"
    )
      return;

    // Pi records the initial model and thinking level before session_start, so
    // an empty new session already has entries. On process startup, use the
    // same conversation-message check that Pi uses when it decides whether to
    // restore existing session state.
    if (
      event.reason === "startup" &&
      buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId()).messages
        .length > 0
    )
      return;

    const startupOverrides =
      event.reason === "startup" ? cliOverrides : { model: false, thinkingLevel: false };
    if (startupOverrides.model && startupOverrides.thinkingLevel) return;

    if (!startupOverrides.model) {
      const model = ctx.modelRegistry.find(savedDefault.provider, savedDefault.model);
      if (!model) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Session default model is not available: ${describe(savedDefault)}`,
            "warning",
          );
        }
        return;
      }

      if (ctx.model?.provider !== model.provider || ctx.model?.id !== model.id) {
        const selected = await pi.setModel(model);
        if (!selected) {
          if (ctx.hasUI) {
            ctx.ui.notify(
              `Session default model has no configured authentication: ${describe(savedDefault)}`,
              "warning",
            );
          }
          return;
        }
      }
    }

    if (!startupOverrides.thinkingLevel && pi.getThinkingLevel() !== savedDefault.thinkingLevel) {
      pi.setThinkingLevel(savedDefault.thinkingLevel);
    }
  });

  pi.registerCommand("session-default", {
    description: "Save, show, or clear the model default for new sessions",
    getArgumentCompletions(prefix) {
      const normalized = prefix.trim().toLowerCase();
      const matches = ["save", "show", "clear"].filter((action) => action.startsWith(normalized));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "show";

      if (action === "show") {
        if (ctx.hasUI) {
          ctx.ui.notify(
            savedDefault
              ? `New session default: ${describe(savedDefault)}`
              : "No new session default is saved",
            "info",
          );
        }
        return;
      }

      if (action === "clear") {
        savedDefault = undefined;
        try {
          rmSync(statePath, { force: true });
        } catch (error) {
          if (ctx.hasUI)
            ctx.ui.notify(`Could not clear the session default: ${String(error)}`, "error");
          return;
        }
        if (ctx.hasUI) ctx.ui.notify("New session default cleared", "info");
        return;
      }

      if (action === "save") {
        if (!ctx.model) {
          if (ctx.hasUI) ctx.ui.notify("No model is selected", "error");
          return;
        }
        savedDefault = {
          provider: ctx.model.provider,
          model: ctx.model.id,
          thinkingLevel: pi.getThinkingLevel(),
        };
        saveState(savedDefault, statePath);
        if (ctx.hasUI)
          ctx.ui.notify(`New session default saved: ${describe(savedDefault)}`, "info");
        return;
      }

      if (ctx.hasUI) ctx.ui.notify("Usage: /session-default [save|show|clear]", "info");
    },
  });
}
