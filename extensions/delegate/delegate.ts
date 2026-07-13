import { basename, isAbsolute } from "node:path";

export const DELEGATE_TOOL_NAME = "delegate_session";

export interface DelegationProposal {
  repository: string;
  handoff: string;
  branch?: string;
  base?: string;
  workspaceLabel?: string;
  useExistingCheckout?: boolean;
}

export interface CreatedWorkspace {
  workspaceId: string;
  paneId: string;
}

export interface WorktreeResult {
  path: string;
  branch?: string;
}

export function buildDelegatePrompt(goal: string, cwd: string): string {
  const requestedGoal = goal.trim() || "Infer the intended next task from the conversation. Ask me if it is ambiguous.";
  return `Prepare a delegation that I explicitly requested. Do not implement the delegated task in this session.

Goal:
${requestedGoal}

Use the conversation and, when useful, read-only repository inspection to identify the correct local destination repository. The current working directory is ${cwd}.

When the destination and task are clear, call ${DELEGATE_TOOL_NAME} exactly once with:
- an absolute path to the local destination repository
- a concise new branch name; a new Worktrunk worktree is the default
- an optional base branch only when the default branch is not appropriate
- a short workspace label
- a self-contained handoff covering the problem, material findings and evidence, decisions already made, relevant files or symbols, the exact next task, constraints, and useful validation

Set useExistingCheckout only when I explicitly asked not to create a worktree or a new worktree is clearly inappropriate. If destination, branch, or scope is materially uncertain, ask me before calling the tool. The tool will show me the final proposal before creating anything.`;
}

export function normalizeWorkspaceLabel(value: string | undefined, branch: string | undefined, repository: string): string {
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

export function detectPiCommand(execPath = process.execPath, argvEntry = process.argv[1]): string[] {
  const runtime = basename(execPath).toLowerCase();
  if ((runtime === "node" || runtime === "node.exe" || runtime === "bun") && argvEntry) {
    return [execPath, argvEntry];
  }
  return [execPath];
}

export function buildPiLaunchCommand(handoffFile: string, sessionName: string, command = detectPiCommand()): string {
  const prefix = command.map(shellQuote).join(" ");
  return `${prefix} --name ${shellQuote(sessionName)} ${shellQuote(`@${handoffFile}`)}`;
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

export function parseCreatedWorkspace(stdout: string): CreatedWorkspace {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Herdr returned invalid JSON while creating the workspace");
  }

  const result = (value as { result?: { workspace?: { workspace_id?: unknown }; root_pane?: { pane_id?: unknown } } }).result;
  const workspaceId = result?.workspace?.workspace_id;
  const paneId = result?.root_pane?.pane_id;
  if (typeof workspaceId !== "string" || typeof paneId !== "string") {
    throw new Error("Herdr workspace response did not include workspace and root pane IDs");
  }
  return { workspaceId, paneId };
}

export function paneStillBelongsToWorkspace(stdout: string, created: CreatedWorkspace): boolean {
  try {
    const value = JSON.parse(stdout) as {
      result?: { panes?: Array<{ pane_id?: unknown; workspace_id?: unknown }> };
    };
    return value.result?.panes?.some(pane =>
      pane.pane_id === created.paneId && pane.workspace_id === created.workspaceId
    ) ?? false;
  } catch {
    return false;
  }
}

export function validateProposal(proposal: DelegationProposal): void {
  if (!proposal.repository.trim() || !isAbsolute(proposal.repository)) {
    throw new Error("repository must be an absolute local path");
  }
  if (!proposal.handoff.trim()) throw new Error("handoff must not be empty");
  if (!proposal.useExistingCheckout && !proposal.branch?.trim()) {
    throw new Error("branch is required unless useExistingCheckout is true");
  }
  if (proposal.branch?.startsWith("-")) throw new Error("branch must not start with '-'");
}
