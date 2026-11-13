import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTarget, type Tracked } from "../model.ts";
import { observationKey } from "../auto-watch.ts";
import {
  ciProgramStatus,
  CiTerminalStatus,
  type ProgramStatus,
  type StatusTerminal,
} from "../terminal-status.ts";

function watched(number: number, state: "pending" | "passed" | "failed"): Tracked {
  const target = parseTarget(`https://github.com/acme/widget/pull/${number}`);
  return {
    target,
    due: 0,
    failures: 0,
    snapshot: {
      target,
      head: "a".repeat(40),
      title: "PR",
      lifecycle: "open",
      observedAt: 1_000,
      checks: [{ key: "test", execution: "1", name: "test", state }],
    },
    watch: {
      target,
      head: "a".repeat(40),
      startedAt: 1,
      deadline: 100_000,
      status: state === "pending" ? "watching" : "ended",
      outcome: state === "pending" ? undefined : { kind: state, summary: `CI ${state}` },
    },
  };
}
function terminalFixture() {
  const reports: ProgramStatus[] = [];
  const terminal = {
    setProgramStatus: (status: ProgramStatus) => {
      reports.push({ ...status });
    },
  };
  const original = terminal.setProgramStatus;
  const reporter = new CiTerminalStatus();
  reporter.attach(terminal, { state: "idle", app: "pi" });
  return { terminal, reporter, original, reports, last: () => reports.at(-1)! };
}

test("one aggregate gives blocked priority over working, and working priority over done", () => {
  const entries = [watched(1, "passed"), watched(2, "pending"), watched(3, "failed")];
  assert.equal(ciProgramStatus(entries, 1_000)?.state, "blocked");
  assert.equal(ciProgramStatus(entries, 1_000)!.message, "1 failed · 2 other CI target(s)");
  entries.pop();
  assert.equal(ciProgramStatus(entries, 1_000)?.state, "working");
  entries.pop();
  assert.equal(ciProgramStatus(entries, 1_000)?.state, "done");
});

test("Pi working replaces CI blocked until settlement, in either native/extension event order", () => {
  for (const nativeFirst of [true, false]) {
    const f = terminalFixture();
    const red = watched(42, "failed");
    f.reporter.update([red], 1_000);
    assert.equal(f.last().state, "blocked");
    f.reporter.agentStarted("Investigate CI");
    assert.deepEqual(f.last(), { state: "working", app: "pi", message: "Investigate CI" });
    f.reporter.update([red], 1_000);
    assert.equal(f.last().state, "working");
    if (nativeFirst) {
      f.terminal.setProgramStatus({ state: "done", app: "pi", message: "Agent finished" });
      assert.equal(f.last().state, "working");
      f.reporter.agentSettled();
    } else {
      f.reporter.agentSettled();
      assert.equal(f.last().state, "working");
      f.terminal.setProgramStatus({ state: "done", app: "pi", message: "Agent finished" });
    }
    assert.equal(f.last().state, "blocked");
    assert.equal(red.snapshot!.checks[0].state, "failed");
    f.reporter.detach();
  }
});

test("Pi done cannot mask pending CI, and cancelled watches restore the native status", () => {
  const f = terminalFixture();
  const pending = watched(42, "pending");
  f.reporter.update([pending], 1_000);
  f.terminal.setProgramStatus({ state: "done", app: "pi", message: "Agent finished" });
  assert.equal(f.last().state, "working");
  assert.match(f.last().message!, /CI|pending/);
  pending.watch!.status = "cancelled";
  f.reporter.update([pending], 1_000);
  assert.deepEqual(f.last(), { state: "done", app: "pi", message: "Agent finished" });
  f.reporter.detach();
});

test("automatic green remains done without ending the subscription, then follows the rerun", () => {
  const f = terminalFixture();
  const row = watched(42, "passed");
  row.watch!.automatic = true;
  row.watch!.status = "watching";
  row.receipt = {
    head: row.snapshot!.head,
    problems: {},
    completed: observationKey(row.snapshot!),
  };
  f.reporter.update([row], 1_000);
  assert.equal(f.last().state, "done");
  row.snapshot!.checks[0] = { key: "test", execution: "2", name: "test", state: "pending" };
  f.reporter.update([row], 1_000);
  assert.equal(f.last().state, "working");
  row.snapshot!.checks[0].state = "failed";
  f.reporter.update([row], 1_000);
  assert.equal(f.last().state, "blocked");
  f.reporter.detach();
});

test("real permission/auth prompts and native errors retain precedence over CI", () => {
  const f = terminalFixture();
  f.reporter.update([watched(42, "passed")], 1_000);
  const prompt: ProgramStatus = {
    state: "blocked",
    app: "pi",
    kind: "permission",
    message: "Approve operation?",
  };
  f.terminal.setProgramStatus(prompt);
  assert.deepEqual(f.last(), prompt);
  f.reporter.update([watched(42, "failed")], 1_000);
  assert.deepEqual(f.last(), prompt);
  f.terminal.setProgramStatus({
    state: "error",
    app: "pi",
    message: "Provider authentication failed",
  });
  assert.equal(f.last().state, "error");
  f.reporter.agentStarted();
  assert.equal(f.last().state, "working");
  f.reporter.detach();
});

test("paused, passive, superseded, and newly pushed targets cannot leave stale CI alerts", () => {
  const paused = watched(1, "failed");
  paused.watch!.status = "paused";
  const passive = watched(2, "failed");
  passive.watch = undefined;
  const superseded = watched(3, "failed");
  superseded.watch!.outcome = { kind: "superseded", summary: "New commit" };
  const pushed = watched(4, "failed");
  pushed.snapshot!.head = "b".repeat(40);
  assert.equal(ciProgramStatus([paused, passive, superseded, pushed], 1_000), undefined);
});

test("green visible jobs wait for confirmed completion, and stale reads never report green", () => {
  const row = watched(42, "passed");
  row.watch!.status = "watching";
  assert.equal(ciProgramStatus([row], 1_000)?.state, "working");
  row.watch!.status = "ended";
  row.error = "HTTP 503";
  assert.equal(ciProgramStatus([row], 1_000)?.state, "blocked");
});

test("detaching restores the native setter and last native state without leaking CI into a new session", () => {
  const f = terminalFixture();
  f.terminal.setProgramStatus({ state: "done", app: "pi", message: "Native result" });
  f.reporter.update([watched(42, "failed")], 1_000);
  f.reporter.detach();
  assert.equal(f.terminal.setProgramStatus, f.original);
  assert.deepEqual(f.last(), { state: "done", app: "pi", message: "Native result" });
  const count = f.reports.length;
  f.reporter.update([watched(42, "pending")], 1_000);
  assert.equal(f.reports.length, count);
});

test("do not overwrite another extension's replacement setter, and tolerate older terminals", () => {
  const f = terminalFixture();
  const intercepted = f.terminal.setProgramStatus;
  const replacement = (status: ProgramStatus) => intercepted(status);
  f.terminal.setProgramStatus = replacement;
  const count = f.reports.length;
  f.reporter.detach();
  assert.equal(f.terminal.setProgramStatus, replacement);
  assert.equal(f.reports.length, count);
  f.terminal.setProgramStatus({ state: "working", app: "pi", message: "After detach" });
  assert.equal(f.reports.length, count + 1);
  assert.equal(f.last().message, "After detach");
  assert.equal(new CiTerminalStatus().attach({} as StatusTerminal, { state: "idle" }), false);
});
