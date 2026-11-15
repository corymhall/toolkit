import assert from "node:assert/strict";
import test from "node:test";
import { deliverReports } from "../delivery.ts";
import { RESULT_TYPE, type Report } from "../storage.ts";
import { harness } from "./helpers.ts";

const report: Report = {
  child: "child",
  name: "reader",
  parent: "parent",
  session: "session",
  task: "first",
  answer: "Evidence from the child",
  outcome: "answer",
  truncated: false,
  finishedAt: 100,
};

test("only a persisted result message acknowledges delivery across restart", () => {
  const h = harness();
  const queued = new Set<string>();
  deliverReports(h.pi, h.ctx, [report], queued);
  deliverReports(h.pi, h.ctx, [report], queued);
  assert.equal(h.messages.length, 1);
  // Losing a runtime before Pi saves its queue must not lose the report.
  deliverReports(h.pi, h.ctx, [report], new Set());
  assert.equal(h.messages.length, 2);
  h.entries.push({
    type: "custom_message",
    customType: RESULT_TYPE,
    details: { resultId: "child/first" },
  });
  deliverReports(h.pi, h.ctx, [report], new Set());
  assert.equal(h.messages.length, 2);
  deliverReports(h.pi, h.ctx, [{ ...report, task: "second" }], new Set());
  assert.equal(h.messages.length, 3);
});

test("a failed send does not suppress later delivery", () => {
  const h = harness();
  const queued = new Set<string>();
  const send = h.pi.sendMessage.bind(h.pi);
  h.pi.sendMessage = () => {
    throw new Error("queue rejected");
  };
  assert.throws(() => deliverReports(h.pi, h.ctx, [report], queued), /queue rejected/);
  h.pi.sendMessage = send;
  deliverReports(h.pi, h.ctx, [report], queued);
  assert.equal(h.messages.length, 1);
});
