import assert from "node:assert/strict";
import { test } from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { restoreAutomatic } from "../auto-watch.ts";
import { GitHubError, type GitHubClient } from "../github.ts";
import { parseTarget, restoreWatches, type Outcome, type Snapshot, type Watch } from "../model.ts";
import { ciProgramStatus } from "../terminal-status.ts";
import { Tracker } from "../tracker.ts";
import { widgetLines } from "../ui.ts";

const targets = [41, 42, 43].map((n) => parseTarget(`https://github.com/acme/widget/pull/${n}`));
function fixture(saved?: unknown, rejectDelivery = false) {
  let now = 1_000_000;
  let current = targets[0];
  const snapshots = new Map(
    targets.map((target) => [
      target.url,
      {
        target,
        head: "a".repeat(40),
        title: `PR ${target.number}`,
        lifecycle: "open",
        observedAt: now,
        checks: [{ key: "test", execution: "1", name: `test ${target.number}`, state: "pending" }],
      } as Snapshot,
    ]),
  );
  const batches: { results: { watch: Watch; outcome: Outcome }[]; allPassed: boolean }[] = [];
  let state: unknown = saved;
  const client: GitHubClient = {
    discover: async () => current,
    snapshot: async (target) => ({
      ...structuredClone(snapshots.get(target.url)!),
      observedAt: now,
    }),
    identity: async (target) => {
      const snapshot = snapshots.get(target.url)!;
      return { head: snapshot.head, lifecycle: snapshot.lifecycle };
    },
    diagnostics: async () => "untrusted failure log",
  };
  const tracker = new Tracker(
    client,
    {
      changed() {},
      persist: (watches, automatic) => {
        state = structuredClone({ version: 3, watches, automatic });
      },
      outcomes: (results, allPassed) => {
        if (rejectDelivery) throw new Error("uncertain delivery");
        batches.push({ results, allPassed });
      },
    },
    () => now,
  );
  if (saved) tracker.restore(restoreWatches(saved), restoreAutomatic(saved));
  return {
    tracker,
    client,
    snapshots,
    batches,
    saved: () => state,
    current: (index: number) => {
      current = targets[index];
    },
    set: (index: number, state: "pending" | "failed" | "passed", head?: string) => {
      const snapshot = snapshots.get(targets[index].url)!;
      snapshot.checks[0].state = state;
      if (head) snapshot.head = head.repeat(40);
    },
    tick: async () => {
      now += 15_000;
      await tracker.tick();
    },
    now: () => now,
  };
}

test("persistent PRs survive branch switches and restacks, grouping new failures once per cycle", async () => {
  const f = fixture();
  await Promise.all(targets.slice(0, 2).map((target) => f.tracker.subscribe(target)));
  f.current(2);
  f.set(0, "failed");
  f.set(1, "failed");
  await f.tick();
  assert.equal(f.batches.length, 1);
  assert.deepEqual(
    f.batches[0].results.map((r) => r.watch.target.number).sort((a, b) => a - b),
    [41, 42],
  );
  assert.ok(
    f.batches[0].results.every((r) => r.watch.subscription && r.watch.status === "watching"),
  );
  await f.tick();
  assert.equal(f.batches.length, 1);
  f.set(0, "failed", "b");
  await f.tick();
  assert.equal(f.batches.length, 2);
  assert.equal(f.batches[1].results[0].watch.head, "b".repeat(40));
  assert.equal(f.batches[1].results[0].outcome.kind, "failed");
  f.tracker.dispose();
});

test("all-green requires the whole working set and is invalidated by a new head", async () => {
  const f = fixture();
  await Promise.all(targets.slice(0, 2).map((target) => f.tracker.subscribe(target)));
  f.set(0, "passed");
  await f.tick();
  await f.tick();
  assert.equal(f.batches.at(-1)?.allPassed, false);
  f.set(1, "passed");
  await f.tick();
  assert.equal(
    f.tracker.structuredStatus().targets.find((t) => t.target.number === 42)?.state,
    "running",
  );
  await f.tick();
  assert.equal(f.batches.at(-1)?.allPassed, true);
  assert.equal(ciProgramStatus(f.tracker.entries.values(), f.now())?.state, "done");
  f.set(1, "passed", "b");
  await f.tick();
  assert.equal(ciProgramStatus(f.tracker.entries.values(), f.now())?.state, "working");
  await f.tick();
  assert.equal(f.batches.filter((b) => b.allPassed).length, 2);
  f.tracker.dispose();
});

