import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterTheme } from "./footer.ts";
import { contextColor } from "./footer.ts";

export type ComposerStatusData = {
  model?: string;
  thinking?: string;
  fastMode?: boolean;
  branch?: string | null;
  additions?: number;
  deletions?: number;
  weeklyRemaining?: number;
  contextRemaining?: number;
  cwd: string;
  working?: { frame: string; label: string };
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "?" : `${Math.round(clampPercent(value))}%`;
}

function formatCwd(cwd: string): string {
  const home = process.env.HOME;
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

export function renderProgressBar(
  remaining: number | undefined,
  theme: FooterTheme,
  cells = 10,
): string {
  const filled =
    remaining === undefined ? 0 : Math.round(((100 - clampPercent(remaining)) / 100) * cells);
  return (
    theme.fg(contextColor(remaining), "━".repeat(filled)) +
    theme.fg("dim", "━".repeat(cells - filled))
  );
}

/** Fit labels into a border while preserving the left label first. */
export function renderBorderLine(
  left: string,
  right: string,
  width: number,
  border: (text: string) => string,
): string {
  if (width <= 0) return "";
  if (width === 1) return border("─");

  let leftText = left;
  let rightText = right;
  const fixedWidth = 2;
  const minimumGap = 3;

  while (
    fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minimumGap > width &&
    visibleWidth(rightText) > 0
  ) {
    rightText = truncateToWidth(rightText, visibleWidth(rightText) - 1, "");
  }
  while (
    fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minimumGap > width &&
    visibleWidth(leftText) > 0
  ) {
    leftText = truncateToWidth(leftText, visibleWidth(leftText) - 1, "");
  }

  const gap = Math.max(0, width - fixedWidth - visibleWidth(leftText) - visibleWidth(rightText));
  return `${border("─")}${leftText}${border("─".repeat(gap))}${rightText}${border("─")}`;
}

export function parseGitNumstat(output: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of output.split("\n")) {
    const [added, deleted] = line.split("\t", 2);
    if (added && /^\d+$/.test(added)) additions += Number(added);
    if (deleted && /^\d+$/.test(deleted)) deletions += Number(deleted);
  }
  return { additions, deletions };
}

function topStatus(data: ComposerStatusData, theme: FooterTheme): string {
  const context = formatPercent(data.contextRemaining);
  const weekly = formatPercent(data.weeklyRemaining);
  const model = data.model ?? "no model";
  const thinking = data.thinking ? ` ${data.thinking}` : "";
  const fast = data.fastMode ? " fast" : "";

  return (
    ` ${renderProgressBar(data.contextRemaining, theme)} ` +
    theme.fg("muted", "ctx ") +
    theme.fg(contextColor(data.contextRemaining), `${context} left`) +
    theme.fg("dim", " · ") +
    theme.fg("muted", `weekly ${weekly}`) +
    theme.fg("dim", " · ") +
    theme.fg("muted", model) +
    theme.fg("accent", thinking + fast) +
    " "
  );
}

function workingStatus(data: ComposerStatusData, theme: FooterTheme): string {
  if (!data.working) return "";
  return theme.fg("accent", ` ${data.working.frame} `) + theme.fg("text", data.working.label) + " ";
}

function repositoryStatus(data: ComposerStatusData, theme: FooterTheme): string {
  let status = theme.fg("muted", ` ${formatCwd(data.cwd)}`);
  if (!data.branch) return `${status} `;

  status += theme.fg("dim", " (") + theme.fg("warning", data.branch);
  if (data.additions !== undefined && data.additions > 0) {
    status += theme.fg("success", ` +${data.additions}`);
  }
  if (data.deletions !== undefined && data.deletions > 0) {
    status += theme.fg("error", ` -${data.deletions}`);
  }
  return status + theme.fg("dim", ") ");
}

export function renderComposerBox(
  lines: string[],
  innerWidth: number,
  border: (text: string) => string,
): string[] {
  if (lines.length < 2 || innerWidth <= 0) return lines;

  const blank = " ".repeat(innerWidth);
  const body = [blank, ...lines.slice(1, -1), blank];
  return [
    border("╭") + lines[0] + border("╮"),
    ...body.map((line) => border("│") + line + border("│")),
    border("╰") + lines[lines.length - 1] + border("╯"),
  ];
}

export function renderComposerChrome(
  lines: string[],
  data: ComposerStatusData,
  width: number,
  theme: FooterTheme,
  border: (text: string) => string,
): string[] {
  if (lines.length < 2 || width <= 0) return lines;

  const rendered = [...lines];
  rendered[0] = renderBorderLine("", topStatus(data, theme), width, border);
  rendered[rendered.length - 1] = renderBorderLine(
    workingStatus(data, theme),
    repositoryStatus(data, theme),
    width,
    border,
  );
  return rendered;
}
