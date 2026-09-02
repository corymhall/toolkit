import path from "node:path";
import os from "node:os";
import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { hyperlink, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export interface CompactTheme {
  fg(
    color:
      | "accent"
      | "bashMode"
      | "border"
      | "borderMuted"
      | "dim"
      | "error"
      | "muted"
      | "success"
      | "syntaxComment"
      | "syntaxFunction"
      | "syntaxKeyword"
      | "syntaxOperator"
      | "syntaxString"
      | "syntaxVariable"
      | "text"
      | "toolOutput"
      | "toolTitle"
      | "warning",
    text: string,
  ): string;
  bold?(text: string): string;
}

export interface CompactRenderState {
  card?: CompactToolCard;
  summary?: string;
  expandable?: boolean;
}

export interface ToolCardMetadata {
  durationMs?: number;
  timeoutMs?: number;
  words?: number;
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

const SHELL_OPERATOR = /^(?:&&|\|\||<<-|<<|>>|>&|\|&|[|&;()<>])$/u;
const SHELL_VARIABLE = /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/u;

interface Heredoc {
  delimiter: string;
  stripTabs: boolean;
}

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  javascript: "javascript",
  node: "javascript",
  powershell: "powershell",
  pwsh: "powershell",
  python: "python",
  ruby: "ruby",
  rust: "rust",
  typescript: "typescript",
};

function nextToken(tokens: string[], start: number): string | undefined {
  return tokens.slice(start).find((token) => !/^\s+$/u.test(token));
}

/** Accept simple shell words; complex expressions keep the previous shell-only rendering. */
function simpleShellWord(token: string | undefined, allowVariables = false): string | undefined {
  if (!token || SHELL_OPERATOR.test(token)) return undefined;
  const quoted = token.match(/^(['"])(.*)\1$/u);
  const word = quoted?.[2] ?? token;
  if (
    !word ||
    /['"`]/u.test(word) ||
    (!quoted && /\s/u.test(word)) ||
    (!allowVariables && /\$/u.test(word))
  ) {
    return undefined;
  }
  return word.replace(/\\(.)/gu, "$1");
}

function heredocsOnShellLine(line: string): Heredoc[] {
  const tokens = tokenizeShellLine(line);
  if (!tokens) return [];
  return tokens.flatMap((token, index) => {
    if (token !== "<<" && token !== "<<-") return [];
    const delimiter = simpleShellWord(nextToken(tokens, index + 1));
    return delimiter && /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(delimiter)
      ? [{ delimiter, stripTabs: token === "<<-" }]
      : [];
  });
}

function redirectedPaths(line: string): string[] {
  const tokens = tokenizeShellLine(line) ?? [];
  return tokens.flatMap((token, index) => {
    if (token !== ">" && token !== ">>") return [];
    const outputPath = simpleShellWord(nextToken(tokens, index + 1), true);
    return outputPath ? [outputPath] : [];
  });
}

/** Select heredoc syntax from shell context without unreliable body auto-detection. */
export function inferHeredocLanguage(shellLine: string, delimiter: string): string | undefined {
  if (/\bgit\s+(?:commit|tag)\b/u.test(shellLine)) return undefined;
  if (
    /\b(?:gh\s+(?:pr|issue)\s+create|glab\s+(?:mr|issue)\s+create)\b/u.test(shellLine) &&
    /--(?:body|description)(?:-file)?\b/u.test(shellLine)
  ) {
    return "markdown";
  }

  for (const outputPath of redirectedPaths(shellLine).reverse()) {
    const language = getLanguageFromPath(outputPath);
    if (language) return language;
  }

  const interpreter = shellLine.match(
    /(?:^|[;&|()])\s*(?:(?:command|env|exec|sudo)\s+)?(python(?:\d+(?:\.\d+)*)?|bash|fish|lua|node|perl|php|powershell|pwsh|ruby|sh|zsh)(?=\s|$)/u,
  )?.[1];
  const hint = interpreter?.startsWith("python")
    ? "python"
    : (interpreter ?? delimiter.replace(/[^A-Za-z0-9]+/gu, "").toLowerCase());
  return getLanguageFromPath(`body.${hint}`) ?? LANGUAGE_ALIASES[hint];
}

type CodeHighlighter = (code: string, language?: string) => string[];

/** Highlight shell lines and each complete heredoc body in its inferred language. */
export function highlightShellCommandLines(
  command: string,
  theme: CompactTheme,
  codeHighlighter: CodeHighlighter = highlightCode,
): string[] {
  const sourceLines = command.replaceAll("\r", "").split("\n");
  if (sourceLines.length > 1 && !sourceLines.some((line) => heredocsOnShellLine(line).length > 0)) {
    return codeHighlighter(sourceLines.join("\n"), "bash");
  }

  const rendered: string[] = [];
  for (let index = 0; index < sourceLines.length; index++) {
    const shellLine = sourceLines[index] ?? "";
    rendered.push(highlightShellCommand(shellLine, theme));
    const heredocs = heredocsOnShellLine(shellLine);

    for (const heredoc of heredocs) {
      const body: string[] = [];
      let terminator: string | undefined;
      while (++index < sourceLines.length) {
        const line = sourceLines[index] ?? "";
        const compared = heredoc.stripTabs ? line.replace(/^\t+/u, "") : line;
        if (compared === heredoc.delimiter) {
          terminator = line;
          break;
        }
        body.push(line);
      }

      const language = inferHeredocLanguage(shellLine, heredoc.delimiter);
      if (body.length > 0) {
        rendered.push(
          ...(language
            ? codeHighlighter(body.join("\n"), language)
            : body.map((line) => theme.fg("text", line))),
        );
      }
      if (terminator === undefined) break;
      rendered.push(theme.fg("syntaxOperator", terminator));
    }
  }

  return rendered;
}

function tokenizeShellLine(line: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < line.length; index++) {
    const char = line[index] ?? "";
    const next = line[index + 1] ?? "";
    if (quote) {
      current += char;
      if (char === "\\" && next) current += line[++index] ?? "";
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (/\s/u.test(char)) {
      if (current) tokens.push(current);
      current = "";
      tokens.push(char);
      continue;
    }
    if (char === "#" && !current) {
      tokens.push(line.slice(index));
      return tokens;
    }
    const pair = `${char}${next}`;
    const triple = `${pair}${line[index + 2] ?? ""}`;
    if (SHELL_OPERATOR.test(triple) || SHELL_OPERATOR.test(pair) || SHELL_OPERATOR.test(char)) {
      if (current) tokens.push(current);
      current = "";
      if (SHELL_OPERATOR.test(triple)) {
        tokens.push(triple);
        index += 2;
      } else if (SHELL_OPERATOR.test(pair)) {
        tokens.push(pair);
        index++;
      } else tokens.push(char);
      continue;
    }
    current += char;
  }
  if (quote) return undefined;
  if (current) tokens.push(current);
  return tokens;
}

export function highlightShellCommand(line: string, theme: CompactTheme): string {
  const tokens = tokenizeShellLine(line);
  if (!tokens) return theme.fg("text", line);
  let commandExpected = true;
  return tokens
    .map((token) => {
      if (/^\s+$/u.test(token)) return token;
      if (token.startsWith("#")) return theme.fg("syntaxComment", token);
      if (SHELL_OPERATOR.test(token)) {
        commandExpected = ["|", "||", "&&", ";", "&"].includes(token);
        return theme.fg("syntaxOperator", token);
      }
      const unquoted = token.replace(/^(['"])(.*)\1$/u, "$2");
      if (/^[A-Za-z_][A-Za-z0-9_]*=.*/u.test(unquoted)) {
        return theme.fg("syntaxVariable", token);
      }
      const color = unquoted.startsWith("-")
        ? "syntaxKeyword"
        : unquoted.includes("/") ||
            /^\.{1,2}(?:\/|$)/u.test(unquoted) ||
            SHELL_VARIABLE.test(unquoted)
          ? "syntaxVariable"
          : token.startsWith("'") || token.startsWith('"')
            ? "syntaxString"
            : commandExpected
              ? "syntaxFunction"
              : "syntaxString";
      commandExpected = false;
      return theme.fg(color, token);
    })
    .join("");
}

function toolDisplayLabel(toolName: string): string {
  if (toolName === "grep") return "Search";
  if (toolName === "ls") return "List";
  return toolName.charAt(0).toUpperCase() + toolName.slice(1);
}

function renderCardDescription(description: string, theme: CompactTheme, url?: string): string {
  const match = description.match(/^(Path|Query|URL|Command|Wait): (.*)$/su);
  let rendered: string;
  if (!match) {
    rendered = theme.fg("text", description);
  } else {
    const label = theme.fg("dim", `${match[1]}: `);
    const value = match[2] ?? "";
    if (match[1] === "Command") {
      rendered = `${label}${theme.fg("bashMode", "$ ")}${highlightShellCommand(value, theme)}`;
    } else {
      const repositoryScope =
        match[1] === "Query" ? value.match(/^(.*) · (Repos?): (.*)$/su) : null;
      rendered = repositoryScope
        ? `${label}${theme.fg("text", repositoryScope[1] ?? "")}${theme.fg("dim", ` · ${repositoryScope[2]}: `)}${theme.fg("text", repositoryScope[3] ?? "")}`
        : `${label}${theme.fg("text", value)}`;
    }
  }
  return url ? hyperlink(rendered, url) : rendered;
}

/** Mutable card component that Pi renderers reuse as call and result state changes. */
export class CompactToolCard implements Component {
  private toolName = "";
  private description = "";
  private visual: CompactRowVisual = { symbol: "·", color: "muted", expanded: false };
  private summary?: string;
  private preview: string[] = [];
  private expandedResult?: Component;
  private metadata: ToolCardMetadata = {};
  private hasResult = false;
  private compact = false;
  private showCompactSummary = false;
  private displayLabel?: string;
  private descriptionUrl?: string;
  private theme?: CompactTheme;

  setCompact(compact = true): this {
    this.compact = compact;
    return this;
  }

  setDisplayLabel(label: string): this {
    this.displayLabel = label;
    return this;
  }

  setDescriptionUrl(url?: string): this {
    this.descriptionUrl = url;
    return this;
  }

  setShowCompactSummary(show = true): this {
    this.showCompactSummary = show;
    return this;
  }

  updateCall(
    toolName: string,
    description: string,
    visual: CompactRowVisual,
    summary: string | undefined,
    theme: CompactTheme,
  ): this {
    this.toolName = toolName;
    this.description = description;
    this.visual = visual;
    this.summary = summary;
    this.theme = theme;
    return this;
  }

  updateResult(
    preview: string[],
    expandedResult: Component | undefined,
    metadata: ToolCardMetadata,
  ): this {
    this.preview = preview;
    this.expandedResult = expandedResult;
    this.metadata = metadata;
    this.hasResult = true;
    return this;
  }

  render(width: number): string[] {
    if (width < 7 || !this.theme) return [];
    const theme = this.theme;
    const innerWidth = width - 6;
    const status = theme.fg(this.visual.color, this.visual.symbol);
    const summary = this.summary ? theme.fg("muted", ` · ${this.summary}`) : "";
    const label = this.displayLabel ?? toolDisplayLabel(this.toolName);
    const heading = `${theme.fg("accent", "➔")} ${theme.fg("toolTitle", label)} ${status}`;
    const divider = theme.fg("borderMuted", " |");
    const boldHeading = theme.bold?.(heading) ?? heading;
    const title = `${boldHeading}${summary}${divider}`;
    const border = (text: string) => theme.fg("border", text);
    const frameLine = (content: string): string => {
      const clipped = truncateToWidth(content, innerWidth, "");
      return (
        border("│  ") +
        clipped +
        " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped))) +
        border("  │")
      );
    };
    const topBorder = border(`┌${"─".repeat(width - 2)}┐`);
    const bottomBorder = border(`└${"─".repeat(width - 2)}┘`);
    const metadata = formatToolCardMetadata(this.metadata);
    if (this.compact && !this.visual.expanded && this.visual.color !== "error") {
      const left = `${boldHeading}${divider} ${renderCardDescription(this.description, theme, this.descriptionUrl)}`;
      const renderedSummary =
        this.showCompactSummary && this.summary ? theme.fg("muted", this.summary) : "";
      const renderedMetadata = metadata ? renderToolCardMetadata(this.metadata, theme) : "";
      const rightDivider = theme.fg("borderMuted", " | ");
      let renderedRight =
        renderedSummary && renderedMetadata
          ? `${renderedSummary}${rightDivider}${renderedMetadata}`
          : renderedSummary || renderedMetadata;
      const dividerWidth = visibleWidth(rightDivider);
      if (
        renderedSummary &&
        renderedMetadata &&
        visibleWidth(renderedRight) + dividerWidth >= innerWidth
      ) {
        renderedRight = renderedSummary;
      }
      const rightWidth = visibleWidth(renderedRight);
      let content = truncateToWidth(left, innerWidth, "…");
      if (renderedRight && rightWidth + dividerWidth < innerWidth) {
        const leftWidth = Math.max(1, innerWidth - rightWidth - dividerWidth - 1);
        const clippedLeft = truncateToWidth(left, leftWidth, "…");
        const gap = " ".repeat(Math.max(1, leftWidth - visibleWidth(clippedLeft) + 1));
        content = `${clippedLeft}${gap}${rightDivider}${renderedRight}`;
      }
      return [topBorder, frameLine(content), bottomBorder];
    }

    const insetDivider = frameLine(theme.fg("borderMuted", "─".repeat(innerWidth)));
    const lines = [topBorder, frameLine(title), insetDivider];

    const descriptions =
      this.toolName === "bash"
        ? highlightShellCommandLines(this.description, theme)
        : this.description.replaceAll("\r", "").split("\n");
    for (const [index, description] of descriptions.entries()) {
      const callLine =
        this.toolName === "bash"
          ? `${theme.fg("bashMode", index === 0 ? "$ " : "> ")}${description}`
          : renderCardDescription(description, theme, this.descriptionUrl);
      for (const wrapped of wrapTextWithAnsi(callLine, innerWidth)) lines.push(frameLine(wrapped));
    }

    const showExpandedResult =
      (this.visual.expanded || this.visual.color === "error") && this.expandedResult;
    const resultLines = showExpandedResult
      ? (this.expandedResult?.render(innerWidth) ?? [])
      : this.preview;
    if (this.hasResult && (resultLines.length > 0 || metadata)) lines.push(insetDivider);
    for (const line of resultLines) {
      const styled = this.visual.expanded
        ? line
        : isExpansionHint(line)
          ? theme.fg("muted", line)
          : theme.fg(this.visual.color === "error" ? "error" : "toolOutput", line);
      lines.push(frameLine(styled));
    }

    if (metadata) {
      if (resultLines.length > 0) lines.push(insetDivider);
      lines.push(frameLine(renderToolCardMetadata(this.metadata, theme)));
    }
    lines.push(bottomBorder);
    return lines;
  }

  invalidate(): void {
    this.expandedResult?.invalidate();
  }
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
      if (offset === undefined && limit === undefined) return `Path: ${file}`;
      const start = offset ?? 1;
      return `Path: ${file}:${start}${limit === undefined ? "" : `-${start + limit - 1}`}`;
    }
    case "edit": {
      const file = shortenPath(typeof args.path === "string" ? args.path : "", cwd);
      const edits = Array.isArray(args.edits) ? args.edits.length : 0;
      return `Path: ${file}${edits > 1 ? ` · ${edits} changes` : ""}`;
    }
    case "write": {
      const file = shortenPath(typeof args.path === "string" ? args.path : "", cwd);
      const lines = lineCount(args.content);
      const unit = lines === 1 ? "line" : "lines";
      return `Path: ${file}${lines > 0 ? ` · ${lines} ${unit}` : ""}`;
    }
    case "grep": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "…";
      const root = shortenPath(typeof args.path === "string" ? args.path : ".", cwd);
      return `Query: /${pattern}/ in ${root === "." ? "current directory" : root}`;
    }
    case "find": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "…";
      const root = shortenPath(typeof args.path === "string" ? args.path : ".", cwd);
      return `Query: ${pattern}${root === "." ? " in current directory" : ` in ${root}`}`;
    }
    case "ls": {
      const root = shortenPath(typeof args.path === "string" ? args.path : ".", cwd);
      return `Path: ${root === "." ? "current directory" : root}`;
    }
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

export function previewToolResult(
  toolName: string,
  result: { content: Array<{ type: string; text?: string }> },
  maxLines = 5,
  expandHint = "Ctrl+O to expand",
  isError = false,
): string[] {
  if (toolName !== "bash" && !isError) return [];
  const output = toolName === "bash" ? bashOutput(result) : textOutput(result).trim();
  if (!output || output === "(no output)") return [];
  const lines = output.split("\n");
  const shown = lines.slice(-maxLines);
  if (lines.length > maxLines) {
    shown.push("", `... ${lines.length - maxLines} more lines, press ${expandHint}`);
  }
  return shown;
}

export function countToolResultWords(result: {
  content: Array<{ type: string; text?: string }>;
}): number {
  let words = 0;
  let inWord = false;
  for (const character of textOutput(result)) {
    const isWord = /[\p{L}\p{N}_'-]/u.test(character);
    if (isWord && !inWord) words++;
    inWord = isWord;
  }
  return words;
}

function formatCompactCount(value: number): string {
  if (value < 1000) return `${Math.round(value)}`;
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  if (value < 10_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${Math.round(value / 1_000_000)}M`;
}

function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}

function formatToolCardMetadata(metadata: ToolCardMetadata): string {
  const parts: string[] = [];
  if (metadata.durationMs !== undefined) parts.push(`◷ ${formatDuration(metadata.durationMs)}`);
  if (metadata.timeoutMs !== undefined) parts.push(`⏹ ${metadata.timeoutMs / 1000}s`);
  if (metadata.words !== undefined && metadata.words > 0) {
    parts.push(`✎ ~${formatCompactCount(metadata.words)} words`);
  }
  return parts.join(" · ");
}

function renderToolCardMetadata(metadata: ToolCardMetadata, theme: CompactTheme): string {
  const parts: string[] = [];
  const part = (icon: string, value: string) =>
    `${theme.fg("toolOutput", icon)} ${theme.fg("dim", value)}`;
  if (metadata.durationMs !== undefined) parts.push(part("◷", formatDuration(metadata.durationMs)));
  if (metadata.timeoutMs !== undefined) parts.push(part("⏹", `${metadata.timeoutMs / 1000}s`));
  if (metadata.words !== undefined && metadata.words > 0) {
    parts.push(part("✎", `~${formatCompactCount(metadata.words)} words`));
  }
  return parts.join(theme.fg("dim", " · "));
}

function isExpansionHint(line: string): boolean {
  return /^(?:…|\.\.\.) \d+ more lines,/u.test(line);
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

export function resolveToolVisual(toolName: string, status: ToolRenderStatus): CompactRowVisual {
  const state =
    toolName === "bash"
      ? {
          symbol:
            !status.argsComplete || !status.executionStarted
              ? "·"
              : status.isPartial
                ? "●"
                : status.isError
                  ? "✗"
                  : "✓",
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
  return {
    ...state,
    expanded: status.expanded,
    disclosure: status.expandable ?? true,
  };
}