test("a restored subscription keeps access errors recoverable before its first snapshot", async () => {
  const original = fixture();
  await original.tracker.subscribe(targets[0]);
  const restored = fixture(original.saved());
  original.tracker.dispose();
  restored.client.snapshot = async () => {
    throw new GitHubError("GitHub authorization failed");
  };
  await restored.tick();
  await restored.tick();
  await restored.tick();
  assert.deepEqual(
    restored.batches.flatMap((batch) => batch.results.map((result) => result.outcome.kind)),
    ["error"],
  );
  assert.equal(restored.tracker.entries.get(targets[0].url)?.watch?.status, "watching");
  assert.equal(restored.tracker.entries.get(targets[0].url)?.snapshot, undefined);
  const recovered = fixture(restored.saved());
  restored.tracker.dispose();
  recovered.set(0, "passed");
  await recovered.tick();
  await recovered.tick();
  assert.deepEqual(
    recovered.batches.flatMap((batch) => batch.results.map((result) => result.outcome.kind)),
    ["passed"],
  );
  recovered.tracker.dispose();
});

test("reload restores subscriptions and receipts without replaying delivered failures or green", async () => {
  for (const state of ["failed", "passed"] as const) {
    const f = fixture();
    await Promise.all(targets.slice(0, 2).map((target) => f.tracker.subscribe(target)));
    f.set(0, state);
    f.set(1, state);
    await f.tick();
    await f.tick();
    const restored = fixture(f.saved());
    f.tracker.dispose();
    restored.set(0, state);
    restored.set(1, state);
    restored.current(2);
    await restored.tick();
    await restored.tick();
    assert.equal(restored.batches.length, 0);
    assert.equal(restored.tracker.entries.get(targets[0].url)?.watch?.status, "watching");
    restored.set(0, "failed", "c");
    await restored.tick();
    assert.equal(restored.batches.length, 1);
    restored.tracker.dispose();
  }
});

test("uncertain grouped delivery pauses every affected subscription durably without replay", async () => {
  const f = fixture(undefined, true);
  await Promise.all(targets.slice(0, 2).map((target) => f.tracker.subscribe(target)));
  f.set(0, "failed");
  f.set(1, "failed");
  await f.tick();
  for (const target of targets.slice(0, 2))
    assert.equal(f.tracker.entries.get(target.url)?.watch?.status, "paused");
  const restored = fixture(f.saved());
  f.tracker.dispose();
  restored.set(0, "failed");
  restored.set(1, "failed");
  await restored.tick();
  assert.equal(restored.batches.length, 0);
  await restored.tracker.subscribe(targets[0]);
  await restored.tick();
  assert.equal(restored.batches.length, 0);
  assert.equal(restored.tracker.entries.get(targets[1].url)?.watch?.status, "paused");
  restored.tracker.dispose();
});

test("cancellation while another target collects logs suppresses a queued grouped result", async () => {
  const f = fixture();
  await Promise.all(targets.slice(0, 2).map((target) => f.tracker.subscribe(target)));
  f.set(0, "failed");
  f.set(1, "failed");
  const diagnostics = f.client.diagnostics.bind(f.client);
  f.client.diagnostics = async (snapshot, signal) => {
    if (snapshot.target.number === 42) {
      // Let PR 41 queue its receipt while PR 42 still owns the cycle.
      await new Promise<void>((resolve) => setImmediate(resolve));
      f.tracker.cancel(targets[0].url);
    }
    return diagnostics(snapshot, signal);
  };
  await f.tick();
  assert.deepEqual(
    f.batches[0].results.map((r) => r.watch.target.number),
    [42],
  );
  f.tracker.dispose();
});

test("a final head change clears old green before another PR can claim all-green", async () => {
  const f = fixture();
  await Promise.all(targets.slice(0, 2).map((target) => f.tracker.subscribe(target)));
  f.set(0, "passed");
  f.set(1, "passed");
  await f.tick();
  const identity = f.client.identity.bind(f.client);
  f.client.identity = async (target, signal) =>
    target.number === 42 ? { head: "b".repeat(40), lifecycle: "open" } : identity(target, signal);
  await f.tick();
  assert.equal(f.batches[0].allPassed, false);
  assert.equal(
    f.tracker.structuredStatus().targets.find((t) => t.target.number === 42)?.state,
    "running",
  );
  f.tracker.dispose();
});

