import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { SubagentManager } from "./manager.ts";
import { rexClient, type RexCall } from "./rex.ts";
import { deliverReports } from "./delivery.ts";
import { CHILD_ENV, NAME, configurations, reports } from "./storage.ts";

interface Dependencies {
  env?: NodeJS.ProcessEnv;
  call?: RexCall;
  stateDirectory?: string;
  schedule?: (tick: () => Promise<void>) => () => void;
}
interface Runtime {
  ctx: ExtensionContext;
  manager: SubagentManager;
  active: boolean;
  queued: Set<string>;
  cancelTick?: () => void;
  monitoring: boolean;
  warning?: string;
  lastIdleCheck: number;
  reminded: Map<string, number>;
}
const result = (value: unknown): AgentToolResult<unknown> => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  details: value,
});
const name = Type.String({ pattern: NAME.source });
const task = Type.String({ minLength: 1, maxLength: 32_768 });
const parameters = Type.Union([
  Type.Object({
    action: Type.Literal("spawn"),
    name,
    task,
    cwd: Type.Optional(Type.String()),
    model: Type.Optional(
      Type.String({ description: "Exact provider/model-id. Defaults to the parent model." }),
    ),
    effort: Type.Optional(
      Type.Union(
        [
          Type.Literal("off"),
          Type.Literal("minimal"),
          Type.Literal("low"),
          Type.Literal("medium"),
          Type.Literal("high"),
          Type.Literal("xhigh"),
          Type.Literal("max"),
        ],
        {
          description:
            "Thinking effort. Defaults to the parent's level, clamped to the selected model.",
        },
      ),
    ),
  }),
  Type.Object({ action: Type.Literal("list") }),
  Type.Object({
    action: Type.Literal("send"),
    name,
    task,
    delivery: Type.Optional(Type.Union([Type.Literal("followUp"), Type.Literal("steer")])),
  }),
  Type.Object({ action: Type.Literal("cancel"), name }),
  Type.Object({ action: Type.Literal("close"), name }),
]);

