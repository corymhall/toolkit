import { basename, isAbsolute } from "node:path";

export const DELEGATE_TOOL_NAME = "delegate_session";

export interface DelegationProposal {
  repository: string;
  context: string;
  branch?: string;
  base?: string;
  sessionName?: string;
  useExistingCheckout?: boolean;
}

export interface OpenedWorktree {
  workspaceId: string;
  paneId: string;
}

export interface WorktreeResult {
  path: string;
  branch?: string;
}

export function buildDelegatePrompt(goal: string, cwd: string): string {
  const requestedGoal = goal.trim() || "Capture the relevant context from this conversation for another session.";
  return `Prepare the lightweight delegation that I explicitly requested. Do not implement or research the delegated task in this session.

Goal:
${requestedGoal}

Use the existing conversation to identify the destination repository and capture what the other session should know. The current working directory is ${cwd}. Inspect the filesystem or repository only when needed to resolve the destination or checkout choice, not to investigate the task itself.

Call ${DELEGATE_TOOL_NAME} exactly once with:
- an absolute path to the local destination repository
- a concise new branch name; a new Worktrunk worktree is the default
- an optional base branch only when the default branch is not appropriate
- a short semantic Pi session name
- concise context from this conversation: the user's goal, relevant background or pointers already surfaced, and any open questions or uncertainty

The context is background for independent investigation, not a specification. Do not turn it into an implementation plan, prescribe a solution, add speculative requirements, or add research and validation steps that were not already part of the conversation.

Set useExistingCheckout only when I explicitly asked not to create a worktree or a new worktree is clearly inappropriate. Ask me before calling the tool only if the destination or checkout choice is materially uncertain. The tool will show me the final context and proposal before creating anything.`;
}

export function buildDelegatedSessionPrompt(context: string): string {
  return `Here is context generated from another Pi session. Treat it as background, not as a specification or settled implementation plan. Please look into the request independently, verify relevant details in this checkout, and ask me about unresolved intent when needed.

${context.trim()}`;
}

export function normalizeSessionName(value: string | undefined, branch: string | undefined, repository: string): string {
  const candidate = value?.trim() || branch?.trim() || basename(repository) || "delegated-work";
  const normalized = candidate.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return (normalized || "delegated-work").slice(0, 80);
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildWorktrunkArgs(repository: string, branch: string, base?: string): string[] {
  const args = ["-C", repository, "switch", "--create", branch];
  if (base) args.push("--base", base);
  args.push("--no-cd", "--format", "json");
  return args;
}

export function buildHerdrWorktreeOpenArgs(
  repository: string,
  path: string,
  branchLabel: string,
): string[] {
  return [
    "worktree", "open",
    "--cwd", repository,
    "--path", path,
    "--label", branchLabel,
    "--no-focus",
    "--json",
  ];
}

export function detectPiCommand(execPath = process.execPath, argvEntry = process.argv[1]): string[] {
  const runtime = basename(execPath).toLowerCase();
  if ((runtime === "node" || runtime === "node.exe" || runtime === "bun") && argvEntry) {
    return [execPath, argvEntry];
  }
  return [execPath];
}

export function buildPiLaunchCommand(contextFile: string, sessionName: string, command = detectPiCommand()): string {
  const prefix = command.map(shellQuote).join(" ");
  return `${prefix} --name ${shellQuote(sessionName)} ${shellQuote(`@${contextFile}`)}`;
}

export function parseWorktreeResult(stdout: string): WorktreeResult {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Worktrunk returned invalid JSON after creating the worktree");
  }
  const result = value as { path?: unknown; branch?: unknown };
  if (typeof result.path !== "string" || !isAbsolute(result.path)) {
    throw new Error("Worktrunk response did not include an absolute worktree path");
  }
  return {
    path: result.path,
    branch: typeof result.branch === "string" ? result.branch : undefined,
  };
}

export function parseOpenedWorktree(stdout: string): OpenedWorktree {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Herdr returned invalid JSON while opening the worktree");
  }

  const result = (value as { result?: { workspace?: { workspace_id?: unknown }; root_pane?: { pane_id?: unknown } } }).result;
  const workspaceId = result?.workspace?.workspace_id;
  const paneId = result?.root_pane?.pane_id;
  if (typeof workspaceId !== "string" || typeof paneId !== "string") {
    throw new Error("Herdr worktree response did not include workspace and root pane IDs");
  }
  return { workspaceId, paneId };
}

export function paneStillBelongsToWorkspace(stdout: string, opened: OpenedWorktree): boolean {
  try {
    const value = JSON.parse(stdout) as {
      result?: { panes?: Array<{ pane_id?: unknown; workspace_id?: unknown }> };
    };
    return value.result?.panes?.some(pane =>
      pane.pane_id === opened.paneId && pane.workspace_id === opened.workspaceId
    ) ?? false;
  } catch {
    return false;
  }
}

export function validateProposal(proposal: DelegationProposal): void {
  if (!proposal.repository.trim() || !isAbsolute(proposal.repository)) {
    throw new Error("repository must be an absolute local path");
  }
  if (!proposal.context.trim()) throw new Error("context must not be empty");
  if (!proposal.useExistingCheckout && !proposal.branch?.trim()) {
    throw new Error("branch is required unless useExistingCheckout is true");
  }
  if (proposal.branch?.startsWith("-")) throw new Error("branch must not start with '-'");
}
