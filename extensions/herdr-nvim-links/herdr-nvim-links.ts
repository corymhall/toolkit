import { Marked, type Component, type Token } from "@earendil-works/pi-tui";

const ESCAPE = "\u001b";
const BELL = "\u0007";
const OSC_8_PATTERN = new RegExp(
  `${ESCAPE}\\]8;([^;]*);([^${BELL}${ESCAPE}]*)(${BELL}|${ESCAPE}\\\\)`,
  "g",
);

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
  return Boolean(context.sourcePane && context.workspace && context.tab && context.cwd);
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
  return text.replace(
    OSC_8_PATTERN,
    (sequence, params: string, target: string, terminator: string) => {
      if (!target.startsWith("file://")) return sequence;
      return `\x1b]8;${params};${buildHerdrNvimUrl(target, context)}${terminator}`;
    },
  );
}

interface MarkdownReplacement {
  start: number;
  end: number;
  value: string;
}

type TokenWithChildren = Token & {
  raw: string;
  href?: string;
  text?: string;
  tokens?: Token[];
  items?: Array<{ raw: string; tokens?: Token[] }>;
};

const markdownParser = new Marked();
const BARE_FILE_URL_PATTERN = /file:\/\/[^\s<>"'`]+/g;

function localFileUrl(value: string): string | undefined {
  let candidate = value;
  while (/[.,;:!?]$/.test(candidate)) candidate = candidate.slice(0, -1);

  for (const [opening, closing] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]) {
    while (
      candidate.endsWith(closing) &&
      candidate.split(closing).length > candidate.split(opening).length
    ) {
      candidate = candidate.slice(0, -1);
    }
  }

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "file:" ||
      (url.host !== "" && url.host !== "localhost") ||
      !url.pathname.startsWith("/")
    ) {
      return undefined;
    }
    return candidate;
  } catch {
    return undefined;
  }
}

function bareFileUrlReplacements(
  raw: string,
  start: number,
  context: HerdrLinkContext,
): MarkdownReplacement[] {
  const replacements: MarkdownReplacement[] = [];
  for (const match of raw.matchAll(BARE_FILE_URL_PATTERN)) {
    const fileUrl = localFileUrl(match[0]);
    if (!fileUrl || match.index === undefined) continue;
    const label = fileUrl.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
    replacements.push({
      start: start + match.index,
      end: start + match.index + fileUrl.length,
      value: `[${label}](${buildHerdrNvimUrl(fileUrl, context)})`,
    });
  }
  return replacements;
}

function collectMarkdownReplacements(
  tokens: Token[],
  source: string,
  baseOffset: number,
  context: HerdrLinkContext,
  replacements: MarkdownReplacement[],
): void {
  let cursor = 0;
  let htmlDepth = 0;
  for (const value of tokens) {
    const token = value as TokenWithChildren;
    if (typeof token.raw !== "string" || token.raw.length === 0) continue;
    const relativeStart = source.indexOf(token.raw, cursor);
    if (relativeStart < 0) continue;
    cursor = relativeStart + token.raw.length;
    const absoluteStart = baseOffset + relativeStart;

    if (token.type === "html") {
      if (/^<\s*\//.test(token.raw)) {
        htmlDepth = Math.max(0, htmlDepth - 1);
      } else if (
        /^<\s*[A-Za-z]/.test(token.raw) &&
        !/\/\s*>$/.test(token.raw) &&
        !/^<\s*(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b/i.test(
          token.raw,
        )
      ) {
        htmlDepth++;
      }
      continue;
    }
    if (htmlDepth > 0 || token.type === "code" || token.type === "codespan") continue;

    if (token.type === "link") {
      if (!token.href?.startsWith("file://")) continue;
      const fileUrl = localFileUrl(token.href);
      if (!fileUrl) continue;
      const target = buildHerdrNvimUrl(fileUrl, context);
      const hrefStart = token.raw.indexOf(token.href);
      if (hrefStart < 0) continue;
      const label = (token.text ?? fileUrl).replaceAll("]", "\\]");
      replacements.push({
        start: absoluteStart,
        end: absoluteStart + token.raw.length,
        value: token.raw.startsWith("<")
          ? `[${label}](${target})`
          : `${token.raw.slice(0, hrefStart)}${target}${token.raw.slice(hrefStart + token.href.length)}`,
      });
      continue;
    }

    if (token.type === "def" && token.href?.startsWith("file://")) {
      const fileUrl = localFileUrl(token.href);
      const hrefStart = token.raw.indexOf(token.href);
      if (fileUrl && hrefStart >= 0) {
        replacements.push({
          start: absoluteStart + hrefStart,
          end: absoluteStart + hrefStart + token.href.length,
          value: buildHerdrNvimUrl(fileUrl, context),
        });
      }
      continue;
    }

    if (token.type === "text" && !token.tokens) {
      replacements.push(...bareFileUrlReplacements(token.raw, absoluteStart, context));
      continue;
    }

    if (token.tokens) {
      collectMarkdownReplacements(token.tokens, token.raw, absoluteStart, context, replacements);
    }

    if (token.items) {
      let itemCursor = 0;
      for (const item of token.items) {
        const itemStart = token.raw.indexOf(item.raw, itemCursor);
        if (itemStart < 0) continue;
        itemCursor = itemStart + item.raw.length;
        if (item.tokens) {
          collectMarkdownReplacements(
            item.tokens,
            item.raw,
            absoluteStart + itemStart,
            context,
            replacements,
          );
        }
      }
    }
  }
}

export function rewriteFileUrlsInMarkdown(markdown: string, context: HerdrLinkContext): string {
  if (!markdown.includes("file://")) return markdown;

  const replacements: MarkdownReplacement[] = [];
  collectMarkdownReplacements(markdownParser.lexer(markdown), markdown, 0, context, replacements);
  replacements.sort((left, right) => right.start - left.start);

  let result = markdown;
  for (const replacement of replacements) {
    result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end);
  }
  return result;
}

export class HerdrNvimLinkComponent implements Component {
  private inner: Component;
  private context: HerdrLinkContext;

  constructor(inner: Component, context: HerdrLinkContext) {
    this.inner = inner;
    this.context = context;
  }

  get wantsKeyRelease(): boolean | undefined {
    return this.inner.wantsKeyRelease;
  }

  get innerComponent(): Component {
    return this.inner;
  }

  update(inner: Component, context: HerdrLinkContext): this {
    this.inner = inner;
    this.context = context;
    return this;
  }

  render(width: number): string[] {
    return this.inner.render(width).map((line) => rewriteFileHyperlinks(line, this.context));
  }

  handleInput(data: string): void {
    this.inner.handleInput?.(data);
  }

  invalidate(): void {
    this.inner.invalidate();
  }
}
