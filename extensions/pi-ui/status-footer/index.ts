import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import {
  CODEX_FAST_MODE_CHANGED_EVENT,
  isCodexFastModeActive,
  isCodexFastModeChanged,
  loadCodexFastModeState,
} from "../../codex-fast-mode/index.ts";
import {
  describeCodexRateLimitError,
  fetchCodexRateLimits,
  getWeeklyRemaining,
  getWeeklyRemainingFromHeaders,
} from "./codex-rate-limits.ts";
import { parseGitNumstat, renderComposerBox, renderComposerChrome } from "./composer.ts";
import { remainingPercent } from "./footer.ts";

class EmptyFooter implements Component {
  render(): string[] {
    return [];
  }

  invalidate(): void {}
}

export default function statusFooterExtension(
  pi: ExtensionAPI,
  dependencies: {
    fetchRateLimits?: typeof fetchCodexRateLimits;
    loadFastModeState?: typeof loadCodexFastModeState;
  } = {},
) {
  const fetchRateLimits = dependencies.fetchRateLimits ?? fetchCodexRateLimits;
  const loadFastModeState = dependencies.loadFastModeState ?? loadCodexFastModeState;
  let active = false;
  let fastModeEnabled = loadFastModeState().enabled;
  let sawProviderRateLimit = false;
  let weeklyRemaining: number | undefined;
  let refreshAbort: AbortController | undefined;
  let refreshInFlight: Promise<void> | undefined;
  let requestRender: (() => void) | undefined;
  let activeTui: TUI | undefined;
  let isWorking = false;
  let spinnerIndex = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | undefined;
  let branch: string | null = null;
  let additions: number | undefined;
  let deletions: number | undefined;
  let refreshGitStats: (() => Promise<void>) | undefined;
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  const requestUiRender = () => {
    if (activeTui) activeTui.requestRender();
    else requestRender?.();
  };

  const stopSpinner = () => {
    if (!spinnerTimer) return;
    clearInterval(spinnerTimer);
    spinnerTimer = undefined;
  };

  const refreshWeeklyLimit = (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight;
    const abort = new AbortController();
    refreshAbort = abort;
    refreshInFlight = fetchRateLimits({ signal: abort.signal })
      .then((response) => {
        if (!active || sawProviderRateLimit) return;
        weeklyRemaining = getWeeklyRemaining(response);
        requestRender?.();
      })
      .finally(() => {
        if (refreshAbort === abort) refreshAbort = undefined;
        refreshInFlight = undefined;
      });
    return refreshInFlight;
  };

  const installComposer = (ctx: ExtensionContext, refresh = true) => {
    if (ctx.mode !== "tui") return;
    active = true;
    ctx.ui.setWorkingVisible(false);

    refreshGitStats = async () => {
      const result = await pi
        .exec("git", ["diff", "--numstat", "HEAD", "--"], { cwd: ctx.cwd })
        .catch(() => undefined);
      if (!active) return;
      if (!result || result.code !== 0) {
        additions = undefined;
        deletions = undefined;
      } else {
        ({ additions, deletions } = parseGitNumstat(result.stdout));
      }
      requestUiRender();
    };

    ctx.ui.setFooter((tui, _theme, footerData) => {
      requestRender = () => tui.requestRender();
      branch = footerData.getGitBranch();
      const unsubscribeBranch = footerData.onBranchChange(() => {
        branch = footerData.getGitBranch();
        requestUiRender();
      });

      const footer = new EmptyFooter();
      return {
        render: () => footer.render(),
        invalidate: () => footer.invalidate(),
        dispose() {
          unsubscribeBranch();
          requestRender = undefined;
        },
      };
    });

    class StatusEditor extends CustomEditor {
      constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
        super(tui, theme, keybindings, { paddingX: 0 });
        activeTui = tui;
      }

      render(width: number): string[] {
        if (width < 3) return super.render(width);

        const usage = ctx.getContextUsage();
        const innerWidth = width - 2;
        const editorLines = super.render(innerWidth);
        if (this.isShowingAutocomplete()) {
          editorLines.push(this.borderColor("─").repeat(innerWidth));
        }
        const border = (text: string) => this.borderColor(text);
        const chrome = renderComposerChrome(
          editorLines,
          {
            model: ctx.model?.id,
            thinking: ctx.model?.reasoning ? pi.getThinkingLevel() : undefined,
            fastMode: isCodexFastModeActive(ctx.model, fastModeEnabled),
            branch,
            additions,
            deletions,
            weeklyRemaining,
            contextRemaining: remainingPercent(usage?.percent),
            cwd: ctx.cwd,
            working: isWorking
              ? { frame: spinnerFrames[spinnerIndex]!, label: "Working" }
              : undefined,
          },
          innerWidth,
          ctx.ui.theme,
          border,
        );
        return renderComposerBox(chrome, innerWidth, border);
      }
    }

    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) => new StatusEditor(tui, theme, keybindings),
    );
    void refreshGitStats();
    if (refresh) void refreshWeeklyLimit().catch(() => requestUiRender());
  };

  const unsubscribeFastMode = pi.events.on(CODEX_FAST_MODE_CHANGED_EVENT, (value) => {
    if (!isCodexFastModeChanged(value)) return;
    fastModeEnabled = value.enabled;
    requestRender?.();
  });

  pi.on("session_start", (_event, ctx) => installComposer(ctx));
  pi.on("model_select", () => requestUiRender());
  pi.on("thinking_level_select", () => requestUiRender());

  pi.on("agent_start", () => {
    isWorking = true;
    stopSpinner();
    spinnerTimer = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      requestUiRender();
    }, 80);
    requestUiRender();
  });

  pi.on("after_provider_response", (event) => {
    const remaining = getWeeklyRemainingFromHeaders(event.headers);
    if (remaining === undefined) return;
    sawProviderRateLimit = true;
    weeklyRemaining = remaining;
    requestUiRender();
  });

  pi.on("agent_settled", (_event, ctx) => {
    isWorking = false;
    stopSpinner();
    requestUiRender();
    if (ctx.mode === "tui") {
      void refreshGitStats?.();
      if (!sawProviderRateLimit) {
        void refreshWeeklyLimit().catch(() => requestUiRender());
      }
    }
  });

  pi.on("session_shutdown", () => {
    active = false;
    stopSpinner();
    refreshAbort?.abort();
    refreshAbort = undefined;
    requestRender = undefined;
    activeTui = undefined;
    refreshGitStats = undefined;
    unsubscribeFastMode();
  });

  pi.registerCommand("status-refresh", {
    description: "Refresh the Codex weekly-limit status",
    handler: async (_args, ctx) => {
      installComposer(ctx, false);
      try {
        await refreshWeeklyLimit();
        if (weeklyRemaining === undefined) {
          ctx.ui.notify("Codex did not return a weekly rate-limit window", "warning");
        } else {
          ctx.ui.notify(`Weekly Codex limit: ${Math.round(weeklyRemaining)}% left`, "info");
        }
      } catch (error) {
        ctx.ui.notify(
          `Could not refresh Codex rate limits: ${describeCodexRateLimitError(error)}`,
          "warning",
        );
      }
    },
  });
}
