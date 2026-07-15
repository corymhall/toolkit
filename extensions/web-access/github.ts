import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fetchGitHubApiJson } from "./github-api.ts";
import type { FetchedContent } from "./types.ts";

const MAX_FILE_BYTES = 1_000_000;
const MAX_LIST_ENTRIES = 200;

export interface GitHubUrl {
  owner: string;
  repo: string;
  kind: "repo" | "blob" | "tree";
  ref?: string;
  path?: string;
}

const OWNER_REPO = /^[A-Za-z0-9_.-]+$/;

export function parseGitHubUrl(raw: string): GitHubUrl | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
  if (url.username || url.password || url.port) return null;
  const parts = url.pathname.split("/").filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  if (!OWNER_REPO.test(owner) || !OWNER_REPO.test(repo)) return null;
  if (parts.length === 2) return { owner, repo, kind: "repo" };
  const kind = parts[2];
  if ((kind !== "blob" && kind !== "tree") || parts.length < 4) return null;
  const ref = parts[3];
  const path = parts.slice(4).join("/");
  return { owner, repo, kind, ref, path };
}

function endpointPath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function decodeFile(record: Record<string, unknown>): string {
  const size = typeof record.size === "number" ? record.size : 0;
  if (size > MAX_FILE_BYTES) throw new Error(`GitHub file is too large (${size} bytes; limit ${MAX_FILE_BYTES})`);
  if (record.type !== "file") throw new Error(`GitHub path is not a regular file (type: ${String(record.type)})`);
  if (record.encoding !== "base64" || typeof record.content !== "string") {
    throw new Error("GitHub did not return inline file content; the file may exceed the API limit");
  }
  const decoded = Buffer.from(record.content.replace(/\n/g, ""), "base64");
  if (decoded.byteLength > MAX_FILE_BYTES) {
    throw new Error(`GitHub file is too large (${decoded.byteLength} bytes; limit ${MAX_FILE_BYTES})`);
  }
  return decoded.toString("utf8");
}

function listing(value: unknown): { content: string; truncated: boolean } {
  if (!Array.isArray(value)) throw new Error("GitHub path is not a directory");
  const entries = value.slice(0, MAX_LIST_ENTRIES).map(item => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const suffix = record.type === "dir" ? "/" : "";
    const size = typeof record.size === "number" && record.type === "file" ? ` (${record.size} bytes)` : "";
    return `${String(record.path ?? record.name ?? "unknown")}${suffix}${size}`;
  });
  const truncated = value.length > MAX_LIST_ENTRIES;
  if (truncated) entries.push(`... (${value.length - MAX_LIST_ENTRIES} more entries)`);
  return { content: entries.join("\n"), truncated };
}

async function fetchReadme(pi: ExtensionAPI, owner: string, repo: string, ref: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const value = await fetchGitHubApiJson(pi, `repos/${owner}/${repo}/readme?ref=${encodeURIComponent(ref)}`, { signal });
    if (!value || typeof value !== "object") return null;
    return decodeFile(value as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\b404\b|not found/i.test(message)) return null;
    throw error;
  }
}

export async function fetchGitHubContent(raw: string, pi: ExtensionAPI, signal?: AbortSignal): Promise<FetchedContent | null> {
  const parsed = parseGitHubUrl(raw);
  if (!parsed) return null;
  const { owner, repo } = parsed;
  const metadata = await fetchGitHubApiJson(pi, `repos/${owner}/${repo}`, { signal });
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("GitHub repository response was invalid");
  const record = metadata as Record<string, unknown>;

  if (parsed.kind === "blob") {
    if (!parsed.path) throw new Error("GitHub blob URL does not contain a file path");
    const endpoint = `repos/${owner}/${repo}/contents/${endpointPath(parsed.path)}?ref=${encodeURIComponent(parsed.ref!)}`;
    const value = await fetchGitHubApiJson(pi, endpoint, { signal });
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GitHub file response was invalid");
    return { url: raw, title: `${owner}/${repo}: ${parsed.path}`, content: decodeFile(value as Record<string, unknown>), truncated: false };
  }

  if (parsed.kind === "tree") {
    const suffix = parsed.path ? `/${endpointPath(parsed.path)}` : "";
    const endpoint = `repos/${owner}/${repo}/contents${suffix}?ref=${encodeURIComponent(parsed.ref!)}`;
    const value = await fetchGitHubApiJson(pi, endpoint, { signal });
    const directory = listing(value);
    return { url: raw, title: `${owner}/${repo}: ${parsed.path || "/"}`, content: directory.content, truncated: directory.truncated };
  }

  const defaultBranch = typeof record.default_branch === "string" ? record.default_branch : "HEAD";
  const [root, readme] = await Promise.all([
    fetchGitHubApiJson(pi, `repos/${owner}/${repo}/contents?ref=${encodeURIComponent(defaultBranch)}`, { signal }),
    fetchReadme(pi, owner, repo, defaultBranch, signal),
  ]);
  const rootListing = listing(root);
  const sections = [`## Repository root\n\n${rootListing.content}`];
  if (readme) sections.push(`## README\n\n${readme}`);
  return {
    url: raw,
    title: typeof record.full_name === "string" ? record.full_name : `${owner}/${repo}`,
    content: sections.join("\n\n"),
    truncated: rootListing.truncated,
  };
}
