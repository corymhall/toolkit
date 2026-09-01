import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  keyText,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { TOOL_CARD_CALL_RENDER_EVENT, type ToolCardCallRenderEvent } from "./events.ts";
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

interface ToolDefinitionLike {
  name: string;
  execute: (...args: any[]) => Promise<any>;
  renderCall?: (...args: any[]) => Component;
  renderResult?: (...args: any[]) => Component;
  [key: string]: any;
}

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

const factories: Record<CompactToolName, (cwd: string) => ToolDefinitionLike> = {
  bash: createBashToolDefinition,
  read: createReadToolDefinition,
  edit: createEditToolDefinition,
  write: createWriteToolDefinition,
  grep: createGrepToolDefinition,
  find: createFindToolDefinition,
  ls: createLsToolDefinition,
};

export default function toolCardsExtension(pi: ExtensionAPI) {
  const expandHint = `${keyText("app.tools.expand")} to expand`;
  const startedAt = new Map<string, number>();
  const finishedAt = new Map<string, number>();
  const definitions = new Map<string, ToolDefinitionLike>();
  const getDefinition = (name: CompactToolName, cwd: string): ToolDefinitionLike => {
    const key = `${name}\0${cwd}`;
    let definition = definitions.get(key);
    if (!definition) {
      definition = factories[name](cwd);
      definitions.set(key, definition);
    }
    return definition;
  };

  // Pi rebuilds chat history before session_start during /reload. Register at
  // extension load time so historical and new tool calls use the same renderer.
  for (const name of TOOL_NAMES) {
    const initial = getDefinition(name, process.cwd());
    const definition: ToolDefinitionLike = {
      ...initial,
      renderShell: "self",
      async execute(toolCallId, params, signal, onUpdate, executionCtx) {
        startedAt.set(toolCallId, Date.now());
        try {
          return await getDefinition(name, executionCtx.cwd).execute(
            toolCallId,
            params,
            signal,
            onUpdate,
            executionCtx,
          );
        } finally {
          finishedAt.set(toolCallId, Date.now());
        }
      },
      renderCall(args, theme, renderContext) {
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

        const event = {
          toolName: name,
          args,
          component: card,
          renderContext,
        } satisfies ToolCardCallRenderEvent;
        pi.events.emit(TOOL_CARD_CALL_RENDER_EVENT, event);
        return event.component;
      },
      renderResult(result, options, theme, renderContext) {
        const state = renderContext.state as CompactRenderState;
        state.expandable = hasExpandableResult(name, result, renderContext.isError);
        state.summary = summarizeToolResult(name, result, renderContext.isError);
        const nativeRenderResult = getDefinition(name, renderContext.cwd).renderResult;
        const nativeResult =
          nativeRenderResult && state.expandable && options.expanded
            ? nativeRenderResult(result, options, theme, {
                ...renderContext,
                lastComponent: undefined,
              })
            : undefined;
        const start = startedAt.get(renderContext.toolCallId);
        const end = finishedAt.get(renderContext.toolCallId) ?? Date.now();
        state.card
          ?.setDescriptionUrl(descriptionUrl(name, renderContext.args, renderContext.cwd))
          .updateCall(
            name,
            describeToolCall(name, renderContext.args, renderContext.cwd),
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
                  ? (typeof renderContext.args.timeout === "number"
                      ? renderContext.args.timeout
                      : 300) * 1000
                  : undefined,
              words: countToolResultWords(result),
            },
          );
        return new EmptyToolResult();
      },
    };

    pi.registerTool(definition as any);
  }
}
