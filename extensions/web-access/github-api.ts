import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const GH_TIMEOUT_MS = 20_000;
const DEFAULT_ACCEPT = "application/vnd.github+json";
export const MAX_GITHUB_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;

type GitHubOperation = "fetching" | "search";

export interface GitHubApiOptions {
  accept?: string;
  maxBytes?: number;
  operation?: GitHubOperation;
  signal?: AbortSignal;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
  exceededLimit?: boolean;
}

function ghArgs(endpoint: string, accept: string): string[] {
  return [
    "api",
    "--hostname",
    "github.com",
    endpoint,
    "-H",
    `Accept: ${accept}`,
    "-H",
    "X-GitHub-Api-Version: 2022-11-28",
  ];
}

export async function execBoundedCommand(
  command: string,
  args: string[],
  maxBytes: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killed = false;
    let exceededLimit = false;
    let spawnError = "";

    const kill = () => {
      if (killed) return;
      killed = true;
      child.kill("SIGTERM");
    };
    const timeout = setTimeout(kill, GH_TIMEOUT_MS);
    const abort = () => kill();
    signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (value: Buffer) => {
      if (exceededLimit) return;
      stdoutBytes += value.byteLength;
      if (stdoutBytes > maxBytes) {
        exceededLimit = true;
        kill();
        return;
      }
      stdout.push(value);
    });
    child.stderr.on("data", (value: Buffer) => {
      if (stderrBytes >= MAX_ERROR_BYTES) return;
      const remaining = MAX_ERROR_BYTES - stderrBytes;
      const chunk = value.subarray(0, remaining);
      stderrBytes += chunk.byteLength;
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      spawnError = error instanceof Error ? error.message : String(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: spawnError || Buffer.concat(stderr).toString("utf8"),
        code: code ?? 1,
        killed,
        exceededLimit,
      });
    });
  });
}

export type GitHubTextFetcher = typeof fetchGitHubApiText;

export async function fetchGitHubApiText(
  pi: ExtensionAPI,
  endpoint: string,
  options: GitHubApiOptions = {},
): Promise<string> {
  const operation = options.operation ?? "fetching";
  const args = ghArgs(endpoint, options.accept ?? DEFAULT_ACCEPT);
  const result = options.maxBytes
    ? await execBoundedCommand("gh", args, options.maxBytes, options.signal)
    : await pi.exec("gh", args, { signal: options.signal, timeout: GH_TIMEOUT_MS });
  if ("exceededLimit" in result && result.exceededLimit) {
    throw new Error(
      `GitHub API response exceeds the ${Math.round(options.maxBytes! / 1024 / 1024)}MB limit`,
    );
  }
  if (result.code !== 0) {
    const message = (result.stderr || result.stdout || "gh api failed")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    if (/\bENOENT\b|\bgh:\s*command not found\b|\bcommand not found:\s*gh\b/i.test(message)) {
      throw new Error(`GitHub ${operation} requires the gh CLI`);
    }
    const prefix = operation === "search" ? "GitHub search" : "GitHub";
    throw new Error(`${prefix} API request failed: ${message}`);
  }
  return result.stdout;
}

export async function fetchGitHubApiJson(
  pi: ExtensionAPI,
  endpoint: string,
  options: GitHubApiOptions = {},
): Promise<unknown> {
  const operation = options.operation ?? "fetching";
  const stdout = await fetchGitHubApiText(pi, endpoint, options);
  try {
    return JSON.parse(stdout);
  } catch {
    const prefix = operation === "search" ? "GitHub search" : "GitHub";
    throw new Error(`${prefix} API returned invalid JSON`);
  }
}
