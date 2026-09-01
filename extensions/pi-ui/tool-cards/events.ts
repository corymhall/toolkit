import type { Component } from "@earendil-works/pi-tui";

// Display-only integrations can replace a tool card when it is rendered.
// Render-time decoration also applies while Pi rebuilds history on reload,
// before session_start is emitted.
export const TOOL_CARD_CALL_RENDER_EVENT = "toolkit:pi-ui:tool-card-render";

export interface ToolCardCallRenderEvent {
  toolName: string;
  args: Record<string, unknown>;
  component: Component;
  renderContext: {
    cwd: string;
    lastComponent?: Component;
  };
}
