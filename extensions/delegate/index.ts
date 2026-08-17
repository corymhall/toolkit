import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  buildDelegatePrompt,
  buildDelegatedSessionPrompt,
  buildHerdrWorktreeOpenArgs,
  buildPiLaunchCommand,
  buildWorktrunkArgs,
  DELEGATE_TOOL_NAME,
  detectPiCommand,
  normalizeSessionName,
  paneStillBelongsToWorkspace,
  parseOpenedWorktree,
  parseWorktreeResult,
  type DelegationProposal,
  validateProposal,
} from "./delegate.ts";

const DELEGATE_PARAMETERS = Type.Object({
  repository: Type.String({ description: "Absolute path to the local destination Git repository" }),
  branch: Type.Optional(Type.String({ description: "Concise branch name for the new worktree" })),
  base: Type.Optional(Type.String({ description: "Optional base branch; omit to use Worktrunk's default" })),
  sessionName: Type.Optional(Type.String({ description: "Short semantic name for the delegated Pi session; Herdr labels the worktree with its branch" })),
  context: Type.String({ description: "Concise background from the current conversation for the delegated session to investigate independently" }),
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

async function writeContextFile(label: string, context: string): Promise<string> {
  const directory = join(getAgentDir(), "delegations");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "delegation";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `${timestamp}-${slug}-${randomUUID().slice(0, 8)}.md`);
  await writeFile(path, `${context.trim()}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
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
      description: "Open a confirmed checkout as a Herdr worktree and launch a normal Pi session there. Available only after the user invokes /delegate.",
      promptSnippet: "Transfer lightweight conversation context to a user-requested delegated session.",
      promptGuidelines: [
        "Call delegate_session only to complete the delegation explicitly armed by the user's /delegate command; ask the user only when the destination or checkout choice remains materially uncertain.",
      ],
      parameters: DELEGATE_PARAMETERS,
      async execute(_toolCallId, rawProposal, signal, onUpdate, ctx) {
        if (!armed) throw new Error("Delegation is not armed; the user must invoke /delegate first");

        const proposal: DelegationProposal = {
          repository: rawProposal.repository.trim(),
          branch: rawProposal.branch?.trim() || undefined,
          base: rawProposal.base?.trim() || undefined,
          sessionName: rawProposal.sessionName?.trim() || undefined,
          context: rawProposal.context,
          useExistingCheckout: rawProposal.useExistingCheckout === true,
        };

        let shouldDisarm = false;
        try {
          validateProposal(proposal);
          if (signal?.aborted) {
            shouldDisarm = true;
            throw new Error("Delegation cancelled");
          }

          onUpdate?.({
            content: [{ type: "text", text: "Validating destination repository..." }],
            details: {},
          });
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

          const sessionName = normalizeSessionName(proposal.sessionName, proposal.branch, repository);
          const delegatedPrompt = buildDelegatedSessionPrompt(proposal.context);
          const editedContext = await ctx.ui.editor("Edit delegation context", delegatedPrompt);
          if (editedContext === undefined || !editedContext.trim()) {
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
            `${destinationSummary}\nPi session: ${sessionName}\n\nWorktrunk may run configured repository hooks. The Herdr worktree will remain unfocused.`,
          );
          if (!confirmed) {
            shouldDisarm = true;
            return {
              content: [{ type: "text", text: "Delegation cancelled before creating anything." }],
              details: { cancelled: true },
              terminate: true,
            };
          }

          onUpdate?.({
            content: [{ type: "text", text: "Writing delegation context..." }],
            details: {},
          });
          const contextFile = await writeContextFile(sessionName, editedContext);
          shouldDisarm = true;
          let destination = repository;
          let worktreeLabel: string;
          if (!proposal.useExistingCheckout) {
            onUpdate?.({
              content: [{ type: "text", text: "Creating Worktrunk worktree and running its start hooks..." }],
              details: {},
            });
            const worktreeResult = await pi.exec(
              "wt",
              buildWorktrunkArgs(repository, proposal.branch!, proposal.base),
              { signal, timeout: 300_000 },
            );
            if (worktreeResult.code !== 0) throw execFailure("wt switch --create", worktreeResult.stderr);
            destination = parseWorktreeResult(worktreeResult.stdout).path;
            worktreeLabel = proposal.branch!;
          } else {
            const branchResult = await pi.exec("git", ["-C", repository, "branch", "--show-current"], {
              signal,
              timeout: 5_000,
            });
            if (branchResult.code !== 0) throw execFailure("git branch --show-current", branchResult.stderr);
            worktreeLabel = branchResult.stdout.trim() || sessionName;
          }

          onUpdate?.({
            content: [{ type: "text", text: "Opening Herdr worktree and starting Pi..." }],
            details: {},
          });
          const openResult = await pi.exec(
            "herdr",
            buildHerdrWorktreeOpenArgs(repository, destination, worktreeLabel),
            { signal, timeout: 10_000 },
          );
          if (openResult.code !== 0) throw execFailure("herdr worktree open", openResult.stderr);
          const workspace = parseOpenedWorktree(openResult.stdout);

          // Herdr IDs are live identifiers. Re-list immediately before using the
          // returned pane so a concurrent close cannot redirect the launch.
          const panesResult = await pi.exec("herdr", ["pane", "list"], { signal, timeout: 10_000 });
          if (panesResult.code !== 0) throw execFailure("herdr pane list", panesResult.stderr);
          if (!paneStillBelongsToWorkspace(panesResult.stdout, workspace)) {
            throw new Error(`The new Herdr pane is no longer present. Context preserved at ${contextFile}`);
          }

          const launchCommand = buildPiLaunchCommand(contextFile, sessionName, piCommand);
          const runResult = await pi.exec("herdr", ["pane", "run", workspace.paneId, launchCommand], {
            signal,
            timeout: 10_000,
          });
          if (runResult.code !== 0) {
            throw new Error(`Could not start Pi in Herdr workspace ${workspace.workspaceId}. Context preserved at ${contextFile}: ${runResult.stderr.trim()}`);
          }

          ctx.ui.notify(`Delegated session “${sessionName}” starting in Herdr worktree “${worktreeLabel}”`, "info");
          return {
            content: [{
              type: "text",
              text: `Delegated session “${sessionName}” started in the non-focused Herdr worktree “${worktreeLabel}”. The context is preserved at ${contextFile}.`,
            }],
            details: {
              workspaceId: workspace.workspaceId,
              paneId: workspace.paneId,
              repository,
              destination,
              branch: worktreeLabel,
              contextFile,
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
    description: "Start a normal Pi session in another repo or worktree with conversation context; use /delegate cancel to disarm",
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
