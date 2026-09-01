import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import type { Component } from "@earendil-works/pi-tui";
import { hyperlink, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface CompactTheme {
  fg(
    color: "error" | "muted" | "success" | "text" | "toolOutput" | "warning",
    text: string,
  ): string;
}

export interface CompactRenderState {
  row?: CompactToolRow;
  summary?: string;
  expandable?: boolean;
}

export interface ToolRenderStatus {
  argsComplete: boolean;
  executionStarted: boolean;
  expanded: boolean;
  expandable?: boolean;
  isError: boolean;
  isPartial: boolean;
}

export interface CompactRowVisual {
  symbol: string;
  color: "error" | "muted" | "success" | "warning";
  expanded: boolean;
  disclosure?: boolean;
}

export class EmptyToolResult implements Component {
  render(): string[] {
    return [];
  }

  invalidate(): void {}
}

export class CompactToolRow implements Component {
  private text = "";
  private suffix = "";

  update(text: string, suffix: string): this {
    this.text = text;
    this.suffix = suffix;
    return this;
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    const suffixWidth = visibleWidth(this.suffix);
    if (suffixWidth >= width) return [truncateToWidth(this.suffix, width, "")];
    return [truncateToWidth(this.text, width - suffixWidth, "") + this.suffix];
  }

  invalidate(): void {}
}

function shortenPath(value: string, cwd: string): string {
  if (!value) return "…";
  const absolute = path.isAbsolute(value) ? path.normalize(value) : undefined;
  const normalizedCwd = path.normalize(cwd);
  if (absolute === normalizedCwd) return ".";
  if (absolute?.startsWith(`${normalizedCwd}${path.sep}`)) {
    return path.relative(normalizedCwd, absolute);
  }
  const home = os.homedir();
  if (absolute === home) return "~";
  if (absolute?.startsWith(`${home}${path.sep}`)) return `~${absolute.slice(home.length)}`;
  return value;
}

function lineCount(value: unknown): number {
  if (typeof value !== "string" || value.length === 0) return 0;
  return value.split("\n").length;
}

export function describeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  cwd: string,
): string {
  switch (toolName) {
    case "bash":
      return typeof args.command === "string" ? args.command : "…";
    case "read": {
      const file = shortenPath(typeof args.path === "string" ? args.path : "", cwd);
      const offset = typeof args.offset === "number" ? args.offset : undefined;
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      if (offset === undefined && limit === undefined) return `Explored ${file}`;
      const start = offset ?? 1;
      return `Explored ${file}:${start}${limit === undefined ? "" : `-${start + limit - 1}`}`;
    }
    case "edit": {
      const file = shortenPath(typeof args.path === "string" ? args.path : "", cwd);
      const edits = Array.isArray(args.edits) ? args.edits.length : 0;
      return `Edited ${file}${edits > 1 ? ` · ${edits} changes` : ""}`;
    }
    case "write": {
      const file = shortenPath(typeof args.path === "string" ? args.path : "", cwd);
      const lines = lineCount(args.content);
      const unit = lines === 1 ? "line" : "lines";
      return `Edited ${file}${lines > 0 ? ` · ${lines} ${unit}` : ""}`;
    }
    case "grep": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "…";
      const root = shortenPath(typeof args.path === "string" ? args.path : ".", cwd);
      return `Explored /${pattern}/${root === "." ? "" : ` in ${root}`}`;
    }
    case "find": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "…";
      const root = shortenPath(typeof args.path === "string" ? args.path : ".", cwd);
      return `Explored ${pattern}${root === "." ? "" : ` in ${root}`}`;
    }
    case "ls":
      return `Explored ${shortenPath(typeof args.path === "string" ? args.path : ".", cwd)}`;
    default:
      return toolName;
  }
}

