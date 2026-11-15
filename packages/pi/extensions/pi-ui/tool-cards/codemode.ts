import type { ExtensionAPI, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { highlightCode, keyText } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { describeToolCall, EmptyToolResult, type CompactTheme } from "./rendering.ts";

interface Action {
  id: string;
  name: string;
  description: string;
  preview: string[];
}
interface Call {
  id: string;
  name: string;
  args: string;
  status: "running" | "ok" | "error" | "cancelled";
  durationMs?: number;
  error?: string;
  cost?: number;
}
interface Details {
  calls?: Call[];
  toolkitActions?: Action[];
  fullOutputPath?: string;
}
interface Result {
  content: Array<{ type: string; text?: string }>;
  details?: Details;
}
// Match Pi’s bounded nested-call history; save only display summaries, not results.
const LIMIT = 256;
const TEST_OUTCOME = /(?:^|\s)(?:ℹ\s+)?(?:tests|pass|fail)\s+\d+|\b\d+ (?:pass|fail)(?:ed)?\b/iu;

function text(result: Result): string {
  return result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

/** Retain useful command outcomes without carrying full nested results into the session. */
function commandPreview(output: string, outcomesOnly = false): string[] {
  const lines = output
    // Terminal styling is not part of a persisted preview.
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/gu, "")
    .replaceAll("\r", "")
    .split("\n")
    .filter((line) => line.trim());
  const summary = lines.filter((line) => TEST_OUTCOME.test(line)).slice(-3);
  const error = lines.findIndex((line) => /(?:Error:|error\[|error TS\d|FAIL\s)/u.test(line));
  const selected = outcomesOnly
    ? summary
    : summary.length && error >= 0
      ? [...summary, ...lines.slice(Math.max(0, error - 2), error + 3)]
      : lines.slice(-6);
  return [...new Set(selected)].map((line) => line.slice(0, 600));
}

function actionDescription(name: string, args: Record<string, unknown>, cwd: string): string {
  const description = describeToolCall(name, args, cwd);
  if (description !== name) return description.replace(/^(?:Path|Query): /u, "");
  const target = args.url ?? args.query ?? args.path ?? args.command;
  const repo =
    args.repos ??
    (args.owner && args.repo ? `${String(args.owner)}/${String(args.repo)}` : undefined);
  return [
    target,
    Array.isArray(repo) ? repo.join(", ") : repo,
    args.number ? `#${String(args.number)}` : undefined,
  ]
    .filter((value) => value !== undefined)
    .map(String)
    .join(" · ");
}

function fallbackAction(call: Call, cwd: string): Action {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(call.args);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      args = parsed as Record<string, unknown>;
  } catch {
    // Pi truncates argument previews. Recover only a complete primary string.
    for (const key of ["path", "command", "pattern", "query", "url"]) {
      const match = call.args.match(new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, "u"));
      if (match) {
        try {
          args[key] = JSON.parse(match[1]!);
        } catch {
          /* incomplete preview */
        }
      }
    }
  }
  return {
    id: call.id,
    name: call.name,
    description: actionDescription(call.name, args, cwd),
    preview: [],
  };
}

