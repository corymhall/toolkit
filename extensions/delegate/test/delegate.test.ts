import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import delegateExtension from "../index.ts";
import {
  buildDelegatePrompt,
  buildHerdrWorktreeOpenArgs,
  buildPiLaunchCommand,
  buildWorktrunkArgs,
  DELEGATE_TOOL_NAME,
  detectPiCommand,
  normalizeSessionName,
  paneStillBelongsToWorkspace,
  parseOpenedWorktree,
  parseWorktreeResult,
  shellQuote,
  validateProposal,
} from "../delegate.ts";

test("builds argument-safe Worktrunk and Pi launches", () => {
  assert.equal(shellQuote("branch with ' quote"), `'branch with '"'"' quote'`);
  assert.deepEqual(
    buildWorktrunkArgs("/tmp/repo with spaces", "fix/auth", "release"),
    ["-C", "/tmp/repo with spaces", "switch", "--create", "fix/auth", "--base", "release", "--no-cd", "--format", "json"],
  );
  assert.deepEqual(
    buildHerdrWorktreeOpenArgs("/tmp/repo", "/tmp/worktrees/fix-auth", "fix/auth"),
    [
      "worktree", "open",
      "--cwd", "/tmp/repo",
      "--path", "/tmp/worktrees/fix-auth",
      "--label", "fix/auth",
      "--no-focus",
      "--json",
    ],
  );
  assert.equal(
    buildPiLaunchCommand("/tmp/handoff's.md", "fix auth", ["/opt/pi bin/pi"]),
    `'/opt/pi bin/pi' --name 'fix auth' '@/tmp/handoff'"'"'s.md'`,
  );
  assert.deepEqual(detectPiCommand("/usr/bin/node", "/opt/pi/dist/cli.js"), ["/usr/bin/node", "/opt/pi/dist/cli.js"]);
  assert.deepEqual(detectPiCommand("/opt/mise/pi", undefined), ["/opt/mise/pi"]);
});

test("builds a narrow delegation prompt and defaults to a new worktree", () => {
  const prompt = buildDelegatePrompt("Implement the bridge fix", "/tmp/source");
  assert.match(prompt, /Do not implement the delegated task/);
  assert.match(prompt, /new Worktrunk worktree is the default/);
  assert.match(prompt, new RegExp(DELEGATE_TOOL_NAME));
  assert.match(prompt, /Implement the bridge fix/);
  assert.match(prompt, /\/tmp\/source/);
});

test("normalizes Pi session names", () => {
  assert.equal(normalizeSessionName("  fix\n signer   refresh ", "ignored", "/tmp/repo"), "fix signer refresh");
  assert.equal(normalizeSessionName(undefined, "fix/auth", "/tmp/repo"), "fix/auth");
  assert.equal(normalizeSessionName(undefined, undefined, "/tmp/widgets"), "widgets");
});

test("validates delegation proposals", () => {
  assert.throws(() => validateProposal({ repository: "relative", handoff: "task", branch: "fix" }), /absolute/);
  assert.throws(() => validateProposal({ repository: "/tmp/repo", handoff: "", branch: "fix" }), /handoff/);
  assert.throws(() => validateProposal({ repository: "/tmp/repo", handoff: "task" }), /branch/);
  assert.doesNotThrow(() => validateProposal({ repository: "/tmp/repo", handoff: "task", useExistingCheckout: true }));
});

test("parses Worktrunk output", () => {
  assert.deepEqual(parseWorktreeResult(JSON.stringify({
    action: "created",
    branch: "fix/auth",
    path: "/tmp/repo/.worktrees/fix-auth",
  })), { path: "/tmp/repo/.worktrees/fix-auth", branch: "fix/auth" });
  assert.throws(() => parseWorktreeResult("not json"), /invalid JSON/);
  assert.throws(() => parseWorktreeResult(JSON.stringify({ path: "relative" })), /absolute/);
});

test("parses and revalidates Herdr worktree workspace identifiers", () => {
  const opened = parseOpenedWorktree(JSON.stringify({
    result: {
      workspace: { workspace_id: "w2" },
      root_pane: { pane_id: "w2:p1" },
    },
  }));
  assert.deepEqual(opened, { workspaceId: "w2", paneId: "w2:p1" });
  assert.equal(paneStillBelongsToWorkspace(JSON.stringify({
    result: { panes: [{ pane_id: "w2:p1", workspace_id: "w2" }] },
  }), opened), true);
  assert.equal(paneStillBelongsToWorkspace(JSON.stringify({
    result: { panes: [{ pane_id: "w2:p1", workspace_id: "w3" }] },
  }), opened), false);
});

test("does not register an agent tool until /delegate is invoked", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const tools: Array<{ name: string }> = [];
  const activeTools: string[][] = [];
  const sentMessages: string[] = [];
  const pi = {
    registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, command);
    },
    registerTool(tool: { name: string }) { tools.push(tool); },
    on() {},
    getActiveTools: () => ["read", "bash"],
    setActiveTools: (names: string[]) => activeTools.push(names),
    sendUserMessage: (message: string) => sentMessages.push(message),
    exec: async () => ({ code: 0, stdout: "v1", stderr: "", killed: false }),
  } as unknown as ExtensionAPI;

  delegateExtension(pi);
  assert.deepEqual(tools, []);

  const previousHerdrEnv = process.env.HERDR_ENV;
  process.env.HERDR_ENV = "1";
  try {
    await commands.get("delegate")!.handler("continue in the provider repo", {
      mode: "tui",
      cwd: "/tmp/source",
      waitForIdle: async () => {},
      ui: { notify() {}, setStatus() {} },
    });
  } finally {
    if (previousHerdrEnv === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = previousHerdrEnv;
  }

  assert.deepEqual(tools.map(tool => tool.name), [DELEGATE_TOOL_NAME]);
  assert.deepEqual(activeTools.at(-1), ["read", "bash", DELEGATE_TOOL_NAME]);
  assert.match(sentMessages[0], /continue in the provider repo/);
});

