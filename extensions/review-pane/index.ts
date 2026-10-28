import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface Target {
  id: string;
  harness: string;
  rex_session: string;
  rex_block: string;
}

// Match the calling pane, not another agent working in the same repository.
export function selectTarget(targets: Target[], session: string, block: string): string {
  const matches = targets.filter(
    (target) =>
      target.harness === "pi" && target.rex_session === session && target.rex_block === block,
  );
  if (matches.length !== 1)
    throw new Error("Could not uniquely identify this Pi agent in Commentry.");
  return matches[0]!.id;
}

// This value becomes a Neovim Ex command. Reject command separators and options,
// even though the outer process is launched with structured arguments.
export function diffCommand(base?: string): string {
  if (
    base !== undefined &&
    (!base || !/^[a-zA-Z0-9_./~^@{}+-]+$/.test(base) || base.startsWith("-"))
  )
    throw new Error("Use a Git revision or revision range without whitespace or options.");
  return base ? `DiffviewOpen ${base}` : "DiffviewOpen";
}

export default function reviewPane(pi: ExtensionAPI) {
  const env = { ...process.env };
  let queue = Promise.resolve();

  const open = async (base: string | undefined, ctx: ExtensionContext, signal?: AbortSignal) => {
    const command = diffCommand(base);
    const session = env.REX_SESSION;
    const block = env.REX_BLOCK;
    if (!session || !block) throw new Error("Open Pi inside Rex to use the review pane.");
    if (!ctx.hasUI) throw new Error("Opening a review pane requires an interactive confirmation.");
    const exec = async (program: string, args: string[]) => {
      const result = await pi.exec(program, args, { cwd: ctx.cwd, signal, timeout: 15_000 });
      if (result.code !== 0)
        throw new Error(`${program} failed: ${result.stderr || result.stdout || result.code}`);
      return result.stdout;
    };
    const rexExec = (args: string[]) => {
      const prefix = env.REX_SERVER ? ["--server", env.REX_SERVER] : [];
      return exec("rex", [...prefix, "--autostart=false", ...args]);
    };
    const rex = async (args: string[]) => JSON.parse(await rexExec(args));
    const inspect = async () => {
      const view = await rex(["session", "inspect", session, "--json"]);
      if (view.session_id !== session || !Array.isArray(view.windows))
        throw new Error("Rex returned an incomplete session view.");
      const blocks: Array<{ block_id: string; label: string }> = view.windows.flatMap(
        (window: { layers?: Array<{ blocks?: Array<{ block_id: string; label: string }> }> }) =>
          (window.layers ?? []).flatMap((layer) => layer.blocks ?? []),
      );
      if (!blocks.some((entry) => entry.block_id === block))
        throw new Error("The Pi pane is no longer present.");
      return blocks;
    };
    const label = `pi-review-${createHash("sha256")
      .update(JSON.stringify([block, ctx.sessionManager.getSessionId(), ctx.cwd, base ?? ""]))
      .digest("hex")
      .slice(0, 20)}`;
    await inspect();
    const discovery = JSON.parse(await exec("commentry", ["agent", "--project", ctx.cwd, "list"]));
    if (discovery.ok !== true || !Array.isArray(discovery.result?.sessions))
      throw new Error(`Commentry discovery failed: ${JSON.stringify(discovery)}`);
    const target = selectTarget(discovery.result.sessions, session, block);
    if (
      !(await ctx.ui.confirm(
        "Open review pane?",
        "Start or focus Neovim beside this chat and attach Commentry to this agent. Attaching may deliver pending comments.",
      ))
    )
      throw new Error("Review pane cancelled.");
    // Check dependencies before changing the layout or Commentry selection.
    await exec("nvim", ["--version"]);
    const attached = JSON.parse(
      await exec("commentry", ["agent", "--project", ctx.cwd, "attach", target]),
    );
    if (attached.ok !== true)
      throw new Error(`Commentry attachment failed: ${JSON.stringify(attached)}`);
    if (attached.result?.delivery_error)
      throw new Error(
        `Commentry attached, but pending comment delivery failed: ${attached.result.delivery_error}. Inspect Commentry before retrying.`,
      );
    const blocks = await inspect();
    const existing = blocks.filter((entry) => entry.label === label);
    if (existing.length > 1)
      throw new Error("Multiple matching review panes exist. Inspect Rex before retrying.");
    if (existing[0]) {
      await rexExec(["focus", "-s", session, existing[0].block_id]);
      return `Focused review pane ${existing[0].block_id}. Commentry is attached. The existing editor view was preserved.`;
    }
    // A deterministic label allows recovery after a lost split response.
    const created = await rex([
      "split",
      "-s",
      session,
      "-b",
      block,
      "--split=right",
      "--ratio",
      "60",
      "-c",
      ctx.cwd,
      "--label",
      label,
      "--json",
      "--",
      "nvim",
      "-c",
      command,
    ]);
    const pane = created.block_ids?.[0];
    if (typeof pane !== "string" || pane === block)
      throw new Error("Rex did not return a review pane ID. Inspect Rex before retrying.");
    if (!(await inspect()).some((entry) => entry.block_id === pane))
      throw new Error("The review pane closed during startup.");
    return `Opened review pane ${pane} with ${command}. Commentry is attached to this agent. Neovim startup was submitted; plugin readiness is not verified.`;
  };

  const serializedOpen = (
    base: string | undefined,
    ctx: ExtensionContext,
    signal?: AbortSignal,
  ) => {
    const result = queue.then(() => open(base, ctx, signal));
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  pi.registerTool({
    name: "open_review",
    label: "Open Review",
    description:
      "Open or focus a Rex pane to the right of this chat with Neovim Diffview and attach Commentry to this exact Pi agent. Use only when the user asks to open their review pane, after completing the requested work. Requires confirmation. Attaching can deliver pending comments.",
    parameters: Type.Object({
      base: Type.Optional(
        Type.String({
          description:
            "Optional Git revision or range for Diffview. Omit for working-tree changes.",
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      return {
        content: [{ type: "text", text: await serializedOpen(params.base, ctx, signal) }],
        details: undefined,
      };
    },
  });
  pi.registerCommand("review", {
    description:
      "Open Neovim Diffview beside this chat and attach Commentry. Optional Git revision or range.",
    async handler(args, ctx) {
      try {
        ctx.ui.notify(await serializedOpen(args.trim() || undefined, ctx), "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
