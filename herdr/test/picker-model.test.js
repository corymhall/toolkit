import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures/world.js";
import { initialState, reconcile, track, graduate } from "../mods/toolkit-workbench/model.js";
import {
  matches,
  workRows,
  openRows,
  selectedRow,
  plain,
} from "../mods/toolkit-workbench/picker-model.js";

test("work picker lists auxiliary tabs separately without rolling helper activity into the main", () => {
  const world = fixture();
  const state = reconcile(initialState(), world);
  const rows = workRows(state, world, "main");
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.id === "main").status, "idle");
  assert.equal(rows[0].id, "helper");
  assert.match(rows[0].detail, /auxiliary/);
  assert.match(rows.find((r) => r.id === "main").detail, /current.*tracked/);
});

test("dismissed and independently graduated work remain navigation targets", () => {
  const world = fixture();
  let state = reconcile(initialState(), world);
  state = track(state, world, "main", false);
  state = graduate(state, "helper");
  const rows = workRows(state, world, null);
  assert.match(rows.find((r) => r.id === "main").detail, /dismissed/);
  assert.match(rows.find((r) => r.id === "helper").detail, /tracked/);
  assert.equal(state.sessions.main.tracked, false);
});

test("only pane-owned agent reports affect a tab, not invisible descendants", () => {
  const world = fixture();
  world.agents.find((a) => a.address === "kid").status = "blocked";
  const rows = workRows(reconcile(initialState(), world), world, "main");
  assert.equal(rows.find((r) => r.id === "main").status, "idle");
});

test("fuzzy words match across project and checkout labels; missing selection falls back", () => {
  assert.equal(matches("provider / fix-import · /work/aws", "prv fx"), true);
  assert.equal(matches("provider / fix-import", "fix missing"), false);
  const rows = [{ id: "a" }, { id: "b" }];
  assert.equal(selectedRow(rows, "b").id, "b");
  assert.equal(selectedRow(rows, "closed").id, "a");
  assert.equal(selectedRow([], "closed"), null);
});

test("nested worktrees use the deepest checkout and remote panes do not mark local work open", () => {
  const world = fixture();
  const state = reconcile(initialState(), world);
  world.spaces.push({ id: "remote", machine: "server", tabs: [{ id: "remote-tab" }] });
  world.panes.push({ tab: "remote-tab", cwd: "/elsewhere/repo" });
  const rows = openRows(
    [
      { id: "primary", path: "/work/provider", detail: "primary" },
      { id: "feature", path: "/work/provider/.worktrees/upgrade", detail: "upgrade" },
      { id: "remote-only", path: "/elsewhere/repo", detail: "main" },
    ],
    state,
    world,
  );
  assert.match(rows[0].detail, /^open/);
  assert.match(rows[1].detail, /^open/);
  assert.equal(rows[2].detail, "main");
  world.panes = world.panes.filter((p) => p.tab === "other");
  const onlyNested = openRows(
    rows.map((r) => ({ ...r, detail: "" })),
    initialState(),
    world,
  );
  assert.equal(onlyNested[0].detail, "");
  assert.match(onlyNested[1].detail, /^open/);
});

test("previews remove terminal controls without erasing readable lines", () => {
  assert.equal(
    plain("\x1b]0;title\x07\x1b[31mfailed\x1b[0m\nnext\tline\x00"),
    "failed\nnext\tline",
  );
});