function label(name: string): string {
  const labels: Record<string, string> = {
    bash: "Run",
    read: "Read",
    edit: "Edit",
    write: "Write",
    grep: "Search",
    find: "Find",
    ls: "List",
    web_search: "Search web",
    fetch_content: "Fetch",
  };
  return (
    labels[name] ??
    name
      .replace(/^mcp__/u, "")
      .replaceAll("__", " · ")
      .replaceAll("_", " ")
  );
}
function duration(ms?: number): string {
  return ms === undefined ? "" : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** One mutable transcript row; partial snapshots share its live action summaries. */
class CodemodeCard implements Component {
  code = "";
  cwd = "";
  expanded = false;
  running = false;
  failed = false;
  result?: Result;
  nativeResult?: Component;
  actions: Action[] = [];
  theme?: CompactTheme;

  render(width: number): string[] {
    if (width < 12 || !this.theme) return [];
    const theme = this.theme;
    const inner = width - 6;
    const frame = (value: string) => {
      const clipped = truncateToWidth(value, inner, "…");
      return (
        theme.fg("border", "│  ") +
        clipped +
        " ".repeat(Math.max(0, inner - visibleWidth(clipped))) +
        theme.fg("border", "  │")
      );
    };
    const calls = this.result?.details?.calls ?? [];
    const failures = calls.filter((call) => call.status === "error").length;
    const cancelled = calls.filter((call) => call.status === "cancelled").length;
    const running = this.running || calls.some((call) => call.status === "running");
    const state = failures
      ? `${failures} failed${running ? " · running" : ""}`
      : this.failed
        ? "script failed"
        : running
          ? "running"
          : cancelled
            ? `${cancelled} cancelled`
            : "completed";
    const color =
      failures || this.failed ? "error" : running ? "warning" : cancelled ? "muted" : "success";
    const heading = `${theme.fg("toolTitle", "Tool calls")} · ${theme.fg(color, state)}`;
    const lines = [theme.fg("border", `┌${"─".repeat(width - 2)}┐`), frame(heading)];
    const add = (value: string, max = Infinity) => {
      const wrapped = value.split("\n").flatMap((line) => wrapTextWithAnsi(line, inner));
      for (const line of wrapped.slice(0, max)) lines.push(frame(line));
      if (wrapped.length > max) lines.push(frame(theme.fg("muted", "… more output on expansion")));
    };
    // Keep failures visible when a batch contains many routine calls.
    const shown = this.expanded
      ? calls
      : [
          ...calls.filter((call) => call.status === "error").slice(0, 8),
          ...calls.filter((call) => call.status !== "error").slice(-8),
        ].sort((a, b) => calls.indexOf(a) - calls.indexOf(b));
    if (shown.length < calls.length)
      add(theme.fg("muted", `${calls.length - shown.length} actions hidden · expand to view`));
    for (const call of shown) {
      // Running snapshots use a temporary /? id. Match their occurrence in the
      // complete call list, including rows hidden by the collapsed view.
      const occurrence = calls
        .slice(0, calls.indexOf(call))
        .filter((entry) => entry.name === call.name).length;
      const action =
        this.actions.find((entry) => entry.id === call.id) ??
        this.actions.filter((entry) => entry.name === call.name)[occurrence] ??
        fallbackAction(call, this.cwd);
      const icon = { running: "●", ok: "✓", error: "✗", cancelled: "⊘" }[call.status];
      const callColor =
        call.status === "error"
          ? "error"
          : call.status === "running"
            ? "warning"
            : call.status === "ok"
              ? "success"
              : "muted";
      const metadata = [duration(call.durationMs), call.cost ? `$${call.cost.toPrecision(2)}` : ""]
        .filter(Boolean)
        .join(" · ");
      const row = `${theme.fg(callColor, icon)} ${theme.fg("toolTitle", label(call.name))}  ${theme.fg("text", action.description.replace(/[\r\n\t]+/gu, " "))}`;
      const available = inner - visibleWidth(metadata) - 2;
      if (metadata && available > 12) {
        const left = truncateToWidth(row, available, "…");
        lines.push(
          frame(
            left +
              " ".repeat(Math.max(2, inner - visibleWidth(left) - visibleWidth(metadata))) +
              theme.fg("dim", metadata),
          ),
        );
      } else lines.push(frame(row));
      if (!this.expanded) {
        const preview = action.preview.length
          ? action.preview
          : call.error
            ? commandPreview(call.error)
            : [];
        if (preview.length)
          add(
            theme.fg(
              call.status === "error" ? "error" : "muted",
              preview.map((line) => `  ${line}`).join("\n"),
            ),
            call.status === "running" ? 2 : 8,
          );
      }
    }
    if (calls.length === 0) add(theme.fg("muted", running ? "Preparing script…" : "No tool calls"));
    if (this.expanded) {
      add(theme.fg("muted", "Script"));
      add(highlightCode(this.code, "javascript").join("\n"));
      if (this.nativeResult) {
        add(theme.fg("muted", "Full result"));
        for (const line of this.nativeResult.render(inner)) lines.push(frame(line));
      }
    } else {
      // A script failure or a script with no actions still needs a visible result.
      if (this.failed || calls.length === 0) {
        const output = this.result
          ? text(this.result).replace(
              /^Script (?:completed|failed)\nWall time [\d.]+ seconds\nOutput:\n/u,
              "",
            )
          : "";
        if (output.trim())
          add(theme.fg(this.failed ? "error" : "toolOutput", commandPreview(output).join("\n")), 8);
      }
      if (this.result?.details?.fullOutputPath)
        add(theme.fg("muted", `Full output: ${this.result.details.fullOutputPath}`), 2);
      add(theme.fg("muted", `${keyText("app.tools.expand")} to show script and full output`));
    }
    lines.push(theme.fg("border", `└${"─".repeat(width - 2)}┘`));
    return lines;
  }
  invalidate(): void {
    this.nativeResult?.invalidate();
  }
}

/** Register nested-call observers and return a renderer that decorates Pi’s codemode. */
export function codemodeCards(pi: ExtensionAPI) {
  const active = new Map<string, Action[]>();
  const redraw = new Map<string, () => void>();
  pi.on("tool_execution_start", (event, ctx) => {
    if (event.toolName === "codemode") active.set(event.toolCallId, []);
    const actions = event.parentToolCallId ? active.get(event.parentToolCallId) : undefined;
    if (actions && actions.length < LIMIT)
      actions.push({
        id: event.toolCallId,
        name: event.toolName,
        description: actionDescription(event.toolName, event.args ?? {}, ctx.cwd).slice(0, 1000),
        preview: [],
      });
  });
  pi.on("tool_execution_update", (event) => {
    const action = event.parentToolCallId
      ? active.get(event.parentToolCallId)?.find((entry) => entry.id === event.toolCallId)
      : undefined;
    if (action && event.toolName === "bash") {
      action.preview = commandPreview(text(event.partialResult)).slice(-2);
      if (event.parentToolCallId) redraw.get(event.parentToolCallId)?.();
    }
  });
  pi.on("tool_execution_end", (event) => {
    const action = event.parentToolCallId
      ? active.get(event.parentToolCallId)?.find((entry) => entry.id === event.toolCallId)
      : undefined;
    if (action && (event.isError || event.toolName === "bash")) {
      const output = text(event.result);
      action.preview = commandPreview(output, !event.isError);
    }
    if (event.toolName === "codemode") {
      active.delete(event.toolCallId);
      redraw.delete(event.toolCallId);
    }
  });
  pi.on("tool_result", (event) => {
    if (event.toolName !== "codemode") return;
    const actions = active.get(event.toolCallId);
    if (!actions) return;
    // Pi emits the parent tool_result after its children finish and before the
    // parent tool_execution_end. Persist the small summaries here, then release
    // their live map at execution_end. Model-facing content remains untouched.
    return {
      details: {
        ...(event.details as Details),
        toolkitActions: actions.map((action) => ({ ...action, preview: [...action.preview] })),
      },
    };
  });
  const clear = () => {
    active.clear();
    redraw.clear();
  };
  pi.on("session_start", clear);
  pi.on("session_shutdown", clear);
  return (original?: ToolRenderers): ToolRenderers => ({
    renderShell: "self",
    renderCall(args, theme, context) {
      if (context.invalidate && active.has(context.toolCallId))
        redraw.set(context.toolCallId, context.invalidate);
      const state = context.state as { codemodeCard?: CodemodeCard };
      const card = (state.codemodeCard ??= new CodemodeCard());
      card.code = String((args as { code?: string })?.code ?? "");
      card.cwd = context.cwd;
      card.expanded = context.expanded;
      card.running = !card.result || context.isPartial;
      card.theme = theme;
      return card;
    },
    renderResult(result, options, theme, context) {
      const card = ((context.state as { codemodeCard?: CodemodeCard }).codemodeCard ??=
        new CodemodeCard());
      card.result = result as Result;
      card.actions = card.result.details?.toolkitActions ?? active.get(context.toolCallId) ?? [];
      card.code = String((context.args as { code?: string })?.code ?? "");
      card.cwd = context.cwd;
      card.expanded = options.expanded;
      card.running = options.isPartial;
      card.failed = context.isError;
      card.theme = theme;
      card.nativeResult = options.expanded
        ? original?.renderResult?.(result, options, theme, {
            ...context,
            lastComponent: card.nativeResult,
          })
        : undefined;
      return new EmptyToolResult();
    },
  });
}