function textOutput(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter(
      (item): item is { type: "text"; text: string } =>
        item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

function countOutputLines(result: { content: Array<{ type: string; text?: string }> }): number {
  const output = textOutput(result).trim();
  return output ? output.split("\n").filter(Boolean).length : 0;
}

function bashOutput(result: { content: Array<{ type: string; text?: string }> }): string {
  return textOutput(result)
    .replace(/(?:^|\n\n)Command exited with code \d+\s*$/u, "")
    .replace(/(?:^|\n\n)Command timed out[^\n]*\s*$/u, "")
    .trim();
}

export function hasExpandableResult(
  toolName: string,
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  isError = false,
): boolean {
  if (toolName === "write") return isError && Boolean(textOutput(result).trim());
  if (toolName === "edit") {
    const diff = (result.details as { diff?: unknown } | undefined)?.diff;
    return (
      (typeof diff === "string" && diff.length > 0) ||
      (isError && Boolean(textOutput(result).trim()))
    );
  }
  if (toolName === "bash") {
    const output = bashOutput(result);
    return output.length > 0 && output !== "(no output)";
  }
  return result.content.some(
    (item) => item.type === "image" || (item.type === "text" && Boolean(item.text?.trim())),
  );
}

export function summarizeToolResult(
  toolName: string,
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  isError = false,
): string | undefined {
  if (toolName === "bash") {
    if (!isError) return undefined;
    const exitCode = textOutput(result).match(/Command exited with code (\d+)/u)?.[1];
    if (exitCode) return `exit code: ${exitCode}`;
    if (/Command timed out/iu.test(textOutput(result))) return "timed out";
    return "failed";
  }

  if (toolName === "edit") {
    const diff = (result.details as { diff?: unknown } | undefined)?.diff;
    if (typeof diff !== "string") return undefined;
    let additions = 0;
    let removals = 0;
    for (const line of diff.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) removals++;
    }
    return `+${additions} -${removals}`;
  }

  if (toolName === "write") return undefined;
  const count = countOutputLines(result);
  if (count === 0) {
    return result.content.some((item) => item.type === "image") ? "image" : undefined;
  }

  const units =
    toolName === "read"
      ? ["line", "lines"]
      : toolName === "grep"
        ? ["result", "results"]
        : toolName === "find"
          ? ["file", "files"]
          : toolName === "ls"
            ? ["entry", "entries"]
            : ["line", "lines"];
  return `${count} ${count === 1 ? units[0] : units[1]}`;
}

export function renderCompactDescription(
  description: string,
  visual: CompactRowVisual,
  summary: string | undefined,
  theme: CompactTheme,
): { text: string; suffix: string } {
  let text = `${theme.fg(visual.color, visual.symbol)} ${theme.fg("text", description)}`;
  if (summary) text += theme.fg("muted", ` · ${summary}`);
  const suffix =
    visual.disclosure === false ? "" : theme.fg("muted", visual.expanded ? " ▾" : " ▸");
  return { text, suffix };
}

export function renderCompactRow(
  toolName: string,
  args: Record<string, unknown>,
  cwd: string,
  status: ToolRenderStatus,
  summary: string | undefined,
  theme: CompactTheme,
): { text: string; suffix: string } {
  const state =
    toolName === "bash"
      ? {
          symbol: "$",
          color:
            !status.argsComplete || !status.executionStarted
              ? ("muted" as const)
              : status.isPartial
                ? ("warning" as const)
                : status.isError
                  ? ("error" as const)
                  : ("success" as const),
        }
      : !status.argsComplete || !status.executionStarted
        ? { symbol: "·", color: "muted" as const }
        : status.isPartial
          ? { symbol: "●", color: "warning" as const }
          : status.isError
            ? { symbol: "✗", color: "error" as const }
            : { symbol: "✓", color: "success" as const };
  let description = describeToolCall(toolName, args, cwd);
  if (["read", "edit", "write"].includes(toolName) && typeof args.path === "string") {
    description = hyperlink(description, pathToFileURL(path.resolve(cwd, args.path)).href);
  }
  return renderCompactDescription(
    description,
    {
      ...state,
      expanded: status.expanded,
      disclosure: status.expandable ?? true,
    },
    !status.isPartial ? summary : undefined,
    theme,
  );
}
