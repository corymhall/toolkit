import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import commandRunner from "../index.ts";
import { buildRunMarkers } from "../command-runner.ts";
import { parseRexProcess } from "../rex.ts";

const runId = "12345678-1234-1234-1234-123456789abc";
const markers = buildRunMarkers(runId);

function server() {
  let instance = "server-one";
  let pane: { id: string; label: string } | undefined;
  let busy = false;
  let transcript = "";
  let submissions = 0;
  let splits = 0;
  let loseSubmission = false;
  let loseSplit = false;
  let finishOnRead = false;
  const exec = async (command: string, raw: string[]) => {
    assert.equal(command, "rex");
    assert.deepEqual(raw.slice(0, 3), ["--server", "unix:///test.sock", "--autostart=false"]);
    const args = raw.slice(3);
    let result: unknown;
    if (args[0] === "api" && args[2] === "server.status") result = { instance_id: instance };
    else if (args[0] === "session") {
      assert.deepEqual(args, ["session", "inspect", "session:test", "--json"]);
      result = {
        session_id: "session:test",
        windows: [
          {
            window_id: "window:test",
            layers: [
              {
                blocks: [
                  {
                    block_id: "block:caller",
                    creator_name: "com.superlogical.terminal",
                    label: "Pi",
                  },
                  {
                    block_id: "block:other",
                    creator_name: "com.superlogical.terminal",
                    label: "Other Pi",
                  },
                  ...(pane
                    ? [
                        {
                          block_id: pane.id,
                          creator_name: "com.superlogical.terminal",
                          label: pane.label,
                        },
                      ]
                    : []),
                ],
              },
            ],
          },
        ],
      };
    } else if (args[0] === "split") {
      assert.deepEqual(args.slice(0, 7), [
        "split",
        "-s",
        "session:test",
        "-b",
        args[4],
        "--split=below",
        "--ratio",
      ]);
      assert.ok(args[4] === "block:caller" || args[4] === "block:other");
      assert.equal(args[7], "10");
      assert.ok(args.includes("--focus=false"));
      splits++;
      busy = false;
      pane = { id: `block:command-${splits}`, label: args[args.indexOf("--label") + 1]! };
      if (loseSplit) {
        loseSplit = false;
        return { code: 1, stdout: "", stderr: "connection lost", killed: false };
      }
      result = { block_ids: [pane.id, "block:caller"] };
    } else if (args[0] === "api" && args.includes("session.set_block_label")) {
      const data = JSON.parse(args.at(-1)!);
      assert.equal(data.block_id, pane!.id);
      pane!.label = data.label;
      result = {};
    } else if (args[0] === "block") {
      assert.deepEqual(args.slice(0, 6), ["block", "call", "-s", "session:test", "-b", pane!.id]);
      const method = args[6];
      const data = JSON.parse(args[7]!);
      if (method === "process")
        result = {
          child: { pid: 10, name: "zsh" },
          foreground: busy ? { pid: 20, name: "make" } : { pid: 10, name: "zsh" },
          last_exit: null,
        };
      else if (method === "write") {
        assert.ok(data.data.startsWith("printf "));
        assert.ok(data.data.endsWith("\r"));
        submissions++;
        busy = true;
        transcript = `${markers.start}\ncompiling`;
        if (loseSubmission)
          return { code: 1, stdout: "", stderr: "connection lost", killed: false };
        result = { bytes_written: data.data.length };
      } else if (method === "format") {
        assert.deepEqual(data, { format: "text", trim: true, unwrap: true });
        if (finishOnRead) {
          finishOnRead = false;
          transcript += `\n${markers.endPrefix}7`;
          busy = false;
        }
        result = { content: transcript };
      } else throw new Error(`Unexpected block method ${method}`);
    } else throw new Error(`Unexpected Rex call ${args.join(" ")}`);
    return { code: 0, stdout: JSON.stringify(result), stderr: "", killed: false };
  };
  return {
    exec,
    get submissions() {
      return submissions;
    },
    get splits() {
      return splits;
    },
    loseSubmission: () => {
      loseSubmission = true;
    },
    loseSplit: () => {
      loseSplit = true;
    },
    finishOnRead: () => {
      finishOnRead = true;
    },
    removePane: () => {
      pane = undefined;
    },
    restart: () => {
      instance = "server-two";
    },
  };
}

function load(remote: ReturnType<typeof server>, directory: string, caller = "block:caller") {
  const tools = new Map<string, any>();
  const handlers = new Map<string, any>();
  const pi = {
    exec: remote.exec,
    registerTool: (tool: any) => tools.set(tool.name, tool),
    on: (name: string, handler: any) => handlers.set(name, handler),
    appendEntry() {},
  } as unknown as ExtensionAPI;
  const previous = { ...process.env };
  try {
    delete process.env.HERDR_ENV;
    Object.assign(process.env, {
      REX_SESSION: "session:test",
      REX_BLOCK: caller,
      REX_SERVER: "unix:///test.sock",
    });
    commandRunner(pi, { stateDirectory: directory, randomUUID: () => runId, now: () => 5000 });
  } finally {
    process.env = previous;
  }
  return {
    tools,
    restore: (entries: unknown[] = []) =>
      handlers.get("session_start")({}, { sessionManager: { getBranch: () => entries } }),
    start: () =>
      tools
        .get("start_command")
        .execute(
          "start",
          { command: "make private-target", cwd: directory },
          undefined,
          undefined,
          { cwd: directory },
        ),
    status: (params = {}, signal?: AbortSignal) =>
      tools.get("command_status").execute("status", params, signal),
  };
}

