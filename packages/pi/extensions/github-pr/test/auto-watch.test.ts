import assert from "node:assert/strict";
import { test } from "node:test";
import { restoreAutomatic } from "../auto-watch.ts";
import { GitHubError, type GitHubClient } from "../github.ts";
import { parseTarget, restoreWatches, type Outcome, type Snapshot } from "../model.ts";
import { Tracker } from "../tracker.ts";

const target = parseTarget("https://github.com/acme/widget/pull/42");
function fixture(saved?: unknown, deliver?: (result: Outcome) => void) {
  let now = 1_000_000;
  let current: typeof target | undefined = target;
  let discovered: string | undefined;
  let snapshot: Snapshot = {
    target,
    head: "a".repeat(40),
    title: "Fix CI",
    lifecycle: "open",
    observedAt: now,
    checks: [{ key: "test", execution: "1", name: "test", state: "pending" }],
  };
  let error: Error | undefined;
  const results: Outcome[] = [];
  const states: unknown[] = [];
  const client: GitHubClient = {
    discover: async (_signal, changed) => {
      if (current?.url !== discovered) {
        changed();
        discovered = current?.url;
      }
      return current;
    },
    snapshot: async () => {
      if (error) throw error;
      return { ...snapshot, observedAt: now, checks: snapshot.checks.map((c) => ({ ...c })) };
    },
    identity: async () => ({ head: snapshot.head, lifecycle: snapshot.lifecycle }),
    diagnostics: async () => "Untrusted CI diagnostic",
  };
  const tracker = new Tracker(
    client,
    {
      changed() {},
      persist: (watches, automatic) =>
        states.push(structuredClone({ version: 2, watches, automatic })),
      outcomes: (batch) => {
        for (const { outcome } of batch) {
          deliver?.(outcome);
          results.push(outcome);
        }
      },
    },
    () => now,
  );
  if (saved) tracker.restore(restoreWatches(saved), restoreAutomatic(saved));
  return {
    tracker,
    results,
    states,
    client,
    set: (patch: Partial<Snapshot>) => {
      snapshot = { ...snapshot, ...patch };
    },
    current: (value: typeof target | undefined) => {
      current = value;
      if (value) snapshot = { ...snapshot, target: value };
    },
    fail: (value?: Error) => {
      error = value;
    },
    tick: async () => {
      now += 15_000;
      await tracker.tick();
    },
  };
}

test("the current PR is watched by default, without opening the panel or starting a wait", async () => {
  const f = fixture();
  await f.tick();
  assert.equal(f.tracker.autoWatch, true);
  assert.equal(f.tracker.entries.get(target.url)?.watch?.automatic, true);
  assert.equal(f.tracker.entries.get(target.url)?.watch?.deadline, undefined);
  assert.equal(f.results.length, 0);
  f.tracker.dispose();
});

test("unchanged failures stay quiet; reruns and new commits deliver new outcomes without rearming", async () => {
  const f = fixture();
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  await f.tick();
  await f.tick();
  await f.tick();
  assert.deepEqual(
    f.results.map((r) => r.kind),
    ["failed"],
  );
  f.set({ checks: [{ key: "test", execution: "2", name: "test", state: "failed" }] });
  await f.tick();
  await f.tick();
  assert.deepEqual(
    f.results.map((r) => r.kind),
    ["failed", "failed"],
  );
  f.set({ checks: [{ key: "test", execution: "3", name: "test", state: "pending" }] });
  await f.tick();
  f.set({ checks: [{ key: "test", execution: "3", name: "test", state: "passed" }] });
  await f.tick();
  await f.tick();
  await f.tick();
  assert.deepEqual(
    f.results.map((r) => r.kind),
    ["failed", "failed", "passed"],
  );
  f.set({
    head: "b".repeat(40),
    checks: [{ key: "test", execution: "4", name: "test", state: "failed" }],
  });
  await f.tick();
  assert.deepEqual(
    f.results.map((r) => r.kind),
    ["failed", "failed", "passed", "failed"],
  );
  assert.equal(f.tracker.entries.get(target.url)?.watch?.head, "b".repeat(40));
  f.tracker.dispose();
});

test("updated external statuses with a reused context ID get a fresh two-observation confirmation", async () => {
  const f = fixture();
  f.set({
    checks: [
      {
        key: "external",
        execution: "same-context",
        name: "external",
        state: "passed",
        completedAt: "2026-01-01T10:00:00Z",
      },
    ],
  });
  await f.tick();
  await f.tick();
  assert.equal(f.results.length, 1);
  f.set({
    checks: [
      {
        key: "external",
        execution: "same-context",
        name: "external",
        state: "passed",
        completedAt: "2026-01-01T11:00:00Z",
      },
    ],
  });
  await f.tick();
  assert.equal(f.results.length, 1);
  await f.tick();
  assert.equal(f.results.length, 2);
  f.tracker.dispose();
});

