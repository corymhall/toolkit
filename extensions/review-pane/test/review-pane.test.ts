import assert from "node:assert/strict";
import test from "node:test";
import reviewPane, { diffCommand, selectTarget } from "../index.ts";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

test("revision input cannot introduce Ex commands or Diffview options", () => {
  for (const base of ["main | !touch /tmp/pwn", "main\nquit", "--cached", "main bar", ""]) {
    assert.throws(() => diffCommand(base));
  }
  assert.equal(diffCommand("origin/main...HEAD"), "DiffviewOpen origin/main...HEAD");
});

test("attachment requires a unique Pi target in the exact calling pane", () => {
  const target = { id: "target", harness: "pi", rex_session: "s", rex_block: "b" };
  assert.equal(
    selectTarget([{ ...target, id: "other", rex_block: "other" }, target], "s", "b"),
    "target",
  );
  assert.throws(() => selectTarget([target, target], "s", "b"));
  assert.throws(() => selectTarget([{ ...target, harness: "codex" }], "s", "b"));
});

test("opens once, reuses the owned pane, and never mutates on cancelled confirmation", async () => {
  const previous = { ...process.env };
  process.env.REX_SESSION = "s";
  process.env.REX_BLOCK = "b";
  try {
    let handler!: (args: string, ctx: ExtensionContext) => Promise<void>;
    let label: string | undefined;
    let confirmed = false;
    let deliveryError: string | undefined;
    let loseSplitResponse = true;
    const calls: string[][] = [];
    const notices: string[] = [];
    reviewPane({
      registerTool() {},
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
      },
      async exec(program: string, args: string[]) {
        calls.push([program, ...args]);
        let value: unknown = {};
        if (args.includes("inspect"))
          value = {
            session_id: "s",
            windows: [
              {
                layers: [
                  {
                    blocks: [{ block_id: "b" }, ...(label ? [{ block_id: "review", label }] : [])],
                  },
                ],
              },
            ],
          };
        if (program === "commentry")
          value = args.includes("list")
            ? {
                ok: true,
                result: {
                  sessions: [{ id: "target", harness: "pi", rex_session: "s", rex_block: "b" }],
                },
              }
            : { ok: true, result: { delivery_error: deliveryError } };
        if (args.includes("split")) {
          label = args[args.indexOf("--label") + 1];
          if (loseSplitResponse) {
            loseSplitResponse = false;
            throw new Error("Lost split response");
          }
          value = { block_ids: ["review", "b"] };
        }
        if (args.includes("focus")) {
          assert.equal(args.includes("--json"), false);
          return { code: 0, stdout: "", stderr: "", killed: false };
        }
        return { code: 0, stdout: JSON.stringify(value), stderr: "", killed: false };
      },
    } as unknown as ExtensionAPI);
    const ctx = {
      cwd: "/repo with spaces",
      hasUI: true,
      sessionManager: { getSessionId: () => "pi-session" },
      ui: { confirm: async () => confirmed, notify: (message: string) => notices.push(message) },
    } as unknown as ExtensionContext;
    await handler("", ctx);
    assert.equal(
      calls.some((call) => call.includes("attach") || call.includes("split")),
      false,
    );
    confirmed = true;
    deliveryError = "native queue unavailable";
    await handler("", ctx);
    assert.ok(notices.at(-1)?.includes("pending comment delivery failed"));
    assert.equal(
      calls.some((call) => call.includes("split")),
      false,
    );
    deliveryError = undefined;
    await handler("", ctx);
    assert.ok(notices.at(-1)?.includes("Lost split response"));
    await handler("", ctx);
    assert.equal(calls.filter((call) => call.includes("split")).length, 1);
    assert.equal(calls.filter((call) => call.includes("focus")).length, 1);
    assert.ok(notices.at(-1)?.includes("existing editor view was preserved"));
    const split = calls.find((call) => call.includes("split"))!;
    assert.deepEqual(split.slice(-3), ["nvim", "-c", "DiffviewOpen"]);
    assert.ok(split.includes("/repo with spaces"));
    // A closed pane should be recreated, including the normal split-success path.
    label = undefined;
    await handler("", ctx);
    assert.equal(calls.filter((call) => call.includes("split")).length, 2);
    assert.ok(notices.at(-1)?.includes("Opened review pane review with DiffviewOpen"));
  } finally {
    for (const key of ["REX_SESSION", "REX_BLOCK"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
