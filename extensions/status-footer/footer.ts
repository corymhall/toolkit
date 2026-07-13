import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type FooterTheme = {
  fg(color: "accent" | "dim" | "error" | "muted" | "success" | "warning", text: string): string;
};

export type StatusFooterData = {
  model?: string;
  thinking?: string;
  branch?: string | null;
  weeklyRemaining?: number;
  contextRemaining?: number;
};

type FooterItem = {
  text: string;
  render(theme: FooterTheme): string;
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function remainingPercent(usedPercent: number | null | undefined): number | undefined {
  if (usedPercent == null || !Number.isFinite(usedPercent)) return undefined;
  return clampPercent(Math.round(100 - usedPercent));
}

type StatusColor = "muted" | "success" | "warning" | "error";

function weeklyColor(remaining: number | undefined): StatusColor {
  if (remaining === undefined) return "warning";
  if (remaining <= 10) return "error";
  if (remaining <= 25) return "warning";
  return "muted";
}

export function contextColor(remaining: number | undefined): StatusColor {
  if (remaining === undefined) return "warning";
  if (remaining > 75) return "success";
  if (remaining >= 45) return "warning";
  return "error";
}

function quotaItem(
  label: string,
  remaining: number | undefined,
  color: (remaining: number | undefined) => StatusColor,
  compact = false,
): FooterItem {
  const percent = remaining === undefined ? "?" : `${Math.round(clampPercent(remaining))}%`;
  const text = compact ? `${label}${percent}` : `${label} ${percent}${remaining === undefined ? "" : " left"}`;
  return {
    text,
    render: theme => theme.fg(color(remaining), text),
  };
}

function optionalItem(text: string | undefined, color: "accent" | "muted"): FooterItem | undefined {
  if (!text) return undefined;
  return { text, render: theme => theme.fg(color, text) };
}

function lineWidth(items: FooterItem[], separator: string): number {
  return items.reduce((width, item, index) => width + visibleWidth(item.text) + (index === 0 ? 0 : visibleWidth(separator)), 0);
}

/** Render a Codex-inspired one-line footer, preserving quota and context on narrow terminals. */
export function renderStatusFooter(data: StatusFooterData, width: number, theme: FooterTheme): string[] {
  if (width <= 0) return [];

  const modelText = data.model ? `${data.model}${data.thinking ? ` ${data.thinking}` : ""}` : undefined;
  const model = optionalItem(modelText, "muted");
  const branch = optionalItem(data.branch ?? undefined, "accent");
  const weekly = quotaItem("weekly", data.weeklyRemaining, weeklyColor);
  const context = quotaItem("context", data.contextRemaining, contextColor);
  const separator = " · ";

  let items = [model, branch, weekly, context].filter((item): item is FooterItem => item !== undefined);
  for (const removable of [branch, model]) {
    if (lineWidth(items, separator) <= width) break;
    if (removable) items = items.filter(item => item !== removable);
  }
  if (lineWidth(items, separator) > width) {
    items = [
      quotaItem("W", data.weeklyRemaining, weeklyColor, true),
      quotaItem("C", data.contextRemaining, contextColor, true),
    ];
  }

  const rendered = items.map(item => item.render(theme)).join(theme.fg("dim", separator));
  return [truncateToWidth(rendered, width, theme.fg("dim", "…"))];
}
