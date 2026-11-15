import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { record } from "./storage.ts";

export interface RexBlock {
  block_id: string;
  label: string;
  host_id: string;
}
export interface RexLayer {
  layer_id: string;
  kind: "floating" | "tiled";
  state?: string;
  blocks: RexBlock[];
}
export interface RexWindow {
  window_id: string;
  layers: RexLayer[];
}
export interface RexView {
  session_id: string;
  windows: RexWindow[];
}
export interface RexIdentity {
  instance: string;
  host: string;
}
export type RexCall = (
  method: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<unknown>;

/** Pin the inherited server. Never autostart, reconnect or fall back to another host. */
export function rexClient(pi: ExtensionAPI, server: string): RexCall {
  if (!server.startsWith("unix://"))
    throw new Error("Rex subagents currently require a local Unix-socket Rex server");
  return async (method, args, signal) => {
    const response = await pi.exec(
      "rex",
      ["--server", server, "--autostart=false", "api", "call", method, JSON.stringify(args)],
      { timeout: 15_000, signal },
    );
    if (response.code !== 0)
      throw new Error(response.stderr || response.stdout || `Rex ${method} failed`);
    return JSON.parse(response.stdout) as unknown;
  };
}

export async function identity(call: RexCall): Promise<RexIdentity> {
  const value = await call("server.status", {});
  if (
    !record(value) ||
    typeof value.instance_id !== "string" ||
    typeof value.host_id !== "string"
  ) {
    throw new Error("Rex did not report its server identity");
  }
  return { instance: value.instance_id, host: value.host_id };
}

export async function view(call: RexCall, session: string): Promise<RexView> {
  const value = await call("session.view", { session_id: session });
  if (!record(value) || value.session_id !== session || !Array.isArray(value.windows)) {
    throw new Error("Rex session view was incomplete");
  }
  return value as unknown as RexView;
}

export function placement(value: RexView, block: string) {
  for (const window of value.windows)
    for (const layer of window.layers) {
      const found = layer.blocks.find((candidate) => candidate.block_id === block);
      if (found) return { window, layer, block: found };
    }
  return undefined;
}
