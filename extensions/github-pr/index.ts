import { StringEnum } from "@earendil-works/pi-ai";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { createGitHubClient } from "./github.ts";
import { clean, label, parseTarget, restoreWatches } from "./model.ts";
import { Tracker } from "./tracker.ts";
import { restoreAutomatic } from "./auto-watch.ts";
import { widgetLines } from "./ui.ts";
import { CiTerminalStatus, type StatusTerminal } from "./terminal-status.ts";

const ENTRY = "toolkit-github-ci-watches";
const RESULT = Type.Object({ status: Type.String(), message: Type.String() });
const USAGE = "/pr [details | expand | hide | watch [URL] | unwatch [URL] | resume [URL]]";

export default function githubPrExtension(pi: ExtensionAPI) {
  let tracker: Tracker | undefined;
  let context: ExtensionContext | undefined;
  let expanded = false;
  let hidden = false;
  const redraw = new Set<() => void>();
  const terminalStatus = new CiTerminalStatus();

  function update(): void {
    terminalStatus.update(tracker?.entries.values() || []);
    for (const render of redraw) render();
  }
  function installWidget(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget("github-pr", (tui, theme) => {
      // Binding outlives widget visibility. Even a hidden widget must attach the
      // public terminal emitter after reload so CI attention keeps working.
      terminalStatus.attach(tui.terminal as unknown as StatusTerminal, {
        state: ctx.isIdle?.() === false ? "working" : "idle",
        app: "pi",
        message: pi.getSessionName?.(),
      });
      const render = () => tui.requestRender();
      redraw.add(render);
      return {
        render(width) {
          return tracker && !hidden
            ? widgetLines(
                [...tracker.entries.values()],
                tracker.current,
                expanded,
                width,
                theme,
                Date.now(),
                tracker.discoveryError,
                Math.max(3, Math.min(14, Math.floor(tui.terminal.rows / 3))),
              )
            : [];
        },
        invalidate() {},
        dispose() {
          redraw.delete(render);
        },
      };
    });
  }
  function stop(): void {
    tracker?.dispose();
    terminalStatus.detach();
    terminalStatus.update([]);
    terminalStatus.agentSettled();
    tracker = undefined;
    context?.ui.setWidget("github-pr", undefined);
    context = undefined;
    redraw.clear();
  }
  function start(ctx: ExtensionContext): void {
    stop();
    context = ctx;
    let saved: unknown;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === ENTRY) saved = entry.data;
    }
    const next = new Tracker(createGitHubClient(ctx.cwd), {
      changed: () => {
        if (tracker === next) update();
      },
      persist: (watches, automatic) => {
        if (tracker === next) pi.appendEntry(ENTRY, { version: 2, watches, automatic });
      },
      outcome: (watch, outcome) => {
        if (tracker !== next) return;
        pi.sendMessage(
          {
            customType: "github-ci-result",
            display: true,
            content: `GitHub CI ${outcome.kind}: ${label(watch.target)}\nWatched commit: ${watch.head}\n${watch.target.url}\n${clean(outcome.summary)}${outcome.diagnostics ? `\n\n${clean(outcome.diagnostics)}` : ""}\n\n${watch.automatic ? "Automatic watching remains enabled for the current branch." : "The watch has ended."} No GitHub mutations were performed.`,
            details: { target: watch.target, head: watch.head, outcome },
          },
          { deliverAs: "followUp", triggerTurn: true },
        );
      },
    });
    tracker = next;
    next.restore(restoreWatches(saved), restoreAutomatic(saved));
    if (ctx.isIdle?.() === false) terminalStatus.agentStarted(pi.getSessionName?.());
    terminalStatus.update(next.entries.values());
    installWidget(ctx);
    // Print/JSON runs have no recipient after returning. RPC explicitly owns its lifetime.
    if (ctx.mode === "tui" || ctx.mode === "rpc") next.start();
  }

  pi.registerMessageRenderer(
    "github-ci-result",
    (message, _options, theme) =>
      new Text(
        theme.fg("accent", "GitHub CI result") + "\n" + clean(String(message.content)),
        0,
        0,
      ),
  );
  pi.registerCommand("pr", {
    description: "Show PR status and control background CI watches",
    getArgumentCompletions: (prefix) =>
      ["details", "expand", "hide", "watch", "unwatch", "resume"]
        .filter((v) => v.startsWith(prefix))
        .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      const active = tracker;
      if (!active) {
        ctx.ui.notify("PR tracker is not active", "warning");
        return;
      }
      const [command = "details", targetText, ...extra] = args.trim().split(/\s+/).filter(Boolean);
      try {
        if (extra.length) throw new Error(USAGE);
        if (["details", "expand", "hide"].includes(command) && targetText) throw new Error(USAGE);
        if (command === "details" || command === "expand") {
          if (ctx.mode !== "tui") {
            ctx.ui.notify(active.status(), "info");
            return;
          }
          expanded = hidden || !expanded;
          hidden = false;
          installWidget(ctx);
          update();
        } else if (command === "hide") {
          hidden = !hidden;
          installWidget(ctx);
        } else if (command === "watch" || command === "resume") {
          if (command === "watch" && !targetText) {
            active.setAutoWatch(true);
            ctx.ui.notify(
              "Automatic current-PR watching enabled. New commits and CI reruns are followed automatically.",
              "info",
            );
            return;
          }
          const watch = await active.startWatch(
            targetText ? parseTarget(targetText) : undefined,
            60,
            command === "resume",
          );
          ctx.ui.notify(
            `Watching ${label(watch.target)} at ${watch.head.slice(0, 7)}. Results arrive automatically.`,
            "info",
          );
        } else if (command === "unwatch") {
          if (!targetText) {
            active.setAutoWatch(false);
            if (active.current) active.cancel(active.current);
            ctx.ui.notify(
              "Automatic current-PR watching disabled. It stays off until /pr watch.",
              "info",
            );
          } else
            ctx.ui.notify(`Stopped ${active.cancel(parseTarget(targetText).url)} watch`, "info");
        } else throw new Error(USAGE);
      } catch (error) {
        if (tracker === active)
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerTool({
    name: "github_ci_watch",
    label: "GitHub CI watch",
    exposure: "codemode",
    description:
      "Inspect or control background CI watching. The current branch PR is automatically watched by default across commits and reruns, without rearming. Explicit other PR/Actions targets are bounded one-shot waits. Status reports the automatic preference. Cancel without a target disables automatic watching and cancels all waits; cancelling the current PR also disables it. Results arrive as follow-ups; no polling or gh run watch is needed. Read-only GitHub access; never reruns jobs or changes PRs.",
    parameters: Type.Object(
      {
        action: StringEnum(["start", "resume", "status", "cancel"] as const),
        target: Type.Optional(
          Type.String({
            description:
              "GitHub.com PR or Actions run URL. Start/resume defaults to the current branch PR. Omit for status/cancel to select all tracked targets.",
          }),
        ),
        timeoutMinutes: Type.Optional(
          Type.Number({
            minimum: 1,
            maximum: 240,
            description:
              "Deadline for bounded explicit waits, default 60. Automatic current-PR watching has no deadline. Resume retains a bounded wait's original deadline.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    outputSchema: RESULT,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async execute(_id, args, signal, _onUpdate, ctx) {
      const active = tracker;
      if (!active || !["tui", "rpc"].includes(ctx.mode))
        throw new Error("Background CI watches require an interactive or RPC session.");
      const target = args.target ? parseTarget(args.target) : undefined;
      let message: string;
      if (args.action === "cancel") message = `Cancelled ${active.cancel(target?.url)} watch(es).`;
      else if (args.action === "status")
        message = target
          ? active.entries.get(target.url)?.watch
            ? JSON.stringify(active.entries.get(target.url)?.watch)
            : "No watch for that target."
          : active.status();
      else {
        const watch = await active.startWatch(
          target,
          args.timeoutMinutes,
          args.action === "resume",
          signal,
        );
        message = watch.automatic
          ? `Automatically watching ${label(watch.target)}. New commits and CI reruns are followed until explicitly disabled. Results arrive automatically; do not poll.`
          : `Watching ${label(watch.target)} at ${watch.head}, until ${new Date(watch.deadline!).toISOString()}. Results arrive automatically. Continue other work or end your turn; do not poll.`;
      }
      const data = {
        status: args.action === "start" || args.action === "resume" ? "watching" : "ok",
        message,
      };
      return { content: [{ type: "text", text: message }], details: data, structuredContent: data };
    },
  });
  pi.on("session_start", (_event, ctx) => start(ctx));
  pi.on("session_tree", (_event, ctx) => start(ctx));
  pi.on("agent_start", (_event, ctx) => {
    if (tracker && ctx.mode === "tui") terminalStatus.agentStarted(pi.getSessionName?.());
  });
  pi.on("agent_settled", (_event, ctx) => {
    if (tracker && ctx.mode === "tui" && ctx.isIdle()) terminalStatus.agentSettled();
  });
  pi.on("session_shutdown", () => stop());
}
