import assert from "node:assert/strict";
import test from "node:test";
import delegateExtension, { piCommand } from "../index.ts";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { sessionReferencePrompt } from "../../copy-session/session-reference.ts";

test("launches the current Pi installation without replaying parent startup flags", () => {
  assert.deepEqual(piCommand("/opt/pi", ["/opt/pi", "--resume", "old"]), ["/opt/pi"]);
  assert.deepEqual(
    piCommand("/opt/node", ["/opt/node", "/packages/pi/cli.js", "--session", "old"]),
    ["/opt/node", "/packages/pi/cli.js"],
  );
  assert.throws(() => piCommand("/opt/node", ["/opt/node", "--resume"]));
});

test("opens the picker in the calling tab and privately hands off instructions without launching work", async () => {
  const previous = { ...process.env };
  const temporary = await mkdtemp(join(tmpdir(), "delegate-test-"));
  const picker = join(temporary, "picker.py");
  await writeFile(picker, "# test picker\n");
  Object.assign(process.env, {
    REX_SESSION: "source-session",
    REX_BLOCK: "source-block",
    TOOLKIT_REX_PICKER: picker,
  });
  delete process.env.REX_CLIENT;
  const requests: string[] = [];
  let losePopupResponse = false;
  let popupCalls = 0;
  try {
    let handler!: (args: string, ctx: ExtensionContext) => Promise<void>;
    const notices: string[] = [];
    delegateExtension({
      registerCommand(name: string, command: { handler: typeof handler }) {
        assert.equal(name, "delegate");
        handler = command.handler;
      },
      async exec(program: string, args: string[]) {
        assert.equal(program, "rex");
        let value: unknown;
        if (args.includes("inspect"))
          value = {
            session_id: "source-session",
            active_window_id: "other-tab",
            windows: [
              { window_id: "source-tab", layers: [{ blocks: [{ block_id: "source-block" }] }] },
              { window_id: "other-tab", layers: [] },
            ],
          };
        else if (args.includes("client"))
          value = {
            clients: [
              { client_id: "unrelated", info: { kind: "app" }, session_ids: ["other-session"] },
              { client_id: "source-app", info: { kind: "app" }, session_ids: ["source-session"] },
            ],
          };
        else if (args.includes("session.focus_block")) value = { revision: 1 };
        else if (args.includes("session.new_layer")) {
          const payload = JSON.parse(args.at(-1)!);
          assert.equal(payload.window_id, "source-tab");
          const command: string[] = payload.layout.block.options.command;
          assert.ok(command.includes("REX_CLIENT=source-app"));
          popupCalls++;
          const request = command.at(-1)!;
          requests.push(request);
          const handoff = JSON.parse(await readFile(request, "utf8"));
          assert.equal((await stat(request)).mode & 0o777, 0o600);
          assert.equal(handoff.picker, picker);
          assert.ok(handoff.command.at(-1).includes("Implement the target change."));
          assert.ok(handoff.command.at(-1).includes("Session ID: source-id"));
          if (losePopupResponse) throw new Error("Lost popup response");
          value = { layer_id: "popup", block_ids: ["picker-block"] };
        } else throw new Error(`Unexpected operation: ${args.join(" ")}`);
        return { code: 0, stdout: JSON.stringify(value), stderr: "" };
      },
    } as unknown as ExtensionAPI);
    const ctx = {
      hasUI: true,
      cwd: "/source",
      sessionManager: {
        getSessionFile: () => "/saved/source.jsonl",
        getSessionId: () => "source-id",
      },
      ui: { notify: (message: string) => notices.push(message) },
    } as unknown as ExtensionContext;
    await handler("Implement the target change.", ctx);
    assert.ok(notices.at(-1)?.startsWith("Delegate picker opened."));
    assert.equal(requests.length, 1);
    // A lost response may already have opened the popup. Preserve its handoff
    // and ask for inspection rather than automatically creating a second one.
    losePopupResponse = true;
    await handler("Implement the target change.", ctx);
    assert.equal(popupCalls, 2);
    assert.ok(notices.at(-1)?.includes("Inspect Rex before retrying"));
    assert.ok(notices.at(-1)?.includes(requests[1]!));
    await stat(requests[1]!);
  } finally {
    for (const request of requests) await rm(dirname(request), { recursive: true, force: true });
    await rm(temporary, { recursive: true, force: true });
    for (const key of ["REX_SESSION", "REX_BLOCK", "REX_CLIENT", "TOOLKIT_REX_PICKER"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("handoff keeps source identity distinct from custom instructions", () => {
  const prompt = sessionReferencePrompt(
    { file: '/sessions/source "one".jsonl', id: "source-id", cwd: "/source repository" },
    "Fix the target repository.\nDo not copy uncommitted source changes.",
  );
  const referenceLine = prompt.split("\n").find((line) => line.startsWith("Session reference: "))!;
  assert.equal(
    JSON.parse(referenceLine.slice("Session reference: ".length)),
    '/sessions/source "one".jsonl',
  );
  assert.ok(prompt.includes("Session ID: source-id"));
  assert.ok(prompt.includes("Fix the target repository.\nDo not copy uncommitted source changes."));
  assert.ok(prompt.includes("Treat the session as historical evidence"));
});
