import assert from "node:assert/strict";
import { test } from "node:test";
import { BackgroundTerminalStatus, type ProgramStatus } from "../../program-status.ts";

// Independent imports mirror Pi's uncached extension loader. A module-local
// registry would produce competing wrappers and lose one source's attention.
for (const commandFirst of [true, false]) {
  test(`CI and commands share status and detach independently, command first ${commandFirst}`, async () => {
    const otherModule = "../../program-status.ts?independent-extension";
    const { BackgroundTerminalStatus: OtherStatus } = await import(otherModule);
    const command = new BackgroundTerminalStatus();
    const ci = new OtherStatus();
    const reports: ProgramStatus[] = [];
    const terminal = { setProgramStatus: (status: ProgramStatus) => reports.push(status) };
    const original = terminal.setProgramStatus;
    const [first, second] = commandFirst ? [command, ci] : [ci, command];
    first.attach(terminal, { state: "idle", app: "pi" });
    const compositor = terminal.setProgramStatus;
    second.attach(terminal, { state: "idle", app: "pi" });
    assert.equal(terminal.setProgramStatus, compositor);
    ci.updateStatus({ state: "done", message: "CI passed" });
    command.updateStatus({ state: "working", message: "Waiting for command" });
    terminal.setProgramStatus({ state: "done", app: "pi" });
    assert.equal(reports.at(-1)?.message, "Waiting for command");
    ci.updateStatus({ state: "blocked", message: "CI failed" });
    assert.equal(reports.at(-1)?.state, "blocked");

    const prompt: ProgramStatus = { state: "blocked", kind: "permission", message: "Approve?" };
    terminal.setProgramStatus(prompt);
    command.agentQueued();
    command.updateStatus();
    assert.deepEqual(reports.at(-1), prompt);
    command.agentStarted();
    assert.equal(reports.at(-1)?.state, "working");
    terminal.setProgramStatus({ state: "done", app: "pi" });
    assert.equal(reports.at(-1)?.state, "working");
    command.agentSettled();
    assert.equal(reports.at(-1)?.message, "CI failed");

    first.detach();
    assert.equal(terminal.setProgramStatus, compositor);
    if (commandFirst) assert.equal(reports.at(-1)?.state, "blocked");
    else assert.equal(reports.at(-1)?.state, "done");
    second.detach();
    assert.equal(terminal.setProgramStatus, original);
    assert.deepEqual(reports.at(-1), { state: "done", app: "pi" });
  });
}
