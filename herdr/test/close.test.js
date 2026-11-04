import { test } from "node:test";
import assert from "node:assert/strict";
import { executeClose } from "../mods/toolkit-workbench/close.js";
import { closePlan, graduate, reconcile, initialState } from "../mods/toolkit-workbench/model.js";
import { fixture } from "./fixtures/world.js";

function harness() {
  const h = { world: fixture(), calls: [] };
  h.state = reconcile(initialState(), h.world);
  h.io = {
    readState: () => h.state,
    readWorld: () => h.world,
    kill: async (id) => {
      h.calls.push(`kill ${id}`);
      h.world.terminals.find((t) => t.address === id).state = "finished";
    },
    closeTab: async (id) => {
      h.calls.push(`close ${id}`);
      for (const pane of h.world.panes.filter((p) => p.tab === id))
        h.world.terminals.find((t) => t.address === pane.terminal).state = "finished";
      h.world.spaces[0].tabs = h.world.spaces[0].tabs.filter((t) => t.id !== id);
      h.world.panes = h.world.panes.filter((p) => p.tab !== id);
    },
    verify: async () => {
      h.calls.push("verify");
      assert.deepEqual(
        h.world.spaces[0].tabs.map((t) => t.id),
        ["other"],
      );
    },
  };
  return h;
}

test("close kills deepest descendants first, then auxiliaries, then main, and verifies", async () => {
  const h = harness();
  await executeClose(closePlan(h.state, h.world, "main"), h.io);
  assert.deepEqual(h.calls, [
    "kill grandchild",
    "kill kid",
    "close helper",
    "close main",
    "verify",
  ]);
});

test("changed confirmation scope has no effects", async () => {
  const h = harness(),
    plan = closePlan(h.state, h.world, "main");
  h.state = graduate(h.state, "helper");
  const result = await executeClose(plan, h.io);
  assert(result.changed);
  assert.deepEqual(h.calls, []);
});

test("graduation while a command is in flight stops before touching the independent tab", async () => {
  const h = harness(),
    kill = h.io.kill;
  h.io.kill = async (id) => {
    await kill(id);
    h.state = graduate(h.state, "helper");
  };
  await assert.rejects(
    executeClose(closePlan(h.state, h.world, "main"), h.io),
    /ownership changed.*earlier terminals/s,
  );
  assert.deepEqual(h.calls, ["kill grandchild"]);
  assert(h.world.spaces[0].tabs.some((t) => t.id === "helper"));
});

test("a failed auxiliary close leaves main open and does not report success", async () => {
  const h = harness();
  h.io.closeTab = async () => {
    throw new Error("command rejected");
  };
  await assert.rejects(
    executeClose(closePlan(h.state, h.world, "main"), h.io),
    /command rejected.*Inspect Full/s,
  );
  assert(h.world.spaces[0].tabs.some((t) => t.id === "main"));
  assert(!h.calls.includes("verify"));
});

test("finished intermediate terminals are not killed but their live children remain in scope", async () => {
  const h = harness();
  h.world.terminals.find((t) => t.address === "kid").state = "finished";
  await executeClose(closePlan(h.state, h.world, "main"), h.io);
  assert.deepEqual(h.calls, ["kill grandchild", "close helper", "close main", "verify"]);
});

test("verification failure is surfaced after effects, without an automatic retry", async () => {
  const h = harness();
  h.io.verify = async () => {
    throw new Error("terminal still live");
  };
  await assert.rejects(
    executeClose(closePlan(h.state, h.world, "main"), h.io),
    /terminal still live.*earlier terminals/s,
  );
  assert.equal(h.calls.filter((call) => call === "close main").length, 1);
});
