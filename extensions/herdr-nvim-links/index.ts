import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import {
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  HerdrNvimLinkComponent,
  isUsableHerdrContext,
  rewriteFileUrlsInMarkdown,
  type HerdrLinkContext,
} from "./herdr-nvim-links.ts";

interface ToolDefinitionLike {
  name: string;
  renderCall?: (...args: any[]) => any;
  [key: string]: any;
}

interface Dependencies {
  createDefinitions?: (cwd: string) => ToolDefinitionLike[];
}

interface RenderContextLike {
  cwd: string;
  lastComponent?: Component;
  [key: string]: unknown;
}

function defaultDefinitions(cwd: string): ToolDefinitionLike[] {
  return [
    createReadToolDefinition(cwd),
    createEditToolDefinition(cwd),
    createWriteToolDefinition(cwd),
  ];
}

function requestedLine(args: unknown): number | undefined {
  if (!args || typeof args !== "object") return undefined;
  const offset = (args as { offset?: unknown }).offset;
  return typeof offset === "number" && Number.isSafeInteger(offset) && offset > 0
    ? offset
    : undefined;
}

export default function herdrNvimLinksExtension(pi: ExtensionAPI, dependencies: Dependencies = {}) {
  if (process.env.HERDR_ENV !== "1") return;

  const environment = {
    sourcePane: process.env.HERDR_PANE_ID,
    workspace: process.env.HERDR_WORKSPACE_ID,
    tab: process.env.HERDR_TAB_ID,
    cwd: process.cwd(),
    socket: process.env.HERDR_SOCKET_PATH,
  };
  if (!isUsableHerdrContext(environment)) return;

  const markdownContext: HerdrLinkContext = {
    sourcePane: environment.sourcePane,
    workspace: environment.workspace,
    tab: environment.tab,
    cwd: environment.cwd,
    ...(environment.socket ? { socket: environment.socket } : {}),
  };
  pi.registerMarkdownTransformer((markdown) =>
    rewriteFileUrlsInMarkdown(markdown, markdownContext),
  );

  const createDefinitions = dependencies.createDefinitions ?? defaultDefinitions;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    const tools = pi.getAllTools();
    const localBuiltins = new Set(
      tools.filter((tool) => tool.sourceInfo.source === "builtin").map((tool) => tool.name),
    );

    for (const definition of createDefinitions(ctx.cwd)) {
      if (!localBuiltins.has(definition.name) || !definition.renderCall) continue;
      const originalRenderCall = definition.renderCall;

      pi.registerTool({
        ...definition,
        renderCall(args: unknown, theme: unknown, renderContext: RenderContextLike) {
          const previous =
            renderContext.lastComponent instanceof HerdrNvimLinkComponent
              ? renderContext.lastComponent
              : undefined;
          const component = originalRenderCall(args, theme, {
            ...renderContext,
            lastComponent: previous?.innerComponent,
          });
          const linkContext: HerdrLinkContext = {
            sourcePane: environment.sourcePane,
            workspace: environment.workspace,
            tab: environment.tab,
            cwd: renderContext.cwd || ctx.cwd,
            ...(environment.socket ? { socket: environment.socket } : {}),
            ...(requestedLine(args) !== undefined ? { line: requestedLine(args) } : {}),
          };
          return previous
            ? previous.update(component, linkContext)
            : new HerdrNvimLinkComponent(component, linkContext);
        },
      } as any);
    }
  });
}
