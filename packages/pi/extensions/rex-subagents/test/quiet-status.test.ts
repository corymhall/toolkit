import assert from "node:assert/strict";
import test from "node:test";
import { installQuietChildStatus } from "../quiet-status.ts";
import { harness } from "./helpers.ts";

function state(encoded: string) {
  return { state: /state=(\w+)/.exec(encoded)?.[1], kind: /kind=(\w+)/.exec(encoded)?.[1] };
}

test("child terminal reports activity and input without done or error attention", async () => {
  const h = harness();
  const output: string[] = [];
  installQuietChildStatus(h.pi, { enabled: true, isTTY: true, write: (text) => output.push(text) });
  const last = () => state(output.at(-1)!);
  await h.emit("session_start");
  assert.equal(last().state, "idle");
  await h.emit("agent_start");
  assert.equal(last().state, "working");
  await h.emit("agent_end");
  assert.equal(last().state, "working");
  await h.emit("ui_prompt_start", { kind: "confirm", title: "Approve access" });
  assert.equal(last().state, "blocked");
  assert.equal(last().kind, "permission");
  await h.emit("ui_prompt_end");
  assert.equal(last().state, "working");
  await h.emit("agent_settled", { aborted: false });
  assert.equal(last().state, "idle");
  await h.emit("agent_start");
  await h.emit("agent_settled", { aborted: true });
  assert.equal(last().state, "idle");
  await h.emit("session_shutdown");
  assert.equal(last().state, "clear");
  assert.ok(output.every((encoded) => !["done", "error"].includes(state(encoded).state || "")));
});

test("quiet status leaves normal parent reporting alone and never writes to a non-TTY", async () => {
  for (const [enabled, isTTY] of [
    [false, true],
    [true, false],
  ]) {
    const h = harness();
    let writes = 0;
    installQuietChildStatus(h.pi, {
      enabled: enabled!,
      isTTY: isTTY!,
      write() {
        writes++;
      },
    });
    await h.emit("session_start");
    await h.emit("agent_start");
    await h.emit("agent_settled");
    assert.equal(writes, 0);
  }
});
