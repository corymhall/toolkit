import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  HerdrNvimLinkComponent,
  isUsableHerdrContext,
  rewriteFileUrlsInMarkdown,
  type HerdrLinkContext,
} from "./herdr-nvim-links.ts";

function requestedLine(args: unknown): number | undefined {
  if (!args || typeof args !== "object") return undefined;
  const offset = (args as { offset?: unknown }).offset;
  return typeof offset === "number" && Number.isSafeInteger(offset) && offset > 0
    ? offset
    : undefined;
}

export default function herdrNvimLinksExtension(pi: ExtensionAPI) {
  if (process.env.HERDR_ENV !== "1") return;
  const environment = {
    sourcePane: process.env.HERDR_PANE_ID,
    workspace: process.env.HERDR_WORKSPACE_ID,
    tab: process.env.HERDR_TAB_ID,
    cwd: process.cwd(),
    socket: process.env.HERDR_SOCKET_PATH,
  };
  if (!isUsableHerdrContext(environment)) return;
  const linkContext: HerdrLinkContext = {
    sourcePane: environment.sourcePane,
    workspace: environment.workspace,
    tab: environment.tab,
    cwd: environment.cwd,
    ...(environment.socket ? { socket: environment.socket } : {}),
  };
  pi.registerMarkdownTransformer((markdown) => rewriteFileUrlsInMarkdown(markdown, linkContext));
  pi.registerToolRenderer((name, next) => {
    const original = next();
    if (!original || !["read", "edit", "write"].includes(name)) return original;
    const wrap =
      (renderer: NonNullable<typeof original.renderCall>): typeof renderer =>
      (args, theme, context) => {
        const previous =
          context.lastComponent instanceof HerdrNvimLinkComponent
            ? context.lastComponent
            : undefined;
        const component = renderer(args, theme, {
          ...context,
          lastComponent: previous?.innerComponent,
        });
        const currentContext = {
          ...linkContext,
          cwd: context.cwd,
          ...(requestedLine(context.args) !== undefined
            ? { line: requestedLine(context.args) }
            : {}),
        };
        return previous
          ? previous.update(component, currentContext)
          : new HerdrNvimLinkComponent(component, currentContext);
      };
    return {
      ...original,
      renderCall: original.renderCall ? wrap(original.renderCall) : undefined,
      renderResult: original.renderResult
        ? (result, options, theme, context) => {
            const previous =
              context.lastComponent instanceof HerdrNvimLinkComponent
                ? context.lastComponent
                : undefined;
            const component = original.renderResult!(result, options, theme, {
              ...context,
              lastComponent: previous?.innerComponent,
            });
            const currentContext = { ...linkContext, cwd: context.cwd };
            return previous
              ? previous.update(component, currentContext)
              : new HerdrNvimLinkComponent(component, currentContext);
          }
        : undefined,
    };
  });
}
