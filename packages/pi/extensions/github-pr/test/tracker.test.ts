import assert from "node:assert/strict";
import { test } from "node:test";
import { GitHubError, type GitHubClient } from "../github.ts";
import { parseTarget, restoreWatches, type Outcome, type Snapshot, type Watch } from "../model.ts";
import { Tracker } from "../tracker.ts";

const target = parseTarget("https://github.com/acme/widget/pull/42");
const head = "a".repeat(40);
function fixture() {
  let now = 1_000_000;
  let snapshot: Snapshot = {
    target,
    head,
    title: "Fix widget",
    lifecycle: "open",
    observedAt: now,
    checks: [{ key: "ci:test", execution: "1", name: "test", state: "pending" }],
  };
  let reads = 0;
  let error: Error | undefined;
  const outcomes: Outcome[] = [];
  const persisted: Watch[][] = [];
  const client: GitHubClient = {
    discover: async () => undefined,
    snapshot: async () => {
      reads++;
      if (error) throw error;
      return { ...snapshot, observedAt: now, checks: snapshot.checks.map((c) => ({ ...c })) };
    },
    identity: async () => ({
      head: snapshot.head,
      lifecycle: snapshot.lifecycle,
      attempt: snapshot.attempt,
    }),
    diagnostics: async () => "Untrusted diagnostic excerpt",
  };
  const tracker = new Tracker(
    client,
    {
      changed() {},
      persist: (w) => persisted.push(structuredClone(w)),
      outcomes: (batch) => outcomes.push(...batch.map((result) => result.outcome)),
    },
    () => now,
  );
  // These tests exercise the explicit, bounded wait contract independently of
  // the default current-PR subscription, covered in auto-watch.test.ts.
  tracker.setAutoWatch(false);
  return {
    tracker,
    client,
    outcomes,
    persisted,
    set: (patch: Partial<Snapshot>) => {
      snapshot = { ...snapshot, ...patch };
    },
    advance: (ms = 15_000) => {
      now += ms;
    },
    fail: (e?: Error) => {
      error = e;
    },
    reads: () => reads,
  };
}

test("passive display and an active wait share an in-flight read, without passive wakeups", async () => {
  const f = fixture();
  f.client.discover = async () => target;
  let release!: (s: Snapshot) => void;
  const original = f.client.snapshot.bind(f.client);
  f.client.snapshot = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const tick = f.tracker.tick();
  await new Promise((resolve) => setImmediate(resolve));
  const start = f.tracker.startWatch(target);
  release(await original(target, new AbortController().signal));
  await Promise.all([tick, start]);
  assert.equal(f.reads(), 1);
  assert.equal(f.tracker.entries.size, 1);
  assert.equal(f.outcomes.length, 0);
  f.tracker.dispose();
});

test("stable observed success finishes once, and never treats an empty check set as green", async () => {
  const f = fixture();
  f.set({ checks: [] });
  await f.tracker.startWatch(target);
  await f.tracker.tick();
  f.advance();
  await f.tracker.tick();
  assert.equal(f.outcomes.length, 0);
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "passed" }] });
  f.advance();
  await f.tracker.tick();
  assert.equal(f.outcomes.length, 0);
  f.advance();
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "passed");
  f.advance();
  await f.tracker.tick();
  assert.equal(f.outcomes.length, 1);
  f.tracker.dispose();
});

test("first failed job wakes early, even while another job remains pending", async () => {
  const f = fixture();
  await f.tracker.startWatch(target);
  f.set({
    checks: [
      { key: "test", execution: "1", name: "test", state: "failed" },
      { key: "slow", execution: "2", name: "slow", state: "pending" },
    ],
  });
  await f.tracker.tick();
  assert.equal(f.outcomes.length, 1);
  assert.equal(f.outcomes[0].kind, "failed");
  assert.match(f.outcomes[0].diagnostics!, /Untrusted/);
  assert.equal(f.tracker.entries.get(target.url)?.watch?.status, "ended");
  f.tracker.dispose();
});

test("unwatch dismisses an ended failure without discarding its check evidence", async () => {
  const f = fixture();
  await f.tracker.startWatch(target);
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "failed");
  assert.equal(f.tracker.cancel(target.url), 1);
  const entry = f.tracker.entries.get(target.url)!;
  assert.equal(entry.watch?.status, "cancelled");
  assert.equal(entry.snapshot?.checks[0].state, "failed");
  assert.equal(entry.watch?.outcome?.kind, "failed");
  f.tracker.dispose();
});

test("head movement supersedes the pinned wait rather than returning success for the new commit", async () => {
  const f = fixture();
  await f.tracker.startWatch(target);
  f.set({
    head: "b".repeat(40),
    checks: [{ key: "test", execution: "2", name: "test", state: "passed" }],
  });
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "superseded");
  f.tracker.dispose();
});

test("a rerun replacing failure during diagnostics suppresses the obsolete failure", async () => {
  const f = fixture();
  await f.tracker.startWatch(target);
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
  f.client.diagnostics = async () => {
    f.set({ checks: [{ key: "test", execution: "2", name: "test", state: "pending" }] });
    return "old failure";
  };
  await f.tracker.tick();
  assert.equal(f.outcomes.length, 0);
  assert.equal(f.tracker.entries.get(target.url)?.watch?.status, "watching");
  f.tracker.dispose();
});

