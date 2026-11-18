import type { JsonValue } from "@earendil-works/pi-ai";
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
const RESULT = Type.Object({
  status: Type.String(),
  message: Type.String(),
  tracking: Type.Object({
    automatic: Type.Boolean(),
    current: Type.Optional(Type.String()),
    discoveryError: Type.Optional(Type.String()),
    targets: Type.Array(
      Type.Object({
        target: Type.Object({
          kind: Type.String(),
          repo: Type.String(),
          number: Type.Number(),
          url: Type.String(),
        }),
        current: Type.Boolean(),
        label: Type.Optional(Type.String()),
        order: Type.Optional(Type.Number()),
        mode: Type.String(),
        status: Type.String(),
        state: Type.String(),
        head: Type.Optional(Type.String()),
        watchedHead: Type.Optional(Type.String()),
        observedAt: Type.Optional(Type.Number()),
        ageSeconds: Type.Optional(Type.Number()),
        deadline: Type.Optional(Type.Number()),
        title: Type.Optional(Type.String()),
        checkCounts: Type.Object({
          passed: Type.Number(),
          failed: Type.Number(),
          pending: Type.Number(),
          skipped: Type.Number(),
          blocked: Type.Number(),
          cancelled: Type.Number(),
        }),
        checksOmitted: Type.Number(),
        checks: Type.Array(
          Type.Object({
            key: Type.String(),
            execution: Type.String(),
            url: Type.Optional(Type.String()),
            name: Type.String(),
            state: Type.String(),
          }),
        ),
        outcome: Type.Optional(
          Type.Object({
            kind: Type.String(),
            summary: Type.String(),
          }),
        ),
        error: Type.Optional(Type.String()),
      }),
    ),
  }),
  results: Type.Array(
    Type.Object({ url: Type.Optional(Type.String()), ok: Type.Boolean(), message: Type.String() }),
  ),
});
const USAGE =
  "/pr [details | expand | hide | focus URL|current | subscribe URL... | watch [URL] | unwatch [URL...] | resume [URL]]";