async function fixture(
  fn: (remote: ReturnType<typeof server>, directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "rex-runner-test-"));
  try {
    await fn(server(), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("resuming Pi in another terminal does not steal the original Rex command pane", async () =>
  fixture(async (remote, directory) => {
    const first = load(remote, directory);
    const started = await first.start();
    const resumed = load(remote, directory, "block:other");
    await resumed.restore([
      {
        type: "custom",
        customType: "herdr-command-pane",
        data: {
          paneId: started.details.paneId,
          terminalId: started.details.terminalId,
          workspaceId: "session:test",
          tabId: "window:test",
        },
      },
    ]);
    const next = await resumed.start();
    assert.notEqual(next.details.paneId, started.details.paneId);
    assert.equal(remote.splits, 2);
  }));

test("an unresolved Rex split refuses to create a duplicate", async () =>
  fixture(async (remote, directory) => {
    remote.loseSplit();
    await assert.rejects(load(remote, directory).start(), /connection lost/);
    remote.removePane();
    await assert.rejects(load(remote, directory).start(), /split response is unresolved/);
    assert.equal(remote.splits, 1);
    assert.equal(remote.submissions, 0);
  }));

test("Rex shell detection rejects nested shells, other foreground programs, and unknown processes", () => {
  assert.equal(
    parseRexProcess({
      child: { pid: 1, name: "login" },
      foreground: { pid: 2, name: "zsh" },
      ancestors: [{ pid: 1, name: "login" }],
      last_exit: null,
    }).idle,
    true,
  );
  assert.equal(
    parseRexProcess({
      child: { pid: 1, name: "login" },
      foreground: { pid: 3, name: "zsh" },
      ancestors: [
        { pid: 2, name: "zsh" },
        { pid: 1, name: "login" },
      ],
      last_exit: null,
    }).idle,
    false,
  );
  assert.equal(
    parseRexProcess({
      child: { pid: 1, name: "zsh" },
      foreground: { pid: 3, name: "nvim" },
      last_exit: null,
    }).idle,
    false,
  );
  assert.equal(parseRexProcess({ last_exit: null }).idle, false);
});

test("Rex runner starts independently, refuses busy input, and recovers completion in a replacement Pi session", async () =>
  fixture(async (remote, directory) => {
    const first = load(remote, directory);
    await first.restore();
    assert.match(first.tools.get("start_command").description, /Backend: Rex/);
    assert.equal((await first.start()).details.backend, "Rex");
    assert.equal((await first.start()).details.state, "busy");
    assert.equal(remote.submissions, 1);
    const registryPath = join(directory, (await readdir(directory))[0]!);
    const registry = await readFile(registryPath, "utf8");
    assert.ok(!registry.includes("private-target"));
    assert.ok(!registry.includes(directory));
    assert.equal((await stat(registryPath)).mode & 0o777, 0o600);
    const replacement = load(remote, directory);
    await replacement.restore();
    assert.equal((await replacement.status()).details.state, "running");
    remote.finishOnRead();
    const result = await replacement.status({ waitMs: 1000 });
    assert.equal(result.details.state, "completed");
    assert.equal(result.details.exitCode, 7);
    assert.match(result.content[0].text, /compiling/);
    assert.equal(remote.splits, 1);
    await replacement.start();
    assert.equal(remote.splits, 1);
    assert.equal(remote.submissions, 2);
  }));

test("an uncertain Rex submission remains recoverable without resending input", async () =>
  fixture(async (remote, directory) => {
    remote.loseSubmission();
    await assert.rejects(load(remote, directory).start(), /connection lost/);
    const replacement = load(remote, directory);
    await replacement.restore();
    assert.equal((await replacement.status()).details.state, "running");
    assert.equal((await replacement.start()).details.state, "busy");
    assert.equal(remote.submissions, 1);
  }));

test("a lost Rex split response is adopted through its unique label", async () =>
  fixture(async (remote, directory) => {
    remote.loseSplit();
    await assert.rejects(load(remote, directory).start(), /connection lost/);
    const replacement = load(remote, directory);
    await replacement.restore();
    await replacement.start();
    assert.equal(remote.splits, 1);
    assert.equal(remote.submissions, 1);
  }));

test("Rex status cancellation leaves the command running, missing panes are lost, and server changes fail closed", async () =>
  fixture(async (remote, directory) => {
    const runner = load(remote, directory);
    await runner.start();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(runner.status({ waitMs: 1000 }, controller.signal), /abort/i);
    assert.equal((await runner.status()).details.state, "running");
    remote.removePane();
    assert.equal((await runner.status()).details.state, "lost");
    remote.restart();
    await assert.rejects(runner.start(), /server restarted/);
    assert.equal(remote.submissions, 1);
  }));