test("paused and stale PRs prevent the remaining green PRs from announcing all-green", async () => {
  for (const state of ["paused", "stale"] as const) {
    const f = fixture();
    await Promise.all(targets.map((target) => f.tracker.subscribe(target)));
    f.set(0, "passed");
    f.set(1, "passed");
    const third = f.tracker.entries.get(targets[2].url)!;
    if (state === "paused") third.watch!.status = "paused";
    else {
      third.error = "GitHub unavailable";
      third.due = Infinity;
    }
    await f.tick();
    await f.tick();
    assert.equal(f.batches.length, 1);
    assert.equal(f.batches[0].allPassed, false);
    assert.equal(
      f.tracker.structuredStatus().targets.find((t) => t.target.number === 43)?.state,
      state,
    );
    f.tracker.dispose();
  }
});

test("a pending rerun cannot reuse a previous identical green observation without confirmation", async () => {
  const f = fixture();
  await f.tracker.subscribe(targets[0]);
  f.set(0, "passed");
  await f.tick();
  await f.tick();
  f.set(0, "pending");
  await f.tick();
  f.set(0, "passed");
  await f.tick();
  assert.equal(f.batches.length, 1);
  assert.equal(ciProgramStatus(f.tracker.entries.values(), f.now())?.state, "working");
  await f.tick();
  assert.equal(f.batches.length, 2);
  f.tracker.dispose();
});

test("structured status bounds large check sets without hiding failure counts", async () => {
  const f = fixture();
  const snapshot = f.snapshots.get(targets[0].url)!;
  snapshot.checks = Array.from({ length: 5000 }, (_, i) => ({
    key: `check-${i}`,
    execution: "1",
    name: "x".repeat(1000),
    state: "passed",
  }));
  snapshot.checks.at(-1)!.state = "failed";
  await f.tracker.subscribe(targets[0]);
  const status = f.tracker.structuredStatus();
  const entry = status.targets[0];
  assert.equal(entry.checkCounts.failed, 1);
  assert.equal(entry.checkCounts.passed, 4999);
  assert.equal(entry.checksOmitted, 4995);
  assert.equal(entry.checks[0].state, "failed");
  assert.ok(JSON.stringify(status).length < 6000);
  f.tracker.dispose();
});

test("multi-PR overview stays ordered, exposes off-branch failures and focuses selected checks", async () => {
  const f = fixture();
  await f.tracker.subscribe(targets[0], { label: "Base", order: 1 });
  await f.tracker.subscribe(targets[1], { label: "SDK", order: 2 });
  f.set(1, "failed");
  await f.tick();
  const entries = [...f.tracker.entries.values()];
  const theme = { fg: (_color: string, text: string) => text } as Pick<Theme, "fg">;
  const render = (expanded: boolean, width = 100, maxLines = 14) =>
    widgetLines(
      entries,
      targets[0].url,
      expanded,
      width,
      theme,
      f.now(),
      undefined,
      maxLines,
      targets[1].url,
    );
  const collapsed = render(false).join("\n");
  assert.match(collapsed, /1 failed/);
  assert.match(collapsed, /widget#42/);
  const expanded = render(true).join("\n");
  assert.ok(expanded.indexOf("Base") < expanded.indexOf("SDK"));
  assert.match(expanded, /← current/);
  assert.match(expanded, /test 42/);
  assert.match(expanded, /Subscribed/);
  assert.match(render(true, 100, 3).join("\n"), /widget#42/);
  for (const width of [1, 20, 60, 100])
    for (const height of [3, 8, 14]) {
      const lines = render(true, width, height);
      assert.ok(lines.length <= height);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
    }
  await f.tracker.subscribe(targets[2]);
  f.set(2, "failed");
  await f.tick();
  f.tracker.cancel(targets[2].url);
  const cancelledDetails = widgetLines(
    [...f.tracker.entries.values()],
    targets[0].url,
    true,
    100,
    theme,
    f.now(),
    undefined,
    14,
    targets[2].url,
  ).join("\n");
  assert.match(cancelledDetails, /test 43/);
  assert.match(cancelledDetails, /Subscription cancelled/);
  f.tracker.dispose();
});
