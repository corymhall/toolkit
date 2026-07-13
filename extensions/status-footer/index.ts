import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  fetchCodexRateLimits,
  getWeeklyRemaining,
  getWeeklyRemainingFromHeaders,
} from "./codex-rate-limits.ts";
import { remainingPercent, renderStatusFooter } from "./footer.ts";

export default function statusFooterExtension(
  pi: ExtensionAPI,
  dependencies: { fetchRateLimits?: typeof fetchCodexRateLimits } = {},
) {
  const fetchRateLimits = dependencies.fetchRateLimits ?? fetchCodexRateLimits;
  let active = false;
  let sawProviderRateLimit = false;
  let weeklyRemaining: number | undefined;
  let refreshAbort: AbortController | undefined;
  let refreshInFlight: Promise<void> | undefined;
  let requestRender: (() => void) | undefined;

  const refreshWeeklyLimit = (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight;
    const abort = new AbortController();
    refreshAbort = abort;
    refreshInFlight = fetchRateLimits({ signal: abort.signal })
      .then(response => {
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

  const installFooter = (ctx: ExtensionContext, refresh = true) => {
    if (ctx.mode !== "tui") return;
    active = true;
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubscribeBranch = footerData.onBranchChange(requestRender);

      return {
        invalidate() {},
        dispose() {
          unsubscribeBranch();
          requestRender = undefined;
        },
        render(width: number): string[] {
          const usage = ctx.getContextUsage();
          return renderStatusFooter({
            model: ctx.model?.id,
            thinking: ctx.model?.reasoning ? pi.getThinkingLevel() : undefined,
            branch: footerData.getGitBranch(),
            weeklyRemaining,
            contextRemaining: remainingPercent(usage?.percent),
          }, width, theme);
        },
      };
    });
    if (refresh) void refreshWeeklyLimit().catch(() => requestRender?.());
  };

  pi.on("session_start", (_event, ctx) => installFooter(ctx));

  pi.on("after_provider_response", event => {
    const remaining = getWeeklyRemainingFromHeaders(event.headers);
    if (remaining === undefined) return;
    sawProviderRateLimit = true;
    weeklyRemaining = remaining;
    requestRender?.();
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.mode === "tui" && !sawProviderRateLimit) {
      void refreshWeeklyLimit().catch(() => requestRender?.());
    }
  });

  pi.on("session_shutdown", () => {
    active = false;
    refreshAbort?.abort();
    refreshAbort = undefined;
    requestRender = undefined;
  });

  pi.registerCommand("status-refresh", {
    description: "Refresh the Codex weekly-limit status",
    handler: async (_args, ctx) => {
      installFooter(ctx, false);
      try {
        await refreshWeeklyLimit();
        if (weeklyRemaining === undefined) {
          ctx.ui.notify("Codex did not return a weekly rate-limit window", "warning");
        } else {
          ctx.ui.notify(`Weekly Codex limit: ${Math.round(weeklyRemaining)}% left`, "info");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Could not refresh Codex rate limits: ${message}`, "warning");
      }
    },
  });
}
