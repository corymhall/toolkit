import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type SystemPromptSource = "last" | "current";

export function selectSystemPrompt(
  source: SystemPromptSource,
  currentPrompt: string,
  lastEffectivePrompt: string | undefined,
): { prompt: string; usedFallback: boolean } {
  if (source === "last" && lastEffectivePrompt !== undefined) {
    return { prompt: lastEffectivePrompt, usedFallback: false };
  }
  return {
    prompt: currentPrompt,
    usedFallback: source === "last",
  };
}

export default function systemPromptExtension(pi: ExtensionAPI) {
  let lastEffectivePrompt: string | undefined;

  // agent_start runs after every before_agent_start handler, so this captures
  // Pi's final effective system-prompt string for the run rather than seeing a
  // partially chained value from an earlier extension handler.
  pi.on("agent_start", (_event, ctx) => {
    lastEffectivePrompt = ctx.getSystemPrompt();
  });

  pi.registerCommand("system-prompt", {
    description: "View Pi's last effective system prompt",
    getArgumentCompletions(prefix) {
      const normalized = prefix.trim().toLowerCase();
      const matches = ["last", "current"].filter((value) => value.startsWith(normalized));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const source = (args.trim().toLowerCase() || "last") as SystemPromptSource;
      if (source !== "last" && source !== "current") {
        if (ctx.hasUI) ctx.ui.notify("Usage: /system-prompt [last|current]", "info");
        return;
      }
      if (!ctx.hasUI) return;

      const selected = selectSystemPrompt(source, ctx.getSystemPrompt(), lastEffectivePrompt);
      if (selected.usedFallback) {
        ctx.ui.notify(
          "No agent run has been captured yet; showing Pi's current assembled system prompt",
          "warning",
        );
      }

      const title =
        source === "current" || selected.usedFallback
          ? "Current Pi system prompt (edits are discarded)"
          : "Last effective Pi system prompt (edits are discarded)";
      await ctx.ui.editor(title, selected.prompt);
    },
  });
}
