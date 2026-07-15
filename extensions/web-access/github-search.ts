import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fetchGitHubApiJson } from "./github-api.ts";
import type { FetchedContent } from "./types.ts";

const MAX_CODE_FRAGMENTS = 3;
const MAX_FRAGMENT_LENGTH = 500;
const OWNER = /^[A-Za-z0-9_.-]+$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SCOPE_QUALIFIER = /\b(?:org|repo|user):/i;

export type GitHubSearchKind = "issues" | "pull_requests" | "code";

export interface GitHubSearchOptions {
  kind: GitHubSearchKind;
  query: string;
  repos?: string[];
  owners?: string[];
  state?: "open" | "closed";
  labels?: string[];
  language?: string;
  path?: string;
  limit?: number;
}

export interface GitHubSearchDetails {
  kind: GitHubSearchKind;
  query: string;
  resultCount: number;
  totalCount: number;
  incompleteResults: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function qualifier(name: string, value: string): string {
  return `${name}:${JSON.stringify(value)}`;
}

function validate(options: GitHubSearchOptions): void {
  if (!options.query.trim()) throw new Error("GitHub search query must not be empty");
  if (SCOPE_QUALIFIER.test(options.query)) {
    throw new Error("Put repo:, org:, and user: scope in the repos or owners fields instead of the GitHub search query");
  }
  for (const repo of options.repos ?? []) {
    if (!REPOSITORY.test(repo)) throw new Error(`Invalid GitHub repository scope: ${repo}`);
  }
  for (const owner of options.owners ?? []) {
    if (!OWNER.test(owner)) throw new Error(`Invalid GitHub owner scope: ${owner}`);
  }
  if (options.kind === "code" && (options.state || options.labels?.length)) {
    throw new Error("GitHub code search does not support state or labels filters");
  }
  if (options.kind !== "code" && options.path) throw new Error("The GitHub path filter is only valid for code search");
}

export function buildGitHubSearchQuery(options: GitHubSearchOptions): string {
  validate(options);
  const parts = [options.query.trim()];
  if (options.kind === "issues") parts.push("is:issue");
  if (options.kind === "pull_requests") parts.push("is:pr");
  for (const repo of options.repos ?? []) parts.push(qualifier("repo", repo));
  for (const owner of options.owners ?? []) parts.push(qualifier("user", owner));
  if (options.state) parts.push(`state:${options.state}`);
  for (const label of options.labels ?? []) parts.push(qualifier("label", label));
  if (options.language) parts.push(qualifier("language", options.language));
  if (options.path) parts.push(qualifier("path", options.path));
  return parts.join(" ");
}

function repositoryName(item: Record<string, unknown>): string | undefined {
  const repository = record(item.repository);
  const fullName = string(repository?.full_name);
  if (fullName) return fullName;
  const repositoryUrl = string(item.repository_url);
  return repositoryUrl?.match(/\/repos\/([^/]+\/[^/]+)$/)?.[1];
}

function labels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const name = string(record(item)?.name);
    return name ? [name] : [];
  });
}

function normalizeIssue(item: Record<string, unknown>): Record<string, unknown> {
  return {
    repository: repositoryName(item),
    number: typeof item.number === "number" ? item.number : undefined,
    title: string(item.title),
    state: string(item.state),
    labels: labels(item.labels),
    author: string(record(item.user)?.login),
    createdAt: string(item.created_at),
    updatedAt: string(item.updated_at),
    closedAt: string(item.closed_at),
    url: string(item.html_url),
  };
}

function codeFragments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const fragment = string(record(item)?.fragment)?.replace(/\r/g, "").trim();
    return fragment ? [fragment.slice(0, MAX_FRAGMENT_LENGTH)] : [];
  }).slice(0, MAX_CODE_FRAGMENTS);
}

function normalizeCode(item: Record<string, unknown>): Record<string, unknown> {
  return {
    repository: repositoryName(item),
    path: string(item.path),
    sha: string(item.sha),
    url: string(item.html_url),
    fragments: codeFragments(item.text_matches),
  };
}

export async function searchGitHub(
  pi: ExtensionAPI,
  options: GitHubSearchOptions,
  signal?: AbortSignal,
): Promise<{ fetched: FetchedContent; details: GitHubSearchDetails }> {
  const query = buildGitHubSearchQuery(options);
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 30), 1), 100);
  const resource = options.kind === "code" ? "code" : "issues";
  const endpoint = `search/${resource}?q=${encodeURIComponent(query)}&per_page=${limit}`;
  const value = record(await fetchGitHubApiJson(pi, endpoint, {
    accept: "application/vnd.github.text-match+json",
    operation: "search",
    signal,
  }));
  if (!value || !Array.isArray(value.items)) throw new Error("GitHub search API response was invalid");

  const results = value.items.flatMap(item => {
    const entry = record(item);
    return entry ? [options.kind === "code" ? normalizeCode(entry) : normalizeIssue(entry)] : [];
  });
  const totalCount = typeof value.total_count === "number" ? value.total_count : results.length;
  const incompleteResults = value.incomplete_results === true;
  const content = JSON.stringify({ totalCount, returnedCount: results.length, incompleteResults, results }, null, 2);
  const url = `https://github.com/search?q=${encodeURIComponent(query)}`;
  return {
    fetched: {
      url,
      title: `GitHub ${options.kind.replace("_", " ")} search: ${options.query.trim()}`,
      content,
      truncated: false,
    },
    details: {
      kind: options.kind,
      query,
      resultCount: results.length,
      totalCount,
      incompleteResults,
    },
  };
}
