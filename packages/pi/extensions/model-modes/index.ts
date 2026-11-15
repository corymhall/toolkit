import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const modes = [
  { name: "implement", model: "gpt-6.1-sol", effort: "low" },
  { name: "discuss", model: "gpt-6.1-terra", effort: "medium" },
  { name: "investigate", model: "gpt-6.1-sol", effort: "high" },
] as const;

export default function modelModes(pi: ExtensionAPI) {
  pi.registerCommand("mode", {
    description: "Switch model and effort preset without changing prompts or tools",
    getArgumentCompletions(prefix) {
      const matches = [...modes.map((mode) => mode.name), "status"].filter((name) =>
        name.startsWith(prefix.trim().toLowerCase()),
      );
      return matches.length ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      let name = args.trim().toLowerCase();
      if (name === "status") {
        const active = modes.find(
          (mode) =>
            ctx.model?.provider === "openai-codex" &&
            ctx.model.id === mode.model &&
            pi.getThinkingLevel() === mode.effort,
        );
        ctx.ui.notify(
          `${active?.name ?? "custom"}: ${ctx.model?.provider ?? "none"}/${ctx.model?.id ?? "none"}, ${pi.getThinkingLevel()}`,
          "info",
        );
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current response to finish before switching modes.", "warning");
        return;
      }
      if (!name) {
        if (!ctx.hasUI) return;
        const labels = modes.map((mode) => `${mode.name}: ${mode.model}, ${mode.effort}`);
        const selected = await ctx.ui.select("Model mode", labels);
        if (!selected) return;
        name = modes[labels.indexOf(selected)]?.name ?? "";
      }
      const mode = modes.find((mode) => mode.name === name);
      if (!mode) {
        ctx.ui.notify("Usage: /mode [implement|discuss|investigate|status]", "warning");
        return;
      }
      // Recheck after the picker, which may have waited for user input.
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current response to finish before switching modes.", "warning");
        return;
      }
      const model = ctx.modelRegistry.find("openai-codex", mode.model);
      if (!model) {
        ctx.ui.notify(`Mode unchanged. Model openai-codex/${mode.model} is unavailable.`, "error");
        return;
      }
      try {
        if (!(await pi.setModel(model))) {
          ctx.ui.notify("Mode unchanged. No authentication configured for openai-codex.", "error");
          return;
        }
        pi.setThinkingLevel(mode.effort);
        ctx.ui.notify(`${mode.name}: ${mode.model}, ${pi.getThinkingLevel()}`, "info");
      } catch (error) {
        ctx.ui.notify(`Could not switch mode: ${String(error)}`, "error");
      }
    },
  });
}
