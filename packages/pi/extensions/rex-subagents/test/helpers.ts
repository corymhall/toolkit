import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { privateDirectory, saveJSON, type ChildConfig } from "../storage.ts";

export function harness(session = "child-session") {
  const hooks = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => unknown>>();
  const users: string[] = [];
  const messages: unknown[] = [];
  const entries: unknown[] = [];
  let idle = true;
  let currentSession = session;
  let aborted = false;
  let rejectInput = false;
  const ctx = {
    mode: "tui",
    cwd: process.cwd(),
    thinkingLevel: "low",
    model: { provider: "openai", id: "test-model", reasoning: true },
    isIdle: () => idle,
    abort: () => {
      aborted = true;
    },
    sessionManager: {
      getSessionId: () => currentSession,
      getSessionFile: () => `/sessions/${currentSession}.jsonl`,
      getSessionName: () => "Reader",
      getEntries: () => entries,
    },
    ui: { notify() {}, confirm: async () => true },
  } as unknown as ExtensionContext;
  const pi = {
    on(name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) {
      const callbacks = hooks.get(name) || [];
      callbacks.push(handler);
      hooks.set(name, callbacks);
    },
    sendUserMessage(text: string) {
      if (rejectInput) throw new Error("input rejected");
      users.push(text);
    },
    sendMessage(message: unknown) {
      messages.push(message);
    },
  } as unknown as ExtensionAPI;
  return {
    pi,
    ctx,
    users,
    messages,
    entries,
    hooks,
    idle(value: boolean) {
      idle = value;
    },
    session(value: string) {
      currentSession = value;
    },
    rejectInput(value: boolean) {
      rejectInput = value;
    },
    aborted: () => aborted,
    async emit(name: string, event: unknown = {}) {
      for (const hook of hooks.get(name) || []) await hook(event, ctx);
    },
  };
}

export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pi-rs-"));
  const folder = join(root, "reader");
  const socketDirectory = join(root, "s");
  await privateDirectory(folder);
  await privateDirectory(socketDirectory);
  const config: ChildConfig = {
    version: 1,
    id: randomUUID(),
    name: "reader",
    parent: "parent-session",
    session: "child-session",
    server: "unix:///tmp/test-rex.sock",
    serverInstance: "test-instance",
    rexSession: "rex-session",
    socketDirectory,
    cwd: process.cwd(),
    initial: { id: "initial", text: "Read the implementation" },
    request: "request",
  };
  const file = join(folder, "config.json");
  await saveJSON(file, config);
  const env = {
    REX_SERVER: config.server,
    REX_SESSION: config.rexSession,
    REX_BLOCK: "child-block",
  };
  return {
    root,
    folder,
    file,
    config,
    env,
    clean: () => rm(root, { recursive: true, force: true }),
  };
}

export async function serverIdentity() {
  return { instance_id: "test-instance", host_id: "local-host" };
}

export function assistant(text: string, stopReason = "stop") {
  return { message: { role: "assistant", content: [{ type: "text", text }], stopReason } };
}