test("delivery receipts survive reload so old red or green results do not wake the agent again", async () => {
  for (const state of ["failed", "passed"] as const) {
    const f = fixture();
    f.set({ checks: [{ key: "test", execution: "1", name: "test", state }] });
    await f.tick();
    await f.tick();
    assert.equal(f.results.length, 1);
    const saved = f.states.at(-1);
    f.tracker.dispose();
    const resumed = fixture(saved);
    resumed.set({ checks: [{ key: "test", execution: "1", name: "test", state }] });
    await resumed.tick();
    await resumed.tick();
    assert.equal(resumed.results.length, 0);
    resumed.set({ checks: [{ key: "test", execution: "2", name: "test", state: "failed" }] });
    await resumed.tick();
    assert.equal(resumed.results[0]?.kind, "failed");
    resumed.tracker.dispose();
  }
});

test("opt-out persists even without a current PR, and explicit enable resumes automatic watching", async () => {
  const f = fixture();
  f.current(undefined);
  f.tracker.setAutoWatch(false);
  const saved = f.states.at(-1);
  f.tracker.dispose();
  const resumed = fixture(saved);
  resumed.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  await resumed.tick();
  await resumed.tick();
  assert.equal(resumed.tracker.autoWatch, false);
  assert.equal(resumed.tracker.entries.get(target.url)?.watch, undefined);
  assert.equal(resumed.results.length, 0);
  resumed.tracker.setAutoWatch(true);
  await resumed.tick();
  assert.equal(resumed.results[0]?.kind, "failed");
  resumed.tracker.dispose();
});

test("disabling automatic watching during log collection suppresses late notifications", async () => {
  const f = fixture();
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  f.client.diagnostics = async () => {
    f.tracker.cancel(target.url);
    return "old failure";
  };
  await f.tick();
  assert.equal(f.tracker.autoWatch, false);
  assert.equal(f.results.length, 0);
  await f.tick();
  assert.equal(f.results.length, 0);
  f.tracker.dispose();
});

test("switching branches leaves the old automatic target and preserves its receipts for a return", async () => {
  const f = fixture();
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  await f.tick();
  const other = parseTarget("https://github.com/acme/widget/pull/43");
  f.current(other);
  f.set({ checks: [{ key: "test", execution: "2", name: "test", state: "pending" }] });
  await f.tick();
  assert.equal(f.tracker.entries.get(target.url)?.watch, undefined);
  assert.equal(f.tracker.entries.get(other.url)?.watch?.automatic, true);
  f.current(target);
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  await f.tick();
  assert.equal(f.results.length, 1);
  f.tracker.dispose();
});

test("a branch switch during final result verification suppresses the old PR notification", async () => {
  const f = fixture();
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  f.client.identity = async () => {
    f.current(parseTarget("https://github.com/acme/widget/pull/43"));
    return { head: "a".repeat(40), lifecycle: "open" };
  };
  await f.tick();
  assert.equal(f.results.length, 0);
  assert.equal(f.tracker.current, "https://github.com/acme/widget/pull/43");
  assert.equal(f.tracker.entries.get(target.url)?.watch, undefined);
  f.tracker.dispose();
});

test("access errors notify once, then automatic monitoring recovers after authentication is fixed", async () => {
  const f = fixture();
  await f.tick();
  f.fail(new GitHubError("HTTP 401: authentication required"));
  for (let i = 0; i < 12; i++) await f.tick();
  assert.deepEqual(
    f.results.map((r) => r.kind),
    ["error"],
  );
  f.fail();
  f.set({ checks: [{ key: "test", execution: "2", name: "test", state: "failed" }] });
  for (let i = 0; i < 8; i++) await f.tick();
  assert.deepEqual(
    f.results.map((r) => r.kind),
    ["error", "failed"],
  );
  f.tracker.dispose();
});

test("uncertain delivery pauses durably and explicit re-enable does not replay the failure", async () => {
  // Delivery may have queued a message before throwing. Retrying would risk
  // waking the agent twice for the same execution.
  const f = fixture(undefined, () => {
    throw new Error("Delivery could not be confirmed");
  });
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  await f.tick();
  assert.equal(f.tracker.entries.get(target.url)?.watch?.status, "paused");
  assert.match(f.tracker.entries.get(target.url)?.error || "", /notification/);
  const saved = f.states.at(-1);
  f.tracker.dispose();

  const resumed = fixture(saved);
  resumed.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  await resumed.tick();
  assert.equal(resumed.tracker.entries.get(target.url)?.watch?.status, "paused");
  resumed.tracker.setAutoWatch(true);
  await resumed.tick();
  assert.equal(resumed.results.length, 0);
  resumed.set({ checks: [{ key: "test", execution: "2", name: "test", state: "failed" }] });
  await resumed.tick();
  assert.equal(resumed.results[0]?.kind, "failed");
  resumed.tracker.dispose();
});

test("already closed PRs are displayed without starting automatic agent work", async () => {
  const f = fixture();
  f.set({
    lifecycle: "merged",
    checks: [{ key: "test", execution: "1", name: "test", state: "passed" }],
  });
  await f.tick();
  await f.tick();
  assert.equal(f.tracker.entries.get(target.url)?.watch, undefined);
  assert.equal(f.results.length, 0);
  f.tracker.dispose();
});
