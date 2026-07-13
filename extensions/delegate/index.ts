import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  buildDelegatePrompt,
  buildPiLaunchCommand,
  buildWorktrunkArgs,
  DELEGATE_TOOL_NAME,
  detectPiCommand,
  normalizeWorkspaceLabel,
  paneStillBelongsToWorkspace,
  parseCreatedWorkspace,
  parseWorktreeResult,
  type DelegationProposal,
  validateProposal,
} from "./delegate.ts";

const DELEGATE_PARAMETERS = Type.Object({
  repository: Type.String({ description: "Absolute path to the local destination Git repository" }),
  branch: Type.Optional(Type.String({ description: "Concise branch name for the new worktree" })),
  base: Type.Optional(Type.String({ description: "Optional base branch; omit to use Worktrunk's default" })),
  workspaceLabel: Type.Optional(Type.String({ description: "Short semantic label for the Herdr workspace and Pi session" })),
  handoff: Type.String({ description: "Self-contained handoff prompt for the new Pi session" }),
  useExistingCheckout: Type.Optional(Type.Boolean({ description: "Use the destination checkout directly instead of creating a Worktrunk worktree" })),
});

function execFailure(command: string, stderr: string): Error {
  const detail = stderr.trim();
  return new Error(detail ? `${command} failed: ${detail}` : `${command} failed`);
}

