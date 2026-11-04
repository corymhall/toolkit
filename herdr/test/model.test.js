import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures/world.js";
import {
  initialState,
  reconcile,
  visibleSessions,
  owner,
  sessionStatus,
  canDismiss,
  track,
  graduate,
  makeMain,
  reorder,
  closePlan,
  pathKey,
  stale,
} from "../mods/toolkit-workbench/model.js";

test("first tab per folder is main; helper ancestry joins its parent", () => {
  const w = fixture(),
    s = reconcile(initialState(), w);
  assert.deepEqual(Object.keys(s.sessions), ["main", "other"]);
  assert.deepEqual(s.sessions.main.tabs, ["main", "helper"]);
  assert.equal(owner(s, "helper").main, "main");
  assert.equal(sessionStatus(s.sessions.main, w), "idle");
  assert(
    canDismiss(s.sessions.main, w),
    "working auxiliary and unpaneled child must not block dismissal",
  );
});
test("dismissal sticks through focus and agent updates until explicit activation", () => {
  const w = fixture();
  let s = reconcile(initialState(), w);
  s = track(s, w, "main", false);
  w.agents[0].status = "working";
  s = reconcile(s, w);
  assert.deepEqual(
    visibleSessions(s, w).map((s) => s.id),
    ["other"],
  );
  assert.equal(visibleSessions(s, w, "full").length, 2);
  assert.throws(() => track(s, w, "main", false), /idle/);
  assert.equal(track(s, w, "main", true).sessions.main.tracked, true);
  for (const status of ["working", "blocked", "done", "unknown"]) {
    w.agents[0].status = status;
    assert.equal(canDismiss(s.sessions.main, w), false);
  }
});
test("graduation preserves same-folder independent session and protects its descendants from close", () => {
  const w = fixture();
  let s = reconcile(initialState(), w);
  s = graduate(s, "helper");
  w.terminals.push({ address: "helper-child", parent: "t2" });
  s = reconcile(s, w);
  assert.deepEqual(s.sessions.helper.tabs, ["helper"]);
  const plan = closePlan(s, w, "main");
  assert.deepEqual(plan.tabs, ["main"]);
  assert.deepEqual(plan.terminals, ["grandchild", "kid", "t1"]);
  assert(!plan.terminals.includes("helper-child"));
  assert.deepEqual(closePlan(s, w, "helper").terminals, ["helper-child", "t2"]);
});
test("graduating the original main after changing main does not overwrite its parent", () => {
  const w = fixture();
  let state = makeMain(reconcile(initialState(), w), "main", "helper");
  state = graduate(state, "main");
  const parent = owner(state, "helper"),
    independent = owner(state, "main");
  assert.notEqual(parent.id, independent.id);
  assert.equal(parent.main, "helper");
  assert.deepEqual(parent.tabs, ["helper"]);
  assert.equal(independent.main, "main");
  assert(!closePlan(state, w, parent.id).terminals.includes("t1"));
  assert(!closePlan(state, w, independent.id).terminals.includes("t2"));
});
test("dropping a grip on itself leaves manual order unchanged", () => {
  const w = fixture();
  let state = graduate(reconcile(initialState(), w), "helper");
  state = reorder(state, "work", "helper", "main");
  assert.deepEqual(reorder(state, "work", "main", "main"), state);
});
test("close scope includes auxiliaries and unpaneled descendants but never another worktree", () => {
  const w = fixture(),
    s = reconcile(initialState(), w),
    p = closePlan(s, w, "main");
  assert.deepEqual(p.tabs, ["helper", "main"]);
  assert.deepEqual(p.terminals, ["grandchild", "kid", "t1", "t2"]);
  assert(!p.terminals.includes("t3"));
  const changed = graduate(s, "helper");
  assert.notEqual(
    closePlan(changed, w, "main").signature,
    p.signature,
    "changed scope needs another confirmation",
  );
});
test("main tab is explicit; changing it changes dismissal policy", () => {
  const w = fixture(),
    s = reconcile(initialState(), w),
    next = makeMain(s, "main", "helper");
  assert(!canDismiss(next.sessions.main, w));
  assert.equal(s.sessions.main.main, "main");
  assert.throws(() => makeMain(s, "main", "other"), /belong/);
});
test("manual ordering and cached metadata cannot change tracking or membership", () => {
  const w = fixture();
  let s = reconcile(initialState(), w);
  s = graduate(s, "helper");
  const p = closePlan(s, w, "main").signature;
  s = reorder(s, "work", "helper", "main");
  assert.equal(visibleSessions(s, w)[0].id, "helper");
  assert.throws(() => reorder(s, "work", "other", "main"), /project/);
  s.projectOrder = [s.sessions.main.projectId, s.sessions.other.projectId];
  const metadata = {
    [pathKey(null, "/work/provider")]: {
      commonDir: "/work/provider/.git",
      worktree: "/work/provider",
      repo: "provider",
    },
  };
  s = reconcile(s, w, metadata);
  assert.equal(s.sessions.main.project, "provider");
  assert.equal(s.projectOrder[0], pathKey(null, "/work/provider/.git"));
  assert.equal(closePlan(s, w, "main").signature, p);
  assert.deepEqual(s.sessions.helper.tabs, ["helper"]);
});
test("offline machines and missing main tabs retain saved identity without becoming new work", () => {
  const w = fixture(),
    s = reconcile(initialState(), w);
  w.spaces = [];
  w.panes = [];
  w.machines = [{ name: null, layout: "unavailable" }];
  assert.deepEqual(reconcile(s, w), s);
  assert.deepEqual(visibleSessions(s, w), []);
});
test("stale/invalid snapshots stay explicit", () => {
  assert(stale(null));
  assert(stale({ checkedAt: "invalid" }));
  assert(stale({ checkedAt: new Date().toISOString(), prError: "auth" }));
  assert(!stale({ checkedAt: new Date().toISOString() }));
  assert.throws(() => initialState({ version: 42 }), /version/);
});
