import type { Component } from "@earendil-works/pi-tui";

const OSC_8_PATTERN = /\x1b\]8;([^;]*);([^\x07\x1b]*)(\x07|\x1b\\)/g;

export interface HerdrLinkContext {
  sourcePane: string;
  workspace: string;
  tab: string;
  cwd: string;
  socket?: string;
  line?: number;
}

export function isUsableHerdrContext(
  context: Partial<HerdrLinkContext>,
): context is HerdrLinkContext {
  return Boolean(
    context.sourcePane &&
    context.workspace &&
    context.tab &&
    context.cwd,
  );
}

export function buildHerdrNvimUrl(fileUrl: string, context: HerdrLinkContext): string {
  const file = new URL(fileUrl);
  if (file.protocol !== "file:") return fileUrl;

  const target = new URL("herdr-nvim://open");
  target.searchParams.set("file", file.href);
  target.searchParams.set("sourcePane", context.sourcePane);
  target.searchParams.set("workspace", context.workspace);
  target.searchParams.set("tab", context.tab);
  target.searchParams.set("cwd", context.cwd);
  if (context.socket) target.searchParams.set("socket", context.socket);
  if (context.line !== undefined && Number.isSafeInteger(context.line) && context.line > 0) {
    target.searchParams.set("line", String(context.line));
  }
  return target.href;
}

export function rewriteFileHyperlinks(text: string, context: HerdrLinkContext): string {
  return text.replace(OSC_8_PATTERN, (sequence, params: string, target: string, terminator: string) => {
    if (!target.startsWith("file://")) return sequence;
    return `\x1b]8;${params};${buildHerdrNvimUrl(target, context)}${terminator}`;
  });
}

export class HerdrNvimLinkComponent implements Component {
  readonly wantsKeyRelease?: boolean;
  private readonly inner: Component;
  private readonly context: HerdrLinkContext;

  constructor(inner: Component, context: HerdrLinkContext) {
    this.inner = inner;
    this.context = context;
    this.wantsKeyRelease = inner.wantsKeyRelease;
  }

  render(width: number): string[] {
    return this.inner.render(width).map(line => rewriteFileHyperlinks(line, this.context));
  }

  handleInput(data: string): void {
    this.inner.handleInput?.(data);
  }

  invalidate(): void {
    this.inner.invalidate();
  }
}