async function checkExecutable(pi: ExtensionAPI, command: string): Promise<boolean> {
  try {
    const result = await pi.exec(command, ["--version"], { timeout: 5_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

async function writeHandoffFile(label: string, handoff: string): Promise<string> {
  const directory = join(getAgentDir(), "delegations");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "delegation";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `${timestamp}-${slug}-${randomUUID().slice(0, 8)}.md`);
  await writeFile(path, `${handoff.trim()}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return path;
}

export default function delegateExtension(
  pi: ExtensionAPI,
  dependencies: { piCommand?: string[] } = {},
) {
  const piCommand = dependencies.piCommand ?? detectPiCommand();
  let toolRegistered = false;
  let armed = false;
  let toolsBeforeDelegate: string[] | undefined;

  const disarm = (ctx: ExtensionContext) => {
    if (toolsBeforeDelegate) pi.setActiveTools(toolsBeforeDelegate);
    toolsBeforeDelegate = undefined;
    armed = false;
    ctx.ui.setStatus("delegate", undefined);
  };

  const registerDelegateTool = () => {
    if (toolRegistered) return;
    toolRegistered = true;

    pi.registerTool({
      name: DELEGATE_TOOL_NAME,
      label: "Delegate Session",
      description: "Create a confirmed Herdr workspace and launch a normal Pi session in a destination repository or new Worktrunk worktree. Available only after the user invokes /delegate.",
      promptSnippet: "Finish a user-requested cross-repository or cross-worktree handoff.",
      promptGuidelines: [
        "Call delegate_session only to complete the delegation explicitly armed by the user's /delegate command; resolve uncertainty with the user before calling it.",
      ],
      parameters: DELEGATE_PARAMETERS,
      async execute(_toolCallId, rawProposal, signal, onUpdate, ctx) {
        if (!armed) throw new Error("Delegation is not armed; the user must invoke /delegate first");

        const proposal: DelegationProposal = {
          repository: rawProposal.repository.trim(),
          branch: rawProposal.branch?.trim() || undefined,
          base: rawProposal.base?.trim() || undefined,
          workspaceLabel: rawProposal.workspaceLabel?.trim() || undefined,
          handoff: rawProposal.handoff,
          useExistingCheckout: rawProposal.useExistingCheckout === true,
        };

        let shouldDisarm = false;
        try {
          validateProposal(proposal);
          if (signal?.aborted) {
            shouldDisarm = true;
            throw new Error("Delegation cancelled");
          }

          onUpdate?.({ content: [{ type: "text", text: "Validating destination repository..." }] });
          const repoResult = await pi.exec("git", ["-C", proposal.repository, "rev-parse", "--show-toplevel"], {
            signal,
            timeout: 10_000,
          });
          if (repoResult.code !== 0) throw execFailure("git rev-parse", repoResult.stderr);
          const repository = repoResult.stdout.trim();
          if (!repository) throw new Error("Git did not return a repository root");

          if (!proposal.useExistingCheckout) {
            const branchResult = await pi.exec("git", ["check-ref-format", "--branch", proposal.branch!], {
              signal,
              timeout: 5_000,
            });
            if (branchResult.code !== 0) throw new Error(`Invalid branch name: ${proposal.branch}`);
          }

          const label = normalizeWorkspaceLabel(proposal.workspaceLabel, proposal.branch, repository);
          const editedHandoff = await ctx.ui.editor("Edit delegation handoff", proposal.handoff.trim());
          if (editedHandoff === undefined || !editedHandoff.trim()) {
            shouldDisarm = true;
            return {
              content: [{ type: "text", text: "Delegation cancelled before creating anything." }],
              details: { cancelled: true },
              terminate: true,
            };
          }

          const destinationSummary = proposal.useExistingCheckout
            ? `Existing checkout: ${repository}`
            : `New worktree: ${proposal.branch} (base: ${proposal.base ?? "repository default"})\nRepository: ${repository}`;
          const confirmed = await ctx.ui.confirm(
            "Create delegated Pi session?",
            `${destinationSummary}\nWorkspace: ${label}\n\nWorktrunk may run configured repository hooks. The workspace will remain unfocused.`,
          );
          if (!confirmed) {
            shouldDisarm = true;
            return {
              content: [{ type: "text", text: "Delegation cancelled before creating anything." }],
              details: { cancelled: true },
              terminate: true,
            };
          }

          onUpdate?.({ content: [{ type: "text", text: "Writing handoff..." }] });
          const handoffFile = await writeHandoffFile(label, editedHandoff);
          let destination = repository;
          if (!proposal.useExistingCheckout) {
            onUpdate?.({ content: [{ type: "text", text: "Creating Worktrunk worktree and running its start hooks..." }] });
            shouldDisarm = true;
            const worktreeResult = await pi.exec(
              "wt",
              buildWorktrunkArgs(repository, proposal.branch!, proposal.base),
              { signal, timeout: 300_000 },
            );
            if (worktreeResult.code !== 0) throw execFailure("wt switch --create", worktreeResult.stderr);
            destination = parseWorktreeResult(worktreeResult.stdout).path;
          }

          onUpdate?.({ content: [{ type: "text", text: "Creating Herdr workspace and starting Pi..." }] });
          shouldDisarm = true;
          const createResult = await pi.exec(
            "herdr",
            ["workspace", "create", "--cwd", destination, "--label", label, "--no-focus"],
            { signal, timeout: 10_000 },
          );
          if (createResult.code !== 0) throw execFailure("herdr workspace create", createResult.stderr);
          const workspace = parseCreatedWorkspace(createResult.stdout);

          // Herdr IDs are live identifiers. Re-list immediately before using the
          // returned pane so a concurrent close cannot redirect the launch.
          const panesResult = await pi.exec("herdr", ["pane", "list"], { signal, timeout: 10_000 });
          if (panesResult.code !== 0) throw execFailure("herdr pane list", panesResult.stderr);
          if (!paneStillBelongsToWorkspace(panesResult.stdout, workspace)) {
            throw new Error(`The new Herdr pane is no longer present. Handoff preserved at ${handoffFile}`);
          }

          const launchCommand = buildPiLaunchCommand(handoffFile, label, piCommand);
          const runResult = await pi.exec("herdr", ["pane", "run", workspace.paneId, launchCommand], {
            signal,
            timeout: 10_000,
          });
          if (runResult.code !== 0) {
            throw new Error(`Could not start Pi in Herdr workspace ${workspace.workspaceId}. Handoff preserved at ${handoffFile}: ${runResult.stderr.trim()}`);
          }

          ctx.ui.notify(`Delegated session starting in workspace “${label}”`, "info");
          return {
            content: [{
              type: "text",
              text: `Delegated session started in the non-focused Herdr workspace “${label}”. The handoff is preserved at ${handoffFile}.`,
            }],
            details: {
              workspaceId: workspace.workspaceId,
              paneId: workspace.paneId,
              repository,
              destination,
              branch: proposal.branch,
              handoffFile,
            },
            terminate: true,
          };
        } finally {
          if (shouldDisarm) disarm(ctx);
        }
      },
    });
  };

  pi.registerCommand("delegate", {
    description: "Hand work to a normal Pi session in another repo or worktree; use /delegate cancel to disarm",
    handler: async (args, ctx) => {
      const goal = args.trim();
      if (goal === "cancel") {
        if (armed) {
          if (!ctx.isIdle()) ctx.abort();
          disarm(ctx);
          ctx.ui.notify("Delegation cancelled", "info");
        } else {
          ctx.ui.notify("No delegation is active", "info");
        }
        return;
      }

      if (ctx.mode !== "tui") {
        ctx.ui.notify("delegate requires Pi interactive mode", "error");
        return;
      }
      if (process.env.HERDR_ENV !== "1") {
        ctx.ui.notify("delegate requires a Pi session running inside Herdr", "error");
        return;
      }

      await ctx.waitForIdle();
      if (armed) disarm(ctx);

      for (const command of ["herdr", "wt"]) {
        if (!await checkExecutable(pi, command)) {
          ctx.ui.notify(`delegate requires ${command} on PATH`, "error");
          return;
        }
      }

      toolsBeforeDelegate = pi.getActiveTools();
      registerDelegateTool();
      pi.setActiveTools([...new Set([...toolsBeforeDelegate, DELEGATE_TOOL_NAME])]);
      armed = true;
      ctx.ui.setStatus("delegate", "delegation armed");
      pi.sendUserMessage(buildDelegatePrompt(goal, ctx.cwd));
    },
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (armed) disarm(ctx);
  });
}
