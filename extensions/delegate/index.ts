import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { sessionReferencePrompt } from "../copy-session/session-reference.ts";

/** Preserve the running Pi installation, including standalone and Node launchers. */
export function piCommand(executable: string, argv: string[]): string[] {
  if (/^node(?:\.exe)?$/.test(basename(executable))) {
    if (!argv[1] || !isAbsolute(argv[1]))
      throw new Error("Cannot identify the current Pi entry point.");
    return [executable, argv[1]];
  }
  return [executable];
}

export default function delegateExtension(pi: ExtensionAPI) {
  const env = { ...process.env };
  let opening = false;
  pi.registerCommand("delegate", {
    description:
      "Pick a project and new worktree, then start Pi with this session reference and your instructions",
    async handler(args, ctx) {
      if (!ctx.hasUI) return;
      if (opening) {
        ctx.ui.notify("The delegate picker is already opening.", "warning");
        return;
      }
      opening = true;
      try {
        const instruction = args.trim();
        if (!instruction) throw new Error("Usage: /delegate <instructions>");
        const file = ctx.sessionManager.getSessionFile();
        if (!file) throw new Error("Save this Pi session before delegating so Evaler can read it.");
        const session = env.REX_SESSION;
        const block = env.REX_BLOCK;
        if (!session || !block) throw new Error("Run /delegate inside Rex.");
        const picker = env.TOOLKIT_REX_PICKER || join(homedir(), ".config", "rex", "picker.py");
        if (!isAbsolute(picker) || !(await stat(picker)).isFile())
          throw new Error("Rex picker.py must be an existing absolute file path.");
        const exec = async (argv: string[]) => {
          const result = await pi.exec(
            "rex",
            [...(env.REX_SERVER ? ["--server", env.REX_SERVER] : []), "--autostart=false", ...argv],
            { timeout: 15_000 },
          );
          if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Rex failed");
          return JSON.parse(result.stdout);
        };
        const view = await exec(["session", "inspect", session, "--json"]);
        const window = view.windows?.find(
          (candidate: { layers?: Array<{ blocks?: Array<{ block_id: string }> }> }) =>
            candidate.layers?.some((layer) =>
              layer.blocks?.some((pane) => pane.block_id === block),
            ),
        );
        if (view.session_id !== session || !window)
          throw new Error("The calling Rex pane is no longer present.");
        // Never select a client based on whichever unrelated window currently has focus.
        let client = env.REX_CLIENT;
        if (!client) {
          const clients = await exec(["client", "ls", "--json"]);
          const matches = clients.clients?.filter(
            (candidate: { info?: { kind?: string }; session_ids?: string[] }) =>
              candidate.info?.kind === "app" && candidate.session_ids?.includes(session),
          );
          if (matches?.length !== 1)
            throw new Error(
              "Cannot uniquely identify the Rex app. Set REX_CLIENT before starting Pi.",
            );
          client = matches[0].client_id;
        }
        const prompt = sessionReferencePrompt(
          { file, id: ctx.sessionManager.getSessionId(), cwd: ctx.cwd },
          `After inspecting the source session, carry out these instructions in your new worktree:\n\n${instruction}`,
        );
        if (Buffer.byteLength(prompt) > 32_768)
          throw new Error("Delegation instructions are too long. Keep them under 32 KB.");
        const command = [...piCommand(process.execPath, process.argv), "--", prompt];
        await exec([
          "api",
          "call",
          "session.focus_block",
          JSON.stringify({ session_id: session, block_id: block }),
        ]);
        const directory = await mkdtemp(join(tmpdir(), "pi-delegate-"));
        const request = join(directory, "request.json");
        await writeFile(request, JSON.stringify({ picker, command }), { mode: 0o600 });
        const helper = fileURLToPath(new URL("./picker.py", import.meta.url));
        // Pin the app and origin, but let Rex set the new popup's REX_BLOCK.
        const environment = [
          `PATH=${env.PATH || ""}`,
          `REX_CLIENT=${client}`,
          `REX_PICKER_ORIGIN=${session}`,
          `REX_PICKER_ORIGIN_WINDOW=${window.window_id}`,
          ...(env.REX_SERVER ? [`REX_SERVER=${env.REX_SERVER}`] : []),
        ];
        try {
          const result = await exec([
            "api",
            "call",
            "session.new_layer",
            JSON.stringify({
              session_id: session,
              window_id: window.window_id,
              bounds: [0.1, 0.1, 0.8, 0.8],
              focus: true,
              layout: {
                block: {
                  flavor: "com.superlogical.terminal.shell",
                  label: "Delegate",
                  options: {
                    cwd: ctx.cwd,
                    shell: "none",
                    command: ["env", ...environment, "python3", "-B", helper, request],
                  },
                },
              },
            }),
          ]);
          if (!result.layer_id || !result.block_ids?.length)
            throw new Error("Rex returned an incomplete popup response");
        } catch (error) {
          throw new Error(
            `Delegate popup result is uncertain. Inspect Rex before retrying. Handoff file: ${request}. ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        ctx.ui.notify(
          "Delegate picker opened. Choose a project and branch, then confirm worktree setup and Pi launch there.",
          "info",
        );
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      } finally {
        opening = false;
      }
    },
  });
}