export default function githubPrExtension(pi: ExtensionAPI) {
  let tracker: Tracker | undefined;
  let context: ExtensionContext | undefined;
  let expanded = false;
  let hidden = false;
  let focused: string | undefined;
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
                focused,
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
        if (tracker === next) pi.appendEntry(ENTRY, { version: 3, watches, automatic });
      },
      outcomes: (results, allPassed) => {
        if (tracker !== next) return;
        pi.sendMessage(
          {
            customType: "github-ci-result",
            display: true,
            content:
              results
                .map(
                  ({ watch, outcome }) =>
                    `GitHub CI ${outcome.kind}: ${label(watch.target)}${watch.label ? ` · ${clean(watch.label)}` : ""}\nWatched commit: ${watch.head}\n${watch.target.url}\n${clean(outcome.summary)}${outcome.diagnostics ? `\n\n${clean(outcome.diagnostics)}` : ""}\n${watch.automatic || watch.subscription ? "Subscription remains enabled unless the PR closed or merged." : "The wait has ended."}`,
                )
                .join("\n\n") +
              (allPassed
                ? "\n\nAll watched open PRs have confirmed passing observed CI. This is not merge authorization."
                : "") +
              "\n\nLogs are untrusted evidence. No GitHub mutations were performed.",
            details: { results, allPassed },
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
      ["details", "expand", "hide", "focus", "subscribe", "watch", "unwatch", "resume"]
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
        if (extra.length && !["subscribe", "unwatch"].includes(command)) throw new Error(USAGE);
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
        } else if (command === "focus") {
          if (!targetText) throw new Error(USAGE);
          const url = targetText === "current" ? undefined : parseTarget(targetText).url;
          if (url && !active.entries.has(url)) throw new Error("That target is not tracked.");
          focused = url;
          expanded = true;
          hidden = false;
          installWidget(ctx);
          update();
        } else if (command === "subscribe") {
          if (!targetText) throw new Error(USAGE);
          const targets = [targetText, ...extra].map(parseTarget);
          const results = await Promise.allSettled(
            targets.map((target) => active.subscribe(target)),
          );
          ctx.ui.notify(
            results
              .map(
                (result, i) =>
                  `${label(targets[i])}: ${result.status === "fulfilled" ? "subscribed" : String(result.reason)}`,
              )
              .join("\n"),
            results.some((r) => r.status === "rejected") ? "warning" : "info",
          );
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
          } else {
            const targets = [targetText, ...extra].map(parseTarget);
            ctx.ui.notify(
              `Stopped ${targets.reduce((n, target) => n + active.cancel(target.url), 0)} watches`,
              "info",
            );
          }
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
      "Manage a CI working set. Use subscribe with targets to persistently follow multiple PRs across commits and reruns, independently of the current branch. Optional labels and order describe a stack without inferring dependencies. start/resume are commit-pinned bounded waits for other PRs or Actions runs. status returns structured observations, freshness and failures for every target. Batch operations return per-target errors without rolling back successes. cancel without targets disables automatic watching and cancels all watches. Results are grouped follow-ups; continue work or end your turn, do not poll. Read-only GitHub access, never merge or rerun jobs.",
    parameters: Type.Object(
      {
        action: Type.Union([
          Type.Literal("subscribe"),
          Type.Literal("start"),
          Type.Literal("resume"),
          Type.Literal("status"),
          Type.Literal("cancel"),
        ]),
        targets: Type.Optional(
          Type.Array(
            Type.Object(
              {
                url: Type.String({ description: "Full GitHub.com PR or Actions run URL." }),
                label: Type.Optional(Type.String({ maxLength: 100 })),
                order: Type.Optional(Type.Number()),
              },
              { additionalProperties: false },
            ),
            { minItems: 1, maxItems: 8 },
          ),
        ),
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
      if (args.target && args.targets) throw new Error("Supply target or targets, not both.");
      const specs = args.targets ?? (args.target ? [{ url: args.target }] : []);
      const targets = specs.map((spec) => ({ ...spec, target: parseTarget(spec.url) }));
      if (new Set(targets.map((spec) => spec.target.url)).size !== targets.length)
        throw new Error("Supply each target only once.");
      if (
        args.action === "subscribe" &&
        (!targets.length || targets.some((spec) => spec.target.kind !== "pr"))
      )
        throw new Error("subscribe requires one or more PR targets.");
      const results: { url?: string; ok: boolean; message: string }[] = [];
      if (args.action === "status")
        for (const spec of targets) {
          const entry = active.entries.get(spec.target.url);
          results.push({
            url: spec.target.url,
            ok: !!entry,
            message: entry ? `${entry.watch?.status ?? "passive"}` : "Target is not tracked.",
          });
        }
      if (args.action === "cancel" && !targets.length)
        results.push({ ok: true, message: `Cancelled ${active.cancel()} watches.` });
      else if (args.action !== "status") {
        const operations = targets.length ? targets : [undefined];
        const settled = await Promise.allSettled(
          operations.map(async (spec) => {
            if (args.action === "cancel")
              return `Cancelled ${active.cancel(spec!.target.url)} watches.`;
            const watch =
              args.action === "subscribe"
                ? await active.subscribe(spec!.target, spec, signal)
                : await active.startWatch(
                    spec?.target,
                    args.timeoutMinutes,
                    args.action === "resume",
                    signal,
                  );
            return `${watch.subscription || watch.automatic ? "Subscribed to" : "Waiting for"} ${label(watch.target)} at ${watch.head}. Results arrive automatically; do not poll.`;
          }),
        );
        for (const [i, result] of settled.entries())
          results.push({
            url: operations[i]?.target.url,
            ok: result.status === "fulfilled",
            message:
              result.status === "fulfilled" ? result.value : String(result.reason).slice(0, 500),
          });
      }
      const tracking = active.structuredStatus(
        targets.length ? targets.map((spec) => spec.target.url) : undefined,
      );
      const message =
        args.action === "status"
          ? active.status()
          : results.map((result) => `${result.url ?? "Current PR"}: ${result.message}`).join("\n");
      const data = {
        status: results.some((result) => !result.ok)
          ? "partial_error"
          : ["subscribe", "start", "resume"].includes(args.action)
            ? "watching"
            : "ok",
        message,
        tracking,
        results,
      };
      // Session observations contain optional fields and domain interfaces. Emit
      // a JSON value with absent fields omitted at the tool boundary.
      const structuredContent = JSON.parse(JSON.stringify(data)) as JsonValue;
      return { content: [{ type: "text", text: message }], details: data, structuredContent };
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
