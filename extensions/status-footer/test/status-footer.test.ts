import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { getWeeklyRemaining, getWeeklyRemainingFromHeaders } from "../codex-rate-limits.ts";
import { contextColor, remainingPercent, renderStatusFooter, type FooterTheme } from "../footer.ts";
import statusFooterExtension from "../index.ts";

const plainTheme: FooterTheme = {
  fg: (_color, text) => text,
};

test("reads a primary seven-day Codex window as remaining capacity", () => {
  assert.equal(getWeeklyRemaining({
    rateLimits: {
      primary: { usedPercent: 2, windowDurationMins: 10_080 },
      secondary: null,
    },
  }), 98);
});

test("prefers a seven-day secondary window over a shorter primary window", () => {
  assert.equal(getWeeklyRemaining({
    rateLimits: {
      primary: { usedPercent: 40, windowDurationMins: 300 },
      secondary: { usedPercent: 7, windowDurationMins: 10_080 },
    },
  }), 93);
});

test("reads the weekly window from Pi provider response headers", () => {
  assert.equal(getWeeklyRemainingFromHeaders({
    "x-codex-primary-used-percent": "40",
    "x-codex-primary-window-minutes": "300",
    "x-codex-secondary-used-percent": "7",
    "x-codex-secondary-window-minutes": "10080",
  }), 93);
  assert.equal(getWeeklyRemainingFromHeaders({ "content-type": "text/event-stream" }), undefined);
});

test("clamps malformed percentages and handles missing snapshots", () => {
  assert.equal(getWeeklyRemaining({ rateLimits: { primary: { usedPercent: 140, windowDurationMins: 10_080 } } }), 0);
  assert.equal(getWeeklyRemaining({ rateLimits: null }), undefined);
  assert.equal(remainingPercent(47.2), 53);
  assert.equal(remainingPercent(null), undefined);
});

test("colors context remaining by the requested thresholds", () => {
  assert.equal(contextColor(76), "success");
  assert.equal(contextColor(75), "warning");
  assert.equal(contextColor(45), "warning");
  assert.equal(contextColor(44), "error");
  assert.equal(contextColor(undefined), "warning");
});

test("keeps weekly and context status when the footer is narrow", () => {
  const [line] = renderStatusFooter({
    model: "gpt-5.3-codex",
    thinking: "high",
    branch: "feature/status-footer",
    weeklyRemaining: 98,
    contextRemaining: 53,
  }, 40, plainTheme);

  assert.equal(line, "weekly 98% left · context 53% left");
  assert.ok(visibleWidth(line) <= 40);
});

test("compacts both priority signals on very narrow terminals", () => {
  const [line] = renderStatusFooter({
    model: "gpt-5.3-codex",
    thinking: "high",
    branch: "feature/status-footer",
    weeklyRemaining: 98,
    contextRemaining: 53,
  }, 20, plainTheme);

  assert.equal(line, "W98% · C53%");
});

test("status-refresh reinstalls the custom footer", async () => {
  let command: { handler: (args: string, ctx: any) => Promise<void> } | undefined;
  let footerInstallations = 0;
  const notifications: string[] = [];
  const pi = {
    on() {},
    events: { on: () => () => {}, emit() {} },
    registerCommand(_name: string, registered: typeof command) { command = registered; },
    getThinkingLevel: () => "high",
  } as unknown as ExtensionAPI;
  statusFooterExtension(pi, {
    loadFastModeState: () => ({ enabled: false }),
    fetchRateLimits: async () => ({
      rateLimits: { primary: { usedPercent: 5, windowDurationMins: 10_080 } },
    }),
  });

  await command!.handler("", {
    mode: "tui",
    model: undefined,
    getContextUsage: () => undefined,
    ui: {
      setFooter() { footerInstallations++; },
      notify(message: string) { notifications.push(message); },
    },
  });

  assert.equal(footerInstallations, 1);
  assert.deepEqual(notifications, ["Weekly Codex limit: 95% left"]);
});

test("includes model and branch when space permits", () => {
  const [line] = renderStatusFooter({
    model: "gpt-5.3-codex",
    thinking: "high",
    branch: "main",
    weeklyRemaining: 98,
    contextRemaining: 53,
  }, 100, plainTheme);

  assert.equal(line, "gpt-5.3-codex high · main · weekly 98% left · context 53% left");
});

test("shows Fast mode next to the model and thinking level", () => {
  const [line] = renderStatusFooter({
    model: "gpt-5.5",
    thinking: "high",
    fastMode: true,
    branch: "main",
    weeklyRemaining: 98,
    contextRemaining: 53,
  }, 100, plainTheme);

  assert.equal(line, "gpt-5.5 high fast · main · weekly 98% left · context 53% left");
});

test("updates the footer when the Fast mode extension broadcasts a toggle", async () => {
  const eventHandlers = new Map<string, (event: any, ctx: any) => any>();
  let fastModeHandler: ((value: unknown) => void) | undefined;
  let footerFactory: ((tui: any, theme: any, data: any) => { render(width: number): string[] }) | undefined;
  let rendersRequested = 0;
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => any) { eventHandlers.set(name, handler); },
    events: {
      on(_channel: string, handler: (value: unknown) => void) {
        fastModeHandler = handler;
        return () => {};
      },
      emit() {},
    },
    registerCommand() {},
    getThinkingLevel: () => "high",
  } as unknown as ExtensionAPI;
  statusFooterExtension(pi, {
    loadFastModeState: () => ({ enabled: false }),
    fetchRateLimits: async () => ({ rateLimits: null }),
  });
  const ctx = {
    mode: "tui",
    model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.5", reasoning: true },
    getContextUsage: () => ({ percent: 47 }),
    ui: { setFooter(factory: typeof footerFactory) { footerFactory = factory; } },
  };

  await eventHandlers.get("session_start")!({}, ctx);
  const footer = footerFactory!(
    { requestRender() { rendersRequested++; } },
    plainTheme,
    { onBranchChange: () => () => {}, getGitBranch: () => "main" },
  );
  assert.equal(footer.render(100)[0], "gpt-5.5 high · main · weekly ? · context 53% left");

  fastModeHandler!({ enabled: true });
  assert.equal(footer.render(100)[0], "gpt-5.5 high fast · main · weekly ? · context 53% left");
  assert.equal(rendersRequested, 1);
});
