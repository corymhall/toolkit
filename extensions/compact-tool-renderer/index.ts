import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { COMPACT_TOOL_CALL_RENDER_EVENT, type CompactToolCallRenderEvent } from "./events.ts";
import {
  CompactToolRow,
  EmptyToolResult,
  hasExpandableResult,
  renderCompactRow,
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
type CompactToolName = (typeof TOOL_NAMES)[number];

const factories: Record<CompactToolName, (cwd: string) => ToolDefinitionLike> = {
  bash: createBashToolDefinition,
  read: createReadToolDefinition,
  edit: createEditToolDefinition,
  write: createWriteToolDefinition,
  grep: createGrepToolDefinition,
  find: createFindToolDefinition,
  ls: createLsToolDefinition,
};

export default function compactToolRendererExtension(pi: ExtensionAPI) {
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
        return getDefinition(name, executionCtx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          executionCtx,
        );
      },
      renderCall(args, theme, renderContext) {
        const state = renderContext.state as CompactRenderState;
        const row =
          renderContext.lastComponent instanceof CompactToolRow
            ? renderContext.lastComponent
            : (state.row ?? new CompactToolRow());
        state.row = row;
        const rendered = renderCompactRow(
          name,
          args,
          renderContext.cwd,
          {
            argsComplete: renderContext.argsComplete,
            executionStarted: renderContext.executionStarted,
            expanded: renderContext.expanded,
            expandable: state.expandable ?? false,
            isError: renderContext.isError,
            isPartial: renderContext.isPartial,
          },
          state.summary,
          theme,
        );
        row.update(rendered.text, rendered.suffix);

        const event = {
          toolName: name,
          args,
          component: row,
          renderContext,
        } satisfies CompactToolCallRenderEvent;
        pi.events.emit(COMPACT_TOOL_CALL_RENDER_EVENT, event);
        return event.component;
      },
      renderResult(result, options, theme, renderContext) {
        const state = renderContext.state as CompactRenderState;
        state.expandable = hasExpandableResult(name, result, renderContext.isError);
        state.summary = summarizeToolResult(name, result, renderContext.isError);
        const rendered = renderCompactRow(
          name,
          renderContext.args,
          renderContext.cwd,
          {
            argsComplete: renderContext.argsComplete,
            executionStarted: renderContext.executionStarted,
            expanded: renderContext.expanded,
            expandable: state.expandable,
            isError: renderContext.isError,
            isPartial: renderContext.isPartial,
          },
          state.summary,
          theme,
        );
        state.row?.update(rendered.text, rendered.suffix);
        if (!options.expanded || !state.expandable) return new EmptyToolResult();

        const nativeRenderResult = getDefinition(name, renderContext.cwd).renderResult;
        if (!nativeRenderResult) return new EmptyToolResult();
        return nativeRenderResult(result, options, theme, {
          ...renderContext,
          lastComponent:
            renderContext.lastComponent instanceof EmptyToolResult
              ? undefined
              : renderContext.lastComponent,
        });
      },
    };

    pi.registerTool(definition as any);
  }
}
