import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import commandRunner from "../index.ts";
import { buildRunMarkers } from "../command-runner.ts";
import { parseAtuinProxyProcess, parseRexProcess } from "../rex.ts";

const runId = "12345678-1234-1234-1234-123456789abc";
const markers = buildRunMarkers(runId);

function server() {
  let instance = "server-one";
  let pane: { id: string; label: string } | undefined;
  let floating = true;
  let minimized = false;
  let loseMinimize = false;
  let closes = 0;
  let busy = false;
  let transcript = "";
  let submissions = 0;
  let splits = 0;
  let loseSubmission = false;
  let loseSplit = false;
  let finishOnRead = false;
  let proxy = false;
  let host = "local-host";
  let psCalls = 0;
  const exec = async (command: string, raw: string[]) => {
    if (command === "/bin/ps") {
      assert.deepEqual(raw, ["-axo", "pid=,ppid=,pgid=,tpgid=,comm="]);
      psCalls++;
      return {
        code: 0,
        stderr: "",
        killed: false,
        stdout:
          "10 1 10 10 /usr/bin/login\n11 10 10 10 atuin\n" +
          (busy ? "12 11 12 20 /bin/zsh\n20 12 20 20 make\n" : "12 11 12 12 /bin/zsh\n"),
      };
    }
    assert.equal(command, "rex");
    assert.deepEqual(raw.slice(0, 3), ["--server", "unix:///test.sock", "--autostart=false"]);
    const args = raw.slice(3);
    let result: unknown;
    if (args[0] === "api" && args[2] === "server.status")
      result = { instance_id: instance, host_id: "local-host" };
    else if (args[0] === "session") {
      assert.deepEqual(args, ["session", "inspect", "session:test", "--json"]);
      result = {
        session_id: "session:test",
        windows: [
          {
            window_id: "window:test",
            layers: [
              {
                kind: "tiled",
                layer_id: "layer:tiled",
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
                  ...(pane && !floating
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
              ...(pane && floating
                ? [
                    {
                      kind: "floating",
                      layer_id: "layer:command",
                      state: minimized ? "minimized" : undefined,
                      blocks: [
                        {
                          block_id: pane.id,
                          label: pane.label,
                          host_id: host,
                          creator_name: "com.superlogical.terminal",
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
        ],
      };
    } else if (args.includes("session.new_layer")) {
      const data = JSON.parse(args.at(-1)!);
      assert.equal(data.window_id, "window:test");
      assert.equal(data.focus, false);
      assert.equal(data.layout.block.flavor, "com.superlogical.terminal.shell");
      assert.ok(data.layout.block.options.cwd);
      splits++;
      busy = false;
      floating = true;
      minimized = false;
      pane = { id: `block:command-${splits}`, label: data.layout.block.label };
      if (loseSplit) {
        loseSplit = false;
        return { code: 1, stdout: "", stderr: "connection lost", killed: false };
      }
      result = { block_ids: [pane.id], layer_id: "layer:command" };
    } else if (args.includes("session.float_block")) {
      assert.equal(JSON.parse(args.at(-1)!).block_id, pane!.id);
      assert.equal(floating, false);
      floating = true;
      result = { layer_id: "layer:command" };
    } else if (args.includes("session.set_layer_state")) {
      assert.deepEqual(JSON.parse(args.at(-1)!), { layer_id: "layer:command", state: "minimized" });
      if (loseMinimize) {
        loseMinimize = false;
        return { code: 1, stdout: "", stderr: "minimize failed", killed: false };
      }
      minimized = true;
      result = {};
    } else if (args.includes("block.close")) {
      assert.equal(JSON.parse(args.at(-1)!).block_id, pane!.id);
      assert.equal(busy, false);
      pane = undefined;
      closes++;
      result = {};
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
        result = proxy
          ? {
              child: { pid: 10, name: "login" },
              foreground: { pid: 10, name: "login" },
              last_exit: null,
            }
          : {
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
    enableProxy: () => {
      proxy = true;
    },
    remoteHost: () => {
      host = "remote-host";
    },
    get psCalls() {
      return psCalls;
    },
    get minimized() {
      return minimized;
    },
    get closes() {
      return closes;
    },
    restoreLayer: () => {
      minimized = false;
    },
    makeTiled: () => {
      floating = false;
      minimized = false;
    },
    loseMinimize: () => {
      loseMinimize = true;
    },
    idleWithoutCompletion: () => {
      busy = false;
    },
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
    registerMessageRenderer() {},
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
    shutdown: (reason = "quit") => handlers.get("session_shutdown")({ reason }),
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

test("an unresolved Rex pane creation refuses to create a duplicate", async () =>
  fixture(async (remote, directory) => {
    remote.loseSplit();
    await assert.rejects(load(remote, directory).start(), /connection lost/);
    remote.removePane();
    await assert.rejects(load(remote, directory).start(), /pane creation response is unresolved/);
    assert.equal(remote.splits, 1);
    assert.equal(remote.submissions, 0);
  }));

test("Rex minimizes new panes, migrates tiled panes, and respects a user-restored layer", async () =>
  fixture(async (remote, directory) => {
    const runner = load(remote, directory);
    const first = await runner.start();
    assert.equal(remote.minimized, true);
    remote.restoreLayer();
    const replacement = load(remote, directory);
    await replacement.restore();
    await replacement.status();
    assert.equal(remote.minimized, false);
    remote.makeTiled();
    const migrated = load(remote, directory);
    await migrated.restore();
    const recovered = await migrated.status();
    assert.equal(recovered.details.paneId, first.details.paneId);
    assert.equal(remote.minimized, true);
    assert.equal(remote.splits, 1);
    assert.equal(remote.submissions, 1);
  }));

test("Rex retries failed minimization without duplicating the pane or submitting work", async () =>
  fixture(async (remote, directory) => {
    remote.loseMinimize();
    await assert.rejects(load(remote, directory).start(), /minimize failed/);
    assert.equal(remote.submissions, 0);
    await load(remote, directory).start();
    assert.equal(remote.minimized, true);
    assert.equal(remote.splits, 1);
    assert.equal(remote.submissions, 1);
  }));

test("Rex shutdown preserves running and uncertain work and closes only completed idle panes", async () =>
  fixture(async (remote, directory) => {
    const runner = load(remote, directory);
    await runner.start();
    await runner.shutdown();
    assert.equal(remote.closes, 0);
    remote.idleWithoutCompletion();
    await runner.shutdown();
    assert.equal(remote.closes, 0);
    remote.finishOnRead();
    await runner.status();
    for (const reason of ["reload", "new", "resume", "fork"]) await runner.shutdown(reason);
    assert.equal(remote.closes, 0);
    await runner.shutdown();
    await runner.shutdown();
    assert.equal(remote.closes, 1);
    await load(remote, directory).start();
    assert.equal(remote.splits, 2);
  }));

test("Rex shutdown in a different Pi terminal cannot close another terminal's pane", async () =>
  fixture(async (remote, directory) => {
    const runner = load(remote, directory);
    await runner.start();
    remote.finishOnRead();
    await runner.status();
    await load(remote, directory, "block:other").shutdown();
    assert.equal(remote.closes, 0);
  }));

test(
  "Rex submits through a local Atuin proxy but refuses busy and remote proxy terminals",
  { skip: process.platform !== "darwin" },
  async () =>
    fixture(async (remote, directory) => {
      remote.enableProxy();
      const runner = load(remote, directory);
      await runner.start();
      assert.equal(remote.submissions, 1);
      assert.equal((await runner.start()).details.state, "busy");
      assert.equal(remote.submissions, 1);
      assert.ok(remote.psCalls > 0);
      remote.finishOnRead();
      await runner.status();
      const calls = remote.psCalls;
      remote.remoteHost();
      assert.equal((await runner.start()).details.state, "busy");
      assert.equal(remote.psCalls, calls);
      assert.equal(remote.submissions, 1);
    }),
);

test("Atuin PTY inspection distinguishes the inner prompt from running and nested programs", () => {
  const outer = "100 1 100 100 /usr/bin/login\n101 100 100 100 atuin\n";
  const idle = outer + "110 101 110 110 /bin/zsh\n";
  assert.deepEqual(parseAtuinProxyProcess(100, idle), {
    shellPid: 110,
    foregroundProcesses: [{ pid: 110, name: "zsh" }],
    idle: true,
  });
  const running = outer + "110 101 110 120 /bin/zsh\n120 110 120 120 make\n121 120 120 120 go\n";
  const info = parseAtuinProxyProcess(100, running)!;
  assert.equal(info.idle, false);
  assert.deepEqual(
    info.foregroundProcesses.map((p) => p.name),
    ["make", "go"],
  );
  for (const snapshot of [
    outer + "110 101 110 120 /bin/zsh\n120 110 120 120 /bin/zsh\n",
    idle + "120 110 110 110 python\n",
    idle + "120 1 110 110 python\n",
    outer + "110 101 110 120 /bin/zsh\n",
  ])
    assert.equal(parseAtuinProxyProcess(100, snapshot)?.idle, false);
  for (const snapshot of [
    idle.replace("atuin", "unknown"),
    idle.replace("/bin/zsh", "fish"),
    idle.replace("110 110 /bin/zsh", "110 -1 /bin/zsh"),
    idle + "111 101 111 111 /bin/bash\n",
    "100 1 100 100 /usr/bin/login\n",
    "invalid output",
  ])
    assert.equal(parseAtuinProxyProcess(100, snapshot), undefined);
});

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

test("a lost Rex pane creation response is adopted through its unique label", async () =>
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
