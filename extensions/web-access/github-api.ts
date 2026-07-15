import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const GH_TIMEOUT_MS = 20_000;
const DEFAULT_ACCEPT = "application/vnd.github+json";

type GitHubOperation = "fetching" | "search";

interface GitHubApiOptions {
  accept?: string;
  operation?: GitHubOperation;
  signal?: AbortSignal;
}

export async function fetchGitHubApiJson(
  pi: ExtensionAPI,
  endpoint: string,
  options: GitHubApiOptions = {},
): Promise<unknown> {
  const operation = options.operation ?? "fetching";
  const result = await pi.exec("gh", [
    "api",
    "--hostname", "github.com",
    endpoint,
    "-H", `Accept: ${options.accept ?? DEFAULT_ACCEPT}`,
    "-H", "X-GitHub-Api-Version: 2022-11-28",
  ], { signal: options.signal, timeout: GH_TIMEOUT_MS });
  if (result.code !== 0) {
    const message = (result.stderr || result.stdout || "gh api failed").replace(/\s+/g, " ").trim().slice(0, 500);
    if (/\bENOENT\b|\bgh:\s*command not found\b|\bcommand not found:\s*gh\b/i.test(message)) {
      throw new Error(`GitHub ${operation} requires the gh CLI`);
    }
    const prefix = operation === "search" ? "GitHub search" : "GitHub";
    throw new Error(`${prefix} API request failed: ${message}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    const prefix = operation === "search" ? "GitHub search" : "GitHub";
    throw new Error(`${prefix} API returned invalid JSON`);
  }
}
