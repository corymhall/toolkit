import assert from "node:assert/strict";
import { createServer } from "node:net";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import test from "node:test";
import { installChild } from "../child.ts";
import { requestChild } from "../transport.ts";
import { key, readJSON, reports } from "../storage.ts";
import { assistant, fixture, harness, serverIdentity } from "./helpers.ts";

test("real receiver correlates settlements and serializes duplicate input without touching a draft", async () => {
  const f = await fixture();
  const h = harness();
  installChild(h.pi, f.file, { call: serverIdentity, env: f.env });
  const request = (op: "status" | "send" | "cancel", extra = {}) =>
    requestChild(f.config, {
      child: f.config.id,
      session: f.config.session,
      op,
      id: "one-request",
      ...extra,
    });
  try {
    await h.emit("session_start");
    assert.equal((await stat(join(f.config.socketDirectory, "input.sock"))).mode & 0o777, 0o600);
    await assert.rejects(
      request("send", { task: { id: "too-early", text: "new task" }, delivery: "followUp" }),
      /busy/,
    );
    await h.emit("agent_start");
    await h.emit("message_end", assistant("Final inspection"));
    await h.emit("agent_end");
    assert.deepEqual(await reports(f.file, f.config), []);
    await h.emit("agent_settled", { aborted: false });
    const [report] = await reports(f.file, f.config);
    assert.equal(report?.task, "initial");
    assert.equal(report?.answer, "Final inspection");
    assert.equal(report?.outcome, "answer");

    const submissions = await Promise.all(
      Array.from({ length: 8 }, () =>
        request("send", {
          task: { id: "follow-up", text: "Inspect the tests" },
          delivery: "followUp",
        }),
      ),
    );
    assert.equal(submissions.length, 8);
    assert.deepEqual(h.users, ["Inspect the tests"]);
    await assert.rejects(
      request("send", { task: { id: "different", text: "Changed input" }, delivery: "followUp" }),
      /reused/,
    );
    await h.emit("agent_start");
    await request("cancel");
    assert.equal(h.aborted(), true);
    await h.emit("message_end", assistant("Cancelled inspection"));
    await h.emit("agent_settled", { aborted: true });
    assert.equal(
      (
        (await readJSON(join(f.folder, "results", `${key("follow-up")}.json`))) as {
          outcome: string;
        }
      ).outcome,
      "aborted",
    );
    assert.equal(((await request("status")) as { state: string }).state, "idle");

    h.session("another-conversation");
    assert.equal(((await request("status")) as { state: string }).state, "session-changed");
    await assert.rejects(
      request("send", { task: { id: "wrong", text: "Wrong session" }, delivery: "followUp" }),
      /conversation changed/,
    );
    assert.deepEqual(h.users, ["Inspect the tests"]);
  } finally {
    await h.emit("session_shutdown");
    await f.clean();
  }
});

test("steering preserves assignment correlation and human-only turns do not create reports", async () => {
  const f = await fixture();
  const h = harness();
  installChild(h.pi, f.file, { call: serverIdentity, env: f.env });
  try {
    await h.emit("session_start");
    await h.emit("agent_start");
    await requestChild(f.config, {
      child: f.config.id,
      session: f.config.session,
      op: "send",
      id: "steer",
      task: { id: "steering-input", text: "Focus on error paths" },
      delivery: "steer",
    });
    await h.emit("message_end", assistant("Provider unavailable", "error"));
    await h.emit("agent_settled", { aborted: false });
    const [report] = await reports(f.file, f.config);
    assert.equal(report?.task, "initial");
    assert.equal(report?.outcome, "error");
    await h.emit("agent_start");
    await h.emit("message_end", assistant("Human-only answer"));
    await h.emit("agent_settled", { aborted: false });
    assert.equal((await reports(f.file, f.config)).length, 1);
  } finally {
    await h.emit("session_shutdown");
    await f.clean();
  }
});

test("reload never reuses an interrupted assignment and releases only its own socket", async () => {
  const f = await fixture();
  let h = harness();
  try {
    installChild(h.pi, f.file, { call: serverIdentity, env: f.env });
    await h.emit("session_start");
    await h.emit("agent_start");
    await h.emit("session_shutdown");
    h = harness();
    installChild(h.pi, f.file, { call: serverIdentity, env: f.env });
    await h.emit("session_start");
    const status = await requestChild(f.config, {
      child: f.config.id,
      session: f.config.session,
      op: "status",
      id: "status",
    });
    assert.equal((status as { state: string }).state, "uncertain");
    await assert.rejects(
      requestChild(f.config, {
        child: f.config.id,
        session: f.config.session,
        op: "send",
        id: "next",
        task: { id: "next", text: "Do more work" },
        delivery: "followUp",
      }),
      /inspection/,
    );
    assert.deepEqual(h.users, []);
  } finally {
    await h.emit("session_shutdown");
    await f.clean();
  }
});

test("occupied receiver survives a failed child startup and shutdown", async () => {
  const f = await fixture();
  const socket = join(f.config.socketDirectory, "input.sock");
  const owner = createServer((client) => {
    client.on("data", () =>
      client.end(JSON.stringify({ ok: true, value: "original owner" }) + "\n"),
    );
  });
  await new Promise<void>((resolve) => owner.listen(socket, resolve));
  const h = harness();
  installChild(h.pi, f.file, { call: serverIdentity, env: f.env });
  try {
    await assert.rejects(h.emit("session_start"), /EADDRINUSE/);
    await h.emit("session_shutdown");
    assert.equal(
      await requestChild(f.config, {
        child: f.config.id,
        session: f.config.session,
        op: "status",
        id: "ping",
      }),
      "original owner",
    );
  } finally {
    await new Promise<void>((resolve) => owner.close(() => resolve()));
    await f.clean();
  }
});

test("failed input submission is durable uncertainty, never retried on duplicate delivery", async () => {
  const f = await fixture();
  const h = harness();
  installChild(h.pi, f.file, { call: serverIdentity, env: f.env });
  try {
    await h.emit("session_start");
    await h.emit("agent_start");
    await h.emit("message_end", assistant("Done"));
    await h.emit("agent_settled", { aborted: false });
    h.rejectInput(true);
    const input = {
      child: f.config.id,
      session: f.config.session,
      op: "send" as const,
      id: "failed",
      task: { id: "failed", text: "Inspect more" },
      delivery: "followUp" as const,
    };
    await assert.rejects(requestChild(f.config, input), /input rejected/);
    h.rejectInput(false);
    await assert.rejects(requestChild(f.config, input), /uncertain/);
    assert.deepEqual(h.users, []);
  } finally {
    await h.emit("session_shutdown");
    await f.clean();
  }
});
