import { basename, isAbsolute } from "node:path";

export const DELEGATE_TOOL_NAME = "delegate_session";

export type DelegateMode = "research" | "conversation";

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

export function parseDelegateRequest(value: string): { mode?: DelegateMode; goal: string } {
  const trimmed = value.trim();
  const match = /^(research|conversation)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return { goal: trimmed };
  return { mode: match[1] as DelegateMode, goal: match[2]?.trim() ?? "" };
}

export function latestAssistantText(entries: readonly unknown[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index] as {
      type?: unknown;
      message?: { role?: unknown; content?: unknown };
    };
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
    const content = entry.message.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (!Array.isArray(content)) continue;
    const text = content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" &&
          block !== null &&
          (block as { type?: unknown }).type === "text" &&
          typeof (block as { text?: unknown }).text === "string",
      )
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return undefined;
}

export function buildConversationContext(goal: string, priorAssistantResponse?: string): string {
  const requestedGoal =
    goal.trim() || "Continue the prior conversation in the destination repository.";
  const prior = priorAssistantResponse?.trim() || "No prior assistant response is available.";
  return `My request:
${requestedGoal}

Prior conversation:
${prior}`;
}

export function buildDelegatePrompt(
  mode: DelegateMode,
  goal: string,
  cwd: string,
  priorAssistantResponse?: string,
): string {
  const requestedGoal =
    goal.trim() ||
    (mode === "research"
      ? "Investigate the problem in the destination repository."
      : "Continue the prior conversation in the destination repository.");
  const shared = `Prepare the ${mode} delegation that I explicitly requested. Do not implement or research the delegated task in this session.

The current working directory is ${cwd}. Use the existing conversation to identify the destination repository. Inspect the filesystem or repository only when needed to resolve the destination or checkout choice, not to investigate the task itself.

Call ${DELEGATE_TOOL_NAME} exactly once with:
- an absolute path to the local destination repository
- a concise new branch name; a new Worktrunk worktree is the default
- an optional base branch only when the default branch is not appropriate
- a short semantic Pi session name
- delegation context in the format below

Set useExistingCheckout only when I explicitly asked not to create a worktree or a new worktree is clearly inappropriate. Ask me before calling the tool only if the destination or checkout choice is materially uncertain. The tool will show me the final context and proposal before creating anything.`;

  if (mode === "research") {
    return `${shared}

Use exactly this context structure:

Problem:
- State what capability is missing or what behavior is wrong.
- State why the destination repository owns the problem.

Task:
Investigate the problem independently. Do not ask for a specific implementation.

Starting sources:
- Include relevant local paths, documentation, issues, or upstream sources.

Observed evidence is optional. Include only concrete symptoms, errors, or reproductions.

Do not include a proposed implementation, inferred root cause, files or code to change, required design choices, source-agent acceptance criteria, version recommendations, research conclusions, or test and release plans. User-set requirements remain valid constraints.

Requested research:
${requestedGoal}`;
  }

  return `${shared}

Use this exact delegation context without summarizing or rewriting it:

${buildConversationContext(requestedGoal, priorAssistantResponse)}

The prior conversation is discussion context. Do not convert it into requirements, an implementation plan, or a research report.`;
}

export function buildDelegatedSessionPrompt(context: string, mode: DelegateMode): string {
  if (mode === "research") {
    return `This is an independent research request from another Pi session. Investigate the problem in this checkout. Do not treat the report as a proposed solution, and do not implement a change unless I ask later.

${context.trim()}`;
  }
  return `Continue this discussion with me. The prior response is conversation context, not an authoritative specification. Address my request above and ask me about unresolved intent when needed.

${context.trim()}`;
}

export function normalizeSessionName(
  value: string | undefined,
  branch: string | undefined,
  repository: string,
): string {
  const candidate = value?.trim() || branch?.trim() || basename(repository) || "delegated-work";
  const normalized = candidate
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    "worktree",
    "open",
    "--cwd",
    repository,
    "--path",
    path,
    "--label",
    branchLabel,
    "--no-focus",
    "--json",
  ];
}

export function detectPiCommand(
  execPath = process.execPath,
  argvEntry = process.argv[1],
): string[] {
  const runtime = basename(execPath).toLowerCase();
  if ((runtime === "node" || runtime === "node.exe" || runtime === "bun") && argvEntry) {
    return [execPath, argvEntry];
  }
  return [execPath];
}

export function buildPiLaunchCommand(
  contextFile: string,
  sessionName: string,
  command = detectPiCommand(),
): string {
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

  const result = (
    value as {
      result?: { workspace?: { workspace_id?: unknown }; root_pane?: { pane_id?: unknown } };
    }
  ).result;
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
    return (
      value.result?.panes?.some(
        (pane) => pane.pane_id === opened.paneId && pane.workspace_id === opened.workspaceId,
      ) ?? false
    );
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
