import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  describeCodexRateLimitError,
  getWeeklyRemaining,
  getWeeklyRemainingFromHeaders,
} from "../codex-rate-limits.ts";
import {
  parseGitNumstat,
  renderComposerBox,
  renderComposerChrome,
  renderProgressBar,
} from "../composer.ts";
import { contextColor, remainingPercent, type FooterTheme } from "../footer.ts";
import statusFooterExtension from "../index.ts";

const plainTheme: FooterTheme = {
  fg: (_color, text) => text,
};

test("reads a primary seven-day Codex window as remaining capacity", () => {
  assert.equal(
    getWeeklyRemaining({
      rateLimits: {
        primary: { usedPercent: 2, windowDurationMins: 10_080 },
        secondary: null,
      },
    }),
    98,
  );
});

test("prefers a seven-day secondary window over a shorter primary window", () => {
  assert.equal(
    getWeeklyRemaining({
      rateLimits: {
        primary: { usedPercent: 40, windowDurationMins: 300 },
        secondary: { usedPercent: 7, windowDurationMins: 10_080 },
      },
    }),
    93,
  );
});

test("reads the weekly window from Pi provider response headers", () => {
  assert.equal(
    getWeeklyRemainingFromHeaders({
      "x-codex-primary-used-percent": "40",
      "x-codex-primary-window-minutes": "300",
      "x-codex-secondary-used-percent": "7",
      "x-codex-secondary-window-minutes": "10080",
    }),
    93,
  );
  assert.equal(getWeeklyRemainingFromHeaders({ "content-type": "text/event-stream" }), undefined);
});

test("classifies Codex transport, authentication, and state errors", () => {
  assert.match(
    describeCodexRateLimitError(
      new Error(
        "failed to fetch codex rate limits: error sending request for url (https://chatgpt.com/backend-api/wham/usage)",
      ),
    ),
    /could not reach ChatGPT.*No HTTP credential response was received/iu,
  );
  assert.match(
    describeCodexRateLimitError(new Error("HTTP 401 Unauthorized")),
    /authentication failed/iu,
  );
  assert.match(
    describeCodexRateLimitError(new Error("Permission denied: ~/.codex")),
    /local state/iu,
  );
});

test("clamps malformed percentages and handles missing snapshots", () => {
  assert.equal(
    getWeeklyRemaining({
      rateLimits: { primary: { usedPercent: 140, windowDurationMins: 10_080 } },
    }),
    0,
  );
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

test("renders the context fill with a theme color separate from the border", () => {
  const calls: Array<{ color: string; text: string }> = [];
  const themed: FooterTheme = {
    fg: (color, text) => {
      calls.push({ color, text });
      return text;
    },
  };

  assert.equal(renderProgressBar(81, themed), "━━━━━━━━━━");
  assert.deepEqual(calls, [
    { color: "success", text: "━━" },
    { color: "dim", text: "━━━━━━━━" },
  ]);
});

test("renders status inside the editor borders and stays within width", () => {
  const lines = renderComposerChrome(
    ["top", "input", "bottom"],
    {
      model: "gpt-5.5",
      thinking: "low",
      branch: "main",
      additions: 681,
      deletions: 86,
      weeklyRemaining: 92,
      contextRemaining: 81,
      cwd: "/workspace/toolkit",
      working: { frame: "⠸", label: "Working" },
    },
    120,
    plainTheme,
    (text) => text,
  );

  assert.match(lines[0]!, /━━━━━━━━━━ ctx 81% left · weekly 92% · gpt-5\.5 low/u);
  assert.match(lines[2]!, /⠸ Working/u);
  assert.match(lines[2]!, /\/workspace\/toolkit \(main \+681 -86\)/u);
  assert.ok(lines.every((line) => visibleWidth(line) <= 120));
});

test("adds vertical spacing, side walls, and rounded corners", () => {
  const lines = renderComposerBox(
    ["─".repeat(18), "input".padEnd(18), "─".repeat(18)],
    18,
    (text) => text,
  );

  assert.deepEqual(lines, [
    `╭${"─".repeat(18)}╮`,
    `│${" ".repeat(18)}│`,
    `│${"input".padEnd(18)}│`,
    `│${" ".repeat(18)}│`,
    `╰${"─".repeat(18)}╯`,
  ]);
  assert.ok(lines.every((line) => visibleWidth(line) === 20));
});

test("status-refresh reinstalls the custom footer", async () => {
  let command: { handler: (args: string, ctx: any) => Promise<void> } | undefined;
  let footerInstallations = 0;
  const notifications: string[] = [];
  const pi = {
    on() {},
    events: { on: () => () => {}, emit() {} },
    registerCommand(_name: string, registered: typeof command) {
      command = registered;
    },
    getThinkingLevel: () => "high",
    exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }),
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
      setWorkingVisible() {},
      setEditorComponent() {},
      setFooter() {
        footerInstallations++;
      },
      notify(message: string) {
        notifications.push(message);
      },
    },
  });

  assert.equal(footerInstallations, 1);
  assert.deepEqual(notifications, ["Weekly Codex limit: 95% left"]);
});

test("sums text changes and ignores binary numstat entries", () => {
  assert.deepEqual(parseGitNumstat("10\t2\ta.ts\n4\t0\tb.ts\n-\t-\timage.png\n"), {
    additions: 14,
    deletions: 2,
  });
});

test("requests a composer render when the Fast mode extension broadcasts a toggle", async () => {
  const eventHandlers = new Map<string, (event: any, ctx: any) => any>();
  let fastModeHandler: ((value: unknown) => void) | undefined;
  let footerFactory:
    | ((tui: any, theme: any, data: any) => { render(width: number): string[] })
    | undefined;
  let rendersRequested = 0;
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => any) {
      eventHandlers.set(name, handler);
    },
    events: {
      on(_channel: string, handler: (value: unknown) => void) {
        fastModeHandler = handler;
        return () => {};
      },
      emit() {},
    },
    registerCommand() {},
    getThinkingLevel: () => "high",
    exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }),
  } as unknown as ExtensionAPI;
  statusFooterExtension(pi, {
    loadFastModeState: () => ({ enabled: false }),
    fetchRateLimits: async () => ({ rateLimits: null }),
  });
  const ctx = {
    mode: "tui",
    model: {
      provider: "openai-codex",
      api: "openai-codex-responses",
      id: "gpt-5.5",
      reasoning: true,
    },
    getContextUsage: () => ({ percent: 47 }),
    ui: {
      setWorkingVisible() {},
      setEditorComponent() {},
      setFooter(factory: typeof footerFactory) {
        footerFactory = factory;
      },
    },
  };

  await eventHandlers.get("session_start")!({}, ctx);
  const footer = footerFactory!(
    {
      requestRender() {
        rendersRequested++;
      },
    },
    plainTheme,
    { onBranchChange: () => () => {}, getGitBranch: () => "main" },
  );
  assert.deepEqual(footer.render(100), []);

  const beforeToggle = rendersRequested;
  fastModeHandler!({ enabled: true });
  assert.equal(rendersRequested, beforeToggle + 1);
});
