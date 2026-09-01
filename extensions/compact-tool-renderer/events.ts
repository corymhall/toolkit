import type { Component } from "@earendil-works/pi-tui";

// Display-only integrations can replace a compact call component when it is
// rendered. Render-time decoration also applies while Pi rebuilds history on
// reload, before session_start is emitted.
export const COMPACT_TOOL_CALL_RENDER_EVENT = "toolkit:compact-tool-renderer:call-render";

export interface CompactToolCallRenderEvent {
  toolName: string;
  args: Record<string, unknown>;
  component: Component;
  renderContext: {
    cwd: string;
    lastComponent?: Component;
  };
}
