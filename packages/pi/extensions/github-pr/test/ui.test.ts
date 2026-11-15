import assert from "node:assert/strict";
import { test } from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { parseTarget, type Tracked } from "../model.ts";
import { widgetLines } from "../ui.ts";

const theme = { fg: (_color: string, text: string) => text } as Pick<Theme, "fg">;
const target = parseTarget("https://github.com/acme/widget/pull/42");
function entry(): Tracked {
  return {
    target,
    due: 0,
    failures: 0,
    snapshot: {
      target,
      head: "a".repeat(40),
      title: "Fix 🧪 and 中文 " + "wide title ".repeat(30),
      lifecycle: "open",
      draft: true,
      observedAt: 1_000,
      checks: [{ key: "test", execution: "1", name: "CI / test", state: "passed" }],
    },
  };
}

test("stale last-known success is visibly degraded instead of showing a fresh green status", () => {
  const row = entry();
  row.error = "HTTP 503";
  const lines = widgetLines([row], target.url, false, 100, theme, 150_000).join("\n");
  assert.match(lines, /stale/);
  assert.match(lines, /HTTP 503/);
  assert.doesNotMatch(lines, /✓/);
});

test("passive status and an armed agent watch are visibly different", () => {
  const row = entry();
  assert.match(
    widgetLines([row], target.url, false, 100, theme, 1_000).join("\n"),
    /Agent watch off/,
  );
  row.watch = { target, head: "a".repeat(40), startedAt: 1, deadline: 100_000, status: "watching" };
  assert.match(
    widgetLines([row], target.url, false, 100, theme, 1_000).join("\n"),
    /Agent watching aaaaaaa/,
  );
});

test("workflow status follows the run, not just its currently visible jobs", () => {
  const row = entry();
  const run = parseTarget("https://github.com/acme/widget/actions/runs/100");
  row.target = run;
  row.snapshot!.target = run;
  row.snapshot!.runStatus = "in_progress";
  const running = widgetLines([row], run.url, false, 100, theme, 1_000).join("\n");
  assert.match(running, /Workflow in_progress/);
  assert.doesNotMatch(running, /✓/);
  row.snapshot!.runStatus = "completed";
  row.snapshot!.conclusion = "cancelled";
  const cancelled = widgetLines([row], run.url, false, 100, theme, 1_000).join("\n");
  assert.match(cancelled, /Workflow cancelled/);
  assert.doesNotMatch(cancelled, /✓/);
});

test("inline expansion prioritizes failures, retains watch state, and bounds height", () => {
  const row = entry();
  row.watch = { target, head: "a".repeat(40), startedAt: 1, deadline: 100_000, status: "watching" };
  row.snapshot!.checks = [
    ...Array.from({ length: 24 }, (_, i) => ({
      key: String(i),
      execution: String(i),
      name: `passing check ${i}`,
      state: "passed" as const,
    })),
    { key: "failed", execution: "fail", name: "windows failure", state: "failed" },
  ];
  const lines = widgetLines([row], target.url, true, 100, theme, 1_000, undefined, 10);
  assert.ok(lines.length <= 10);
  assert.match(lines.join("\n"), /windows failure/);
  assert.match(lines.join("\n"), /more checks/);
  assert.match(lines.join("\n"), /Agent watching/);
  assert.match(lines.at(-1)!, /to collapse/);
  assert.equal(row.snapshot!.checks[0].name, "passing check 0");
});

test("inline status fits narrow terminals without losing the watch state", () => {
  const row = entry();
  for (const width of [1, 20, 60, 100]) {
    for (const maxLines of [3, 8, 14]) {
      const lines = widgetLines([row], target.url, true, width, theme, 1_000, undefined, maxLines);
      assert.ok(lines.length <= maxLines);
      for (const line of lines) assert.ok(visibleWidth(line) <= width);
      if (width >= 20) assert.match(lines.join("\n"), /Agent watch off/);
    }
  }
});
