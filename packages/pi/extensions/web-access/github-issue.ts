import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fetchGitHubApiJson } from "./github-api.ts";
import {
  githubInteger,
  githubRecord,
  githubString,
  normalizeGitHubIssueComment,
  normalizeGitHubLabels,
  normalizeGitHubReactions,
  normalizeGitHubUser,
  normalizeGitHubUsers,
} from "./github-normalize.ts";
import type { FetchedContent } from "./types.ts";

const OWNER_REPO = /^[A-Za-z0-9_.-]+$/;

export type GitHubIssueView = "summary" | "comments" | "all";

export interface GitHubIssueOptions {
  owner: string;
  repo: string;
  number: number;
  view?: GitHubIssueView;
  limit?: number;
}

export interface GitHubIssueDetails {
  owner: string;
  repo: string;
  number: number;
  view: GitHubIssueView;
  commentCount: number;
  returnedComments: number;
}

function normalizeIssue(issue: Record<string, unknown>): Record<string, unknown> {
  const milestone = githubRecord(issue.milestone);
  const pullRequest = githubRecord(issue.pull_request);
  const issueType = githubRecord(issue.type);
  return {
    number: githubInteger(issue.number),
    type: pullRequest ? "pull_request" : "issue",
    issueType: githubString(issueType?.name),
    title: githubString(issue.title),
    body: githubString(issue.body),
    state: githubString(issue.state),
    stateReason: githubString(issue.state_reason),
    draft: issue.draft === true,
    locked: issue.locked === true,
    author: normalizeGitHubUser(issue.user),
    authorAssociation: githubString(issue.author_association),
    labels: normalizeGitHubLabels(issue.labels),
    assignees: normalizeGitHubUsers(issue.assignees),
    milestone: milestone
      ? {
          number: githubInteger(milestone.number),
          title: githubString(milestone.title),
          state: githubString(milestone.state),
          dueOn: githubString(milestone.due_on),
          url: githubString(milestone.html_url),
        }
      : undefined,
    commentCount: githubInteger(issue.comments) ?? 0,
    reactions: normalizeGitHubReactions(issue.reactions),
    createdAt: githubString(issue.created_at),
    updatedAt: githubString(issue.updated_at),
    closedAt: githubString(issue.closed_at),
    closedBy: normalizeGitHubUser(issue.closed_by),
    url: githubString(issue.html_url),
    pullRequest: pullRequest
      ? {
          url: githubString(pullRequest.html_url),
          diffUrl: githubString(pullRequest.diff_url),
          patchUrl: githubString(pullRequest.patch_url),
        }
      : undefined,
  };
}

function validate(options: GitHubIssueOptions): void {
  if (!OWNER_REPO.test(options.owner)) throw new Error(`Invalid GitHub owner: ${options.owner}`);
  if (!OWNER_REPO.test(options.repo)) throw new Error(`Invalid GitHub repository: ${options.repo}`);
  if (!Number.isSafeInteger(options.number) || options.number < 1) {
    throw new Error(`Invalid GitHub issue number: ${options.number}`);
  }
}

/** Read and normalize one issue and, when requested, its first bounded comment page. */
export async function fetchGitHubIssue(
  pi: ExtensionAPI,
  options: GitHubIssueOptions,
  signal?: AbortSignal,
): Promise<{ fetched: FetchedContent; details: GitHubIssueDetails }> {
  validate(options);
  const view = options.view ?? "summary";
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 30), 1), 100);
  const base = `repos/${options.owner}/${options.repo}/issues/${options.number}`;
  const issueValue = githubRecord(await fetchGitHubApiJson(pi, base, { signal }));
  if (!issueValue) throw new Error("GitHub issue API response was invalid");

  let comments: Record<string, unknown>[] = [];
  if (view !== "summary") {
    const commentsValue = await fetchGitHubApiJson(pi, `${base}/comments?per_page=${limit}`, {
      signal,
    });
    if (!Array.isArray(commentsValue))
      throw new Error("GitHub issue comments response was invalid");
    comments = commentsValue.flatMap((value) => {
      const entry = githubRecord(value);
      return entry ? [normalizeGitHubIssueComment(entry)] : [];
    });
  }

  const issue = normalizeIssue(issueValue);
  const commentCount = githubInteger(issueValue.comments) ?? comments.length;
  const content =
    view === "comments"
      ? { comments, totalComments: commentCount, returnedComments: comments.length }
      : view === "all"
        ? { issue, comments, totalComments: commentCount, returnedComments: comments.length }
        : { issue };
  const url =
    githubString(issueValue.html_url) ??
    `https://github.com/${options.owner}/${options.repo}/issues/${options.number}`;
  const title =
    githubString(issueValue.title) ?? `${options.owner}/${options.repo} issue #${options.number}`;

  return {
    fetched: {
      url,
      title: `${options.owner}/${options.repo}#${options.number}: ${title}`,
      content: JSON.stringify(content, null, 2),
      truncated: view !== "summary" && comments.length < commentCount,
    },
    details: {
      owner: options.owner,
      repo: options.repo,
      number: options.number,
      view,
      commentCount,
      returnedComments: comments.length,
    },
  };
}