/** Rex owns terminal layout. This extension only owns explicit delegated assignments. */
export default function rexSubagents(pi: ExtensionAPI, dependencies: Dependencies = {}) {
  const env = { ...(dependencies.env || process.env) };
  // Children load their task receiver explicitly. No nested delegation tool is registered.
  if (
    env[CHILD_ENV] ||
    !env.REX_SESSION ||
    !env.REX_BLOCK ||
    !env.REX_SERVER?.startsWith("unix://")
  )
    return;
  const origin = { server: env.REX_SERVER, session: env.REX_SESSION, block: env.REX_BLOCK };
  const call = dependencies.call || rexClient(pi, origin.server);
  const schedule =
    dependencies.schedule ??
    ((tick: () => Promise<void>) => {
      const timer = setTimeout(() => void tick(), 2500);
      timer.unref();
      return () => clearTimeout(timer);
    });
  let runtime: Runtime | undefined;
  let serial = Promise.resolve();
  const exclusive = <T>(action: () => Promise<T>): Promise<T> => {
    const pending = serial.then(action);
    serial = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };
  const current = (ctx: ExtensionContext) => {
    if (
      !runtime?.active ||
      runtime.ctx.sessionManager.getSessionId() !== ctx.sessionManager.getSessionId()
    ) {
      throw new Error("Rex subagents require the current saved interactive Pi session");
    }
    return runtime;
  };
  const monitor = (state: Runtime) => {
    if (state.monitoring || !state.active) return;
    state.monitoring = true;
    const tick = async () => {
      try {
        const completed = await state.manager.completed();
        // A reload or conversation replacement can happen during filesystem I/O.
        if (!state.active || runtime !== state) return;
        deliverReports(pi, state.ctx, completed, state.queued);
        if (Date.now() - state.lastIdleCheck >= 30_000) {
          state.lastIdleCheck = Date.now();
          const children = await state.manager.list();
          if (!state.active || runtime !== state) return;
          const idle = children.filter((child) => {
            const since = child.status?.idleSince;
            if (child.status?.state !== "idle" || since === undefined) {
              state.reminded.delete(child.name);
              return false;
            }
            return (
              child.placement === "floating" &&
              Number.isFinite(since) &&
              Date.now() - since >= 15 * 60_000 &&
              state.reminded.get(child.name) !== since
            );
          });
          if (idle.length) {
            pi.sendMessage(
              {
                customType: "subagent-cleanup-reminder",
                details: {
                  idle: idle.map((child) => ({
                    name: child.name,
                    since: child.status!.idleSince!,
                  })),
                },
                display: true,
                content: `Subagents idle for at least 15 minutes: ${idle.map((child) => child.name).join(", ")}. Close finished children with rex_subagent action close, or keep them for further work.`,
              },
              { deliverAs: "followUp", triggerTurn: true },
            );
            for (const child of idle) state.reminded.set(child.name, child.status!.idleSince!);
          }
        }
      } catch (error) {
        if (state.active && state.warning !== String(error)) {
          state.warning = String(error);
          state.ctx.ui.notify(`Subagents: ${String(error)}`, "warning");
        }
      } finally {
        if (state.active) {
          state.cancelTick = schedule(tick);
        }
      }
    };
    void tick();
  };

  pi.registerTool({
    name: "rex_subagent",
    label: "Rex Subagent",
    description:
      "Delegate bounded tasks to named interactive Pi children in minimized floating Rex panes. Actions spawn, list, send, cancel and close. Spawn does not require confirmation. Optional model and effort override the parent defaults. Results arrive as follow-ups. Send a new assignment only to an idle child; steer changes its active task. Cancel aborts work without closing the terminal. Close removes only a confirmed idle child in an exclusive floating pane.",
    promptSnippet: "Launch and control named, inspectable Pi subagents in Rex",
    promptGuidelines: [
      "Use rex_subagent only when delegation is authorized by the user or applicable instructions.",
      "After rex_subagent spawn or send, continue independent work or end the turn. Results arrive automatically; do not poll or sleep waiting for them.",
      "If rex_subagent reports an uncertain launch or delivery, use list and inspect the existing child. Never retry it under a different name.",
      "Subagents have full built-in tools and share the working tree. Assign clear, non-overlapping file ownership. Review-only assignments are instructions, not a sandbox.",
    ],
    executionMode: "sequential",
    parameters,
    async execute(toolCallId, params, signal, _update, ctx) {
      return exclusive(async () => {
        const state = current(ctx);
        if (params.action === "spawn") {
          const child = await state.manager.spawn(
            toolCallId,
            params.name,
            params.task,
            params.cwd || ctx.cwd,
            ctx,
            { model: params.model, effort: params.effort, defaultEffort: pi.getThinkingLevel() },
            signal,
          );
          monitor(state);
          return result({
            name: child.name,
            state: child.launch.state,
            block: child.launch.block,
            model: child.config.model,
            effort: child.config.effort,
            note: "Child startup may still require attention. Results arrive automatically.",
          });
        }
        if (params.action === "list") {
          const children = await state.manager.list();
          if (children.length) monitor(state);
          return result(
            await Promise.all(
              children.map(async (child) => ({
                name: child.name,
                placement: child.placement,
                block: child.launch.block,
                state: child.status?.state || child.placement,
                warning: child.warning,
                model: child.config.model,
                effort: child.config.effort,
                createdAt: child.config.createdAt,
                idleSince: child.status?.idleSince,
                latest: (await reports(child.file, child.config)).sort(
                  (a, b) => b.finishedAt - a.finishedAt,
                )[0],
              })),
            ),
          );
        }
        if (params.action === "send") {
          const accepted = await state.manager.send(
            toolCallId,
            params.name,
            params.task,
            params.delivery || "followUp",
          );
          monitor(state);
          return result(accepted);
        }
        if (params.action === "close") {
          await state.manager.close(params.name);
          return result({ name: params.name, closed: true });
        }
        return result(await state.manager.cancel(params.name));
      });
    },
  });

  pi.registerCommand("subagents", {
    description: "List owned Rex subagents, open <name>, or cleanup idle floating children",
    async handler(args, ctx) {
      try {
        const state = current(ctx);
        const words = args.trim().split(/\s+/);
        if (words[0] === "open" && words[1] && words.length === 2) {
          await state.manager.open(words[1]);
          return;
        }
        if (args.trim() === "cleanup") {
          const retained = await exclusive(() => state.manager.cleanup());
          ctx.ui.notify(
            retained.length
              ? `Retained subagents:\n${retained.join("\n")}`
              : "Idle floating subagents cleaned up",
            "info",
          );
          return;
        }
        if (args.trim())
          throw new Error("Usage: /subagents, /subagents open <name>, or /subagents cleanup");
        const children = await state.manager.list();
        ctx.ui.notify(
          children
            .map(
              (child) =>
                `${child.name}: ${child.status?.state || child.placement}${child.warning ? " (inspect)" : ""}`,
            )
            .join("\n") || "No subagents belong to this conversation",
          "info",
        );
      } catch (error) {
        ctx.ui.notify(String(error), "error");
      }
    },
  });
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui" || !ctx.sessionManager.getSessionFile()) return;
    const state: Runtime = {
      ctx,
      manager: new SubagentManager(
        call,
        origin,
        ctx.sessionManager.getSessionId(),
        dependencies.stateDirectory,
      ),
      active: true,
      queued: new Set(),
      monitoring: false,
      lastIdleCheck: Date.now(),
      reminded: new Map(),
    };
    for (const entry of ctx.sessionManager.getEntries()) {
      if (
        entry.type !== "message" ||
        entry.message.role !== "custom" ||
        entry.message.customType !== "subagent-cleanup-reminder"
      )
        continue;
      const details = entry.message.details as
        | { idle?: Array<{ name: string; since: number }> }
        | undefined;
      for (const child of details?.idle ?? []) state.reminded.set(child.name, child.since);
    }
    runtime = state;
    try {
      await state.manager.initialize();
      if (state.active && (await configurations(state.manager.root)).length) monitor(state);
    } catch (error) {
      if (state.active) ctx.ui.notify(`Subagents: ${String(error)}`, "warning");
    }
  });
  pi.on("session_shutdown", async (event, ctx) => {
    const state = runtime;
    if (!state) return;
    state.active = false;
    state.cancelTick?.();
    runtime = undefined;
    if (event.reason !== "new") return;
    try {
      const retained = await exclusive(() => state.manager.cleanup());
      if (retained.length) ctx.ui.notify(`Retained subagents:\n${retained.join("\n")}`, "warning");
    } catch (error) {
      ctx.ui.notify(`Subagent cleanup failed: ${String(error)}`, "warning");
    }
  });
}