test("opens new and existing checkouts as non-focused Herdr worktrees", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pi-delegate-test-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const previousHerdrEnv = process.env.HERDR_ENV;
  process.env.PI_CODING_AGENT_DIR = temp;
  process.env.HERDR_ENV = "1";

  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const activeTools: string[][] = [];
  const paneRuns: string[] = [];
  const worktrunkCalls: string[][] = [];
  const herdrWorktreeCalls: string[][] = [];
  const pi = {
    registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, command);
    },
    registerTool(tool: { name: string; execute: (...args: any[]) => Promise<any> }) { tools.push(tool); },
    on() {},
    getActiveTools: () => ["read", "bash"],
    setActiveTools: (names: string[]) => activeTools.push(names),
    sendUserMessage() {},
    exec: async (command: string, args: string[]) => {
      if (args[0] === "--version") return { code: 0, stdout: "v1", stderr: "", killed: false };
      if (command === "git" && args.includes("rev-parse")) {
        return { code: 0, stdout: "/tmp/target\n", stderr: "", killed: false };
      }
      if (command === "git" && args.includes("check-ref-format")) {
        return { code: 0, stdout: "", stderr: "", killed: false };
      }
      if (command === "git" && args.includes("branch") && args.includes("--show-current")) {
        return { code: 0, stdout: "main\n", stderr: "", killed: false };
      }
      if (command === "wt") {
        worktrunkCalls.push(args);
        return {
          code: 0,
          stdout: JSON.stringify({
            action: "created",
            branch: "fix/delegation",
            path: "/tmp/target/.worktrees/fix-delegation",
          }),
          stderr: "",
          killed: false,
        };
      }
      if (command === "herdr" && args[0] === "worktree" && args[1] === "open") {
        herdrWorktreeCalls.push(args);
        return {
          code: 0,
          stdout: JSON.stringify({ result: {
            workspace: { workspace_id: "w2" },
            root_pane: { pane_id: "w2:p1" },
          } }),
          stderr: "",
          killed: false,
        };
      }
      if (command === "herdr" && args[0] === "pane" && args[1] === "list") {
        return {
          code: 0,
          stdout: JSON.stringify({ result: { panes: [{ pane_id: "w2:p1", workspace_id: "w2" }] } }),
          stderr: "",
          killed: false,
        };
      }
      if (command === "herdr" && args[0] === "pane" && args[1] === "run") {
        paneRuns.push(args[3]);
        return { code: 0, stdout: "", stderr: "", killed: false };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  } as unknown as ExtensionAPI;

  try {
    delegateExtension(pi, { piCommand: ["pi"] });
    const ui = {
      notify() {},
      setStatus() {},
      editor: async () => "Self-contained handoff",
      confirm: async () => true,
    };
    await commands.get("delegate")!.handler("implement in target", {
      mode: "tui",
      cwd: "/tmp/source",
      waitForIdle: async () => {},
      ui,
    });
    const tool = tools.find(candidate => candidate.name === DELEGATE_TOOL_NAME);
    assert.ok(tool);
    const result = await tool.execute("call", {
      repository: "/tmp/target",
      branch: "fix/delegation",
      sessionName: "delegated fix",
      handoff: "Draft handoff",
    }, undefined, undefined, { ui });

    assert.equal(result.terminate, true);
    assert.deepEqual(worktrunkCalls, [[
      "-C", "/tmp/target", "switch", "--create", "fix/delegation", "--no-cd", "--format", "json",
    ]]);
    assert.deepEqual(herdrWorktreeCalls, [[
      "worktree", "open",
      "--cwd", "/tmp/target",
      "--path", "/tmp/target/.worktrees/fix-delegation",
      "--label", "fix/delegation",
      "--no-focus",
      "--json",
    ]]);
    assert.equal(paneRuns.length, 1);
    assert.match(paneRuns[0], /^'pi' --name 'delegated fix' '@.*delegations.*\.md'$/);
    assert.deepEqual(activeTools.at(-1), ["read", "bash"]);
    assert.equal(await readFile(result.details.handoffFile, "utf8"), "Self-contained handoff\n");

    await commands.get("delegate")!.handler("continue in existing checkout", {
      mode: "tui",
      cwd: "/tmp/source",
      waitForIdle: async () => {},
      ui,
    });
    const existingResult = await tool.execute("call-existing", {
      repository: "/tmp/target",
      sessionName: "existing checkout task",
      handoff: "Draft existing handoff",
      useExistingCheckout: true,
    }, undefined, undefined, { ui });

    assert.equal(existingResult.terminate, true);
    assert.equal(existingResult.details.branch, "main");
    assert.equal(worktrunkCalls.length, 1);
    assert.deepEqual(herdrWorktreeCalls[1], [
      "worktree", "open",
      "--cwd", "/tmp/target",
      "--path", "/tmp/target",
      "--label", "main",
      "--no-focus",
      "--json",
    ]);
    assert.match(paneRuns[1], /^'pi' --name 'existing checkout task' '@.*delegations.*\.md'$/);
    assert.equal(await readFile(existingResult.details.handoffFile, "utf8"), "Self-contained handoff\n");
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    if (previousHerdrEnv === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = previousHerdrEnv;
    await rm(temp, { recursive: true, force: true });
  }
});
