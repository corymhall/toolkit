import { createServer, type Server } from "node:net";
import { chmod } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { installQuietChildStatus } from "./quiet-status.ts";
import { identity, rexClient, type RexCall } from "./rex.ts";
import {
  CHILD_ENV,
  boundedText,
  key,
  optionalJSON,
  parseConfig,
  privateDirectory,
  readJSON,
  record,
  saveJSON,
  validateText,
  type Assignment,
  type ChildConfig,
  type ChildStatus,
  type Report,
} from "./storage.ts";

/** A private receiver for one managed child, not another generic Pi message bus. */
export function installChild(
  pi: ExtensionAPI,
  file: string,
  options: { call?: RexCall; env?: NodeJS.ProcessEnv } = {},
) {
  const env = { ...(options.env || process.env) };
  if (!isAbsolute(file)) throw new Error("Subagent configuration path must be absolute");
  installQuietChildStatus(pi);
  const folder = dirname(file);
  let config: ChildConfig;
  let ctx: ExtensionContext;
  let server: Server | undefined;
  let active: Assignment | undefined;
  let uncertain = false;
  let started = false;
  let blocked = false;
  let stopped = true;
  let last: AssistantMessage | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const resultFile = (task: string) => join(folder, "results", `${key(task)}.json`);
  const pendingFile = join(folder, "assignment.json");
  const status = (): ChildStatus => ({
    child: config.id,
    session: ctx.sessionManager.getSessionId(),
    pid: process.pid,
    block: env.REX_BLOCK || "",
    file: ctx.sessionManager.getSessionFile(),
    state:
      ctx.sessionManager.getSessionId() !== config.session
        ? "session-changed"
        : uncertain
          ? "uncertain"
          : blocked
            ? "blocked"
            : active || !ctx.isIdle()
              ? "working"
              : "idle",
    task: active?.id,
  });
  const publish = () => saveJSON(join(folder, "live.json"), status());

  const handle = async (input: unknown) => {
    if (!record(input) || stopped || input.child !== config.id)
      throw new Error("Child identity changed");
    if (input.op === "status") return status();
    if (input.session !== config.session || ctx.sessionManager.getSessionId() !== config.session) {
      throw new Error("Child conversation changed. Inspect it before sending work.");
    }
    if (input.op === "cancel") {
      if (uncertain)
        throw new Error("Previous assignment is uncertain. Inspect the terminal before recovery.");
      if (!active) throw new Error("No parent-assigned work is active");
      ctx.abort();
      return { requested: true, task: active.id };
    }
    if (
      input.op !== "send" ||
      typeof input.id !== "string" ||
      !input.id ||
      input.id.length > 256 ||
      !record(input.task) ||
      typeof input.task.id !== "string" ||
      !input.task.id ||
      input.task.id.length > 256 ||
      typeof input.task.text !== "string" ||
      !["followUp", "steer"].includes(String(input.delivery))
    ) {
      throw new Error("Invalid child request");
    }
    const task: Assignment = { id: input.task.id, text: input.task.text };
    validateText(task.text);
    const receiptFile = join(folder, "receipts", `${key(input.id)}.json`);
    const fingerprint = key(JSON.stringify([task, input.delivery]));
    const existing = await optionalJSON(receiptFile);
    if (existing !== undefined) {
      if (
        !record(existing) ||
        existing.fingerprint !== fingerprint ||
        existing.session !== config.session
      ) {
        throw new Error("Request ID was reused with different input");
      }
      if (existing.state !== "accepted")
        throw new Error("Prior submission is uncertain. Inspect before retrying.");
      return { accepted: true, task: existing.task, duplicate: true };
    }
    if (uncertain || blocked)
      throw new Error("Child needs inspection or human input before delivery");
    if (input.delivery === "steer") {
      if (!active) throw new Error("Only a parent-assigned active task can be steered");
    } else if (active || !ctx.isIdle()) {
      throw new Error("Child is busy. Inspect it or steer its active assignment.");
    }
    await saveJSON(receiptFile, {
      session: config.session,
      fingerprint,
      task: active?.id || task.id,
      state: "submitting",
    });
    // Persist ownership before Pi accepts input. A restart cannot silently reuse
    // an incomplete assignment, and an uncertain submission is never resubmitted.
    if (!active) {
      active = task;
      started = false;
      await saveJSON(pendingFile, task);
    }
    const assigned = active.id;
    try {
      if (stopped || ctx.sessionManager.getSessionId() !== config.session)
        throw new Error("Child session ended during submission");
      pi.sendUserMessage(task.text, {
        deliverAs: input.delivery as "steer" | "followUp",
        expandPromptTemplates: false,
      });
      await saveJSON(receiptFile, {
        session: config.session,
        fingerprint,
        task: assigned,
        state: "accepted",
      });
      return { accepted: true, task: assigned };
    } catch (error) {
      uncertain = true;
      await publish();
      throw error;
    }
  };

  pi.on("session_start", async (_event, context) => {
    ctx = context;
    stopped = true;
    blocked = false;
    started = false;
    active = undefined;
    uncertain = false;
    if (ctx.mode !== "tui") throw new Error("Managed subagents require interactive Pi terminals");
    await privateDirectory(folder);
    config = parseConfig(await readJSON(file));
    if (
      env.REX_SERVER !== config.server ||
      env.REX_SESSION !== config.rexSession ||
      !env.REX_BLOCK
    ) {
      throw new Error("Child is not running in its assigned Rex session");
    }
    const host = await identity(options.call || rexClient(pi, config.server));
    if (host.instance !== config.serverInstance)
      throw new Error("Rex server restarted. Inspect this child before recovery.");
    await privateDirectory(join(folder, "results"));
    await privateDirectory(join(folder, "receipts"));
    await privateDirectory(config.socketDirectory);
    if (ctx.sessionManager.getSessionId() === config.session) {
      const pending = await optionalJSON(pendingFile);
      if (record(pending) && typeof pending.id === "string") {
        // A saved result settles ownership. Otherwise stop rather than guessing
        // whether an interrupted process actually executed the assignment.
        uncertain = (await optionalJSON(resultFile(pending.id))) === undefined;
      } else if ((await optionalJSON(resultFile(config.initial.id))) === undefined) {
        active = config.initial;
        await saveJSON(pendingFile, active);
      }
    }
    const socket = join(config.socketDirectory, "input.sock");
    if (Buffer.byteLength(socket) >= 104)
      throw new Error("Subagent socket path is too long; use a shorter temporary directory");
    server = createServer((client) => {
      let buffer = "";
      let used = false;
      client.setEncoding("utf8");
      client.setTimeout(5000, () => client.destroy());
      client.on("error", () => {});
      client.on("data", (data: string) => {
        if (used) return;
        buffer += data;
        if (Buffer.byteLength(buffer) > 96_000) {
          client.destroy();
          return;
        }
        if (!buffer.includes("\n")) return;
        used = true;
        const request = buffer.split("\n")[0]!;
        const pending = queue.then(() => handle(JSON.parse(request) as unknown));
        queue = pending.catch(() => undefined);
        void pending.then(
          (value) => client.end(JSON.stringify({ ok: true, value }) + "\n"),
          (error: unknown) =>
            client.end(JSON.stringify({ ok: false, error: String(error) }) + "\n"),
        );
      });
    });
    const receiver = server;
    try {
      // EADDRINUSE is a safe stop. Never unlink a live or unverified stale receiver.
      await new Promise<void>((resolve, reject) => {
        receiver.once("error", reject);
        receiver.listen(socket, resolve);
      });
      await chmod(socket, 0o600);
      stopped = false;
      await publish();
    } catch (error) {
      if (receiver.listening) await new Promise<void>((resolve) => receiver.close(() => resolve()));
      throw error;
    }
  });
  pi.on("agent_start", async () => {
    if (stopped) return;
    started = Boolean(active);
    last = undefined;
    await publish();
  });
  pi.on("message_end", (event) => {
    if (event.message.role === "assistant") last = event.message;
  });
  pi.on("ui_prompt_start", () => {
    blocked = true;
  });
  pi.on("ui_prompt_end", () => {
    blocked = false;
  });
  pi.on("agent_settled", async (event) => {
    if (!active || !started || stopped || ctx.sessionManager.getSessionId() !== config.session)
      return;
    const answer = boundedText(
      last?.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n") || "",
    );
    const report: Report = {
      child: config.id,
      name: config.name,
      parent: config.parent,
      session: config.session,
      task: active.id,
      outcome: event.aborted ? "aborted" : last?.stopReason === "error" ? "error" : "answer",
      answer: answer.text,
      truncated: answer.truncated,
      finishedAt: Date.now(),
      file: ctx.sessionManager.getSessionFile(),
      error: last?.errorMessage?.slice(0, 2000),
    };
    try {
      await saveJSON(resultFile(active.id), report);
      active = undefined;
      started = false;
    } catch (error) {
      uncertain = true;
      throw error;
    } finally {
      await publish();
    }
  });
  pi.on("session_shutdown", async () => {
    stopped = true;
    const receiver = server;
    server = undefined;
    if (receiver?.listening) await new Promise<void>((resolve) => receiver.close(() => resolve()));
  });
}

export default function childExtension(pi: ExtensionAPI) {
  const file = process.env[CHILD_ENV];
  if (file) installChild(pi, file);
}