test("unrelated jobs completing during diagnostics do not suppress an unchanged failure", async () => {
  const f = fixture();
  await f.tracker.startWatch(target);
  const failed = { key: "test", execution: "1", name: "test", state: "failed" as const };
  f.set({ checks: [failed, { key: "slow", execution: "2", name: "slow", state: "pending" }] });
  f.client.diagnostics = async () => {
    f.set({ checks: [failed, { key: "slow", execution: "2", name: "slow", state: "passed" }] });
    return "The unchanged test failure";
  };
  await f.tracker.tick();
  assert.equal(f.outcomes.length, 1);
  assert.equal(f.outcomes[0].kind, "failed");
  assert.match(f.outcomes[0].diagnostics!, /unchanged test failure/);
  f.tracker.dispose();
});

test("cancellation and session disposal prevent late diagnostic delivery", async () => {
  for (const dispose of [false, true]) {
    const f = fixture();
    await f.tracker.startWatch(target);
    f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "failed" }] });
    let release!: (s: string) => void;
    f.client.diagnostics = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const tick = f.tracker.tick();
    await new Promise((resolve) => setImmediate(resolve));
    if (dispose) f.tracker.dispose();
    else f.tracker.cancel(target.url);
    release("late logs");
    await tick;
    assert.equal(f.outcomes.length, 0);
    f.tracker.dispose();
  }
});

test("transient errors retain the last observation, back off, and respect the deadline", async () => {
  const f = fixture();
  await f.tracker.startWatch(target, 1);
  f.fail(new GitHubError("HTTP 503", true));
  await f.tracker.tick();
  const entry = f.tracker.entries.get(target.url)!;
  assert.equal(entry.snapshot?.head, head);
  assert.equal(entry.error, "HTTP 503");
  assert.equal(f.outcomes.length, 0);
  const reads = f.reads();
  f.advance(5_000);
  await f.tracker.tick();
  assert.equal(f.reads(), reads);
  f.advance(55_000);
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "timeout");
  f.tracker.dispose();
});

test("access errors are observation errors, not CI failures", async () => {
  const f = fixture();
  await f.tracker.startWatch(target);
  f.fail(new GitHubError("HTTP 401: authentication required"));
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "error");
  f.tracker.dispose();
});

test("restored watches stay paused until explicitly resumed, preserving the original commit", async () => {
  const f = fixture();
  await f.tracker.startWatch(target);
  const saved = f.persisted.at(-1)!;
  f.tracker.dispose();
  const resumed = fixture();
  resumed.tracker.restore(restoreWatches({ version: 1, watches: saved }));
  await resumed.tracker.tick();
  assert.equal(resumed.reads(), 0);
  assert.equal(resumed.tracker.entries.get(target.url)?.watch?.status, "paused");
  resumed.set({ head: "c".repeat(40) });
  await resumed.tracker.startWatch(target, 60, true);
  await resumed.tracker.tick();
  assert.equal(resumed.outcomes[0]?.kind, "superseded");
  resumed.tracker.dispose();
});

test("cancelling during setup prevents an in-flight start from resurrecting the watch", async () => {
  const f = fixture();
  const original = f.client.snapshot.bind(f.client);
  let release!: (s: Snapshot) => void;
  f.client.snapshot = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const start = f.tracker.startWatch(target);
  f.tracker.cancel(target.url);
  release(await original(target, new AbortController().signal));
  await assert.rejects(start, /cancelled/);
  assert.equal(f.tracker.entries.get(target.url)?.watch, undefined);
  assert.equal(f.outcomes.length, 0);
  f.tracker.dispose();
});

test("an all-skipped check set settles without claiming that CI passed", async () => {
  const f = fixture();
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "skipped" }] });
  await f.tracker.startWatch(target);
  await f.tracker.tick();
  f.advance();
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "completed");
  assert.match(f.outcomes[0]!.summary, /1 skipped/);
  f.tracker.dispose();
});

test("a last-moment head change cannot deliver a success for the old commit", async () => {
  const f = fixture();
  f.set({ checks: [{ key: "test", execution: "1", name: "test", state: "passed" }] });
  await f.tracker.startWatch(target);
  await f.tracker.tick();
  f.client.identity = async () => ({ head: "b".repeat(40), lifecycle: "open" });
  f.advance();
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "superseded");
  f.tracker.dispose();
});

test("passed visible jobs cannot complete a workflow that is still running", async () => {
  const f = fixture();
  const run = parseTarget("https://github.com/acme/widget/actions/runs/100");
  f.set({
    target: run,
    runStatus: "in_progress",
    attempt: 2,
    checks: [{ key: "build", execution: "2:100", name: "build", state: "passed" }],
  });
  await f.tracker.startWatch(run);
  await f.tracker.tick();
  f.advance();
  await f.tracker.tick();
  assert.equal(f.outcomes.length, 0);
  f.set({ runStatus: "completed", conclusion: "success" });
  f.advance();
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "passed");
  f.tracker.dispose();
});

test("a terminal Actions conclusion works even when the run has no jobs", async () => {
  const f = fixture();
  const run = parseTarget("https://github.com/acme/widget/actions/runs/100");
  f.set({ target: run, checks: [], runStatus: "in_progress", attempt: 2 });
  await f.tracker.startWatch(run);
  f.set({ runStatus: "completed", conclusion: "success" });
  await f.tracker.tick();
  assert.equal(f.outcomes[0]?.kind, "passed");
  assert.match(f.outcomes[0]!.summary, /not the whole PR/);
  f.tracker.dispose();
});
