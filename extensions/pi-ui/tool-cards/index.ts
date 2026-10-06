import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { keyText } from "@earendil-works/pi-coding-agent";
import { codemodeCards } from "./codemode.ts";
import {
  CompactToolCard,
  countToolResultWords,
  describeToolCall,
  EmptyToolResult,
  hasExpandableResult,
  previewToolResult,
  resolveToolVisual,
  summarizeToolResult,
  type CompactRenderState,
} from "./rendering.ts";

const TOOL_NAMES = ["bash", "read", "edit", "write", "grep", "find", "ls"] as const;
const COMPACT_CARD_TOOLS = new Set(["read", "write", "grep", "find", "ls"]);
const FILE_TOOLS = new Set(["read", "edit", "write"]);
type CompactToolName = (typeof TOOL_NAMES)[number];

function descriptionUrl(
  name: CompactToolName,
  args: Record<string, unknown>,
  cwd: string,
): string | undefined {
  if (!FILE_TOOLS.has(name) || typeof args.path !== "string") return undefined;
  return pathToFileURL(path.resolve(cwd, args.path)).href;
}

export default function toolCardsExtension(pi: ExtensionAPI) {
  const renderCodemode = codemodeCards(pi);
  const expandHint = `${keyText("app.tools.expand")} to expand`;
  const startedAt = new Map<string, number>();
  const finishedAt = new Map<string, number>();
  pi.on("tool_execution_start", (event) => {
    if (!event.parentToolCallId && TOOL_NAMES.includes(event.toolName as CompactToolName)) {
      startedAt.set(event.toolCallId, Date.now());
    }
  });
  pi.on("tool_execution_end", (event) => {
    if (startedAt.has(event.toolCallId)) finishedAt.set(event.toolCallId, Date.now());
  });
  pi.on("session_start", () => {
    startedAt.clear();
    finishedAt.clear();
  });

  // Register before history is rebuilt, without changing the tool loadout.
  pi.registerToolRenderer((toolName, next) => {
    const original = next();
    if (toolName === "codemode") return renderCodemode(original);
    if (!TOOL_NAMES.includes(toolName as CompactToolName)) return original;
    const name = toolName as CompactToolName;
    return {
      renderShell: "self",
      renderCall(input, theme, renderContext) {
        const args = (input ?? {}) as Record<string, unknown>;
        const state = renderContext.state as CompactRenderState;
        const status = {
          argsComplete: renderContext.argsComplete,
          executionStarted: renderContext.executionStarted,
          expanded: renderContext.expanded,
          expandable: state.expandable ?? false,
          isError: renderContext.isError,
          isPartial: renderContext.isPartial,
        };
        const card =
          renderContext.lastComponent instanceof CompactToolCard
            ? renderContext.lastComponent
            : (state.card ?? new CompactToolCard());
        state.card = card;
        card
          .setCompact(COMPACT_CARD_TOOLS.has(name))
          .setDescriptionUrl(descriptionUrl(name, args, renderContext.cwd))
          .updateCall(
            name,
            describeToolCall(name, args, renderContext.cwd),
            resolveToolVisual(name, status),
            state.summary,
            theme,
          );

        return card;
      },
      renderResult(result, options, theme, renderContext) {
        const args = (renderContext.args ?? {}) as Record<string, unknown>;
        const state = renderContext.state as CompactRenderState;
        state.expandable = hasExpandableResult(name, result, renderContext.isError);
        state.summary = summarizeToolResult(name, result, renderContext.isError);
        const nativeRenderResult = original?.renderResult;
        const nativeResult =
          nativeRenderResult && state.expandable && options.expanded
            ? nativeRenderResult(result, options, theme, {
                ...renderContext,
                lastComponent: state.nativeResult,
              })
            : undefined;
        state.nativeResult = nativeResult;
        const start = startedAt.get(renderContext.toolCallId);
        const end = finishedAt.get(renderContext.toolCallId) ?? Date.now();
        state.card
          ?.setDescriptionUrl(descriptionUrl(name, args, renderContext.cwd))
          .updateCall(
            name,
            describeToolCall(name, args, renderContext.cwd),
            resolveToolVisual(name, {
              argsComplete: true,
              executionStarted: true,
              expanded: renderContext.expanded,
              expandable: state.expandable,
              isError: renderContext.isError,
              isPartial: options.isPartial,
            }),
            state.summary,
            theme,
          )
          .updateResult(
            previewToolResult(name, result, 5, expandHint, renderContext.isError),
            nativeResult,
            {
              durationMs: start === undefined ? undefined : Math.max(0, end - start),
              timeoutMs:
                name === "bash"
                  ? (typeof args.timeout === "number" ? args.timeout : 300) * 1000
                  : undefined,
              words: countToolResultWords(result),
            },
          );
        return new EmptyToolResult();
      },
    } satisfies ToolRenderers;
  });
}
