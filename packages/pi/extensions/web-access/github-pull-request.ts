import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  fetchGitHubApiJson,
  fetchGitHubApiText,
  MAX_GITHUB_TEXT_BYTES,
  type GitHubTextFetcher,
} from "./github-api.ts";
import {
  githubBoolean,
  githubInteger,
  githubRecord,
  githubString,
  normalizeGitHubIssueComment,
  normalizeGitHubLabels,
  normalizeGitHubUser,
  normalizeGitHubUsers,
} from "./github-normalize.ts";
import type { FetchedContent } from "./types.ts";

const OWNER_REPO = /^[A-Za-z0-9_.-]+$/;

export type GitHubPullRequestView =
  | "summary"
  | "files"
  | "diff"
  | "commits"
  | "comments"
  | "reviews"
  | "checks";

export interface GitHubPullRequestOptions {
  owner: string;
  repo: string;
  number: number;
  view: GitHubPullRequestView;
  limit?: number;
}

export interface GitHubPullRequestDetails {
  owner: string;
  repo: string;
  number: number;
  view: GitHubPullRequestView;
  resultCount?: number;
  totalCount?: number;
}

function branch(value: unknown): Record<string, unknown> | undefined {
  const entry = githubRecord(value);
  if (!entry) return undefined;
  const repository = githubRecord(entry.repo);
  return {
    ref: githubString(entry.ref),
    sha: githubString(entry.sha),
    repository: repository
      ? {
          fullName: githubString(repository.full_name),
          url: githubString(repository.html_url),
        }
      : undefined,
  };
}

function normalizePullRequest(pull: Record<string, unknown>): Record<string, unknown> {
  const milestone = githubRecord(pull.milestone);
  return {
    number: githubInteger(pull.number),
    title: githubString(pull.title),
    body: githubString(pull.body),
    state: githubString(pull.state),
    draft: pull.draft === true,
    locked: pull.locked === true,
    merged: pull.merged === true,
    mergeable: githubBoolean(pull.mergeable),
    mergeableState: githubString(pull.mergeable_state),
    rebaseable: githubBoolean(pull.rebaseable),
    author: normalizeGitHubUser(pull.user),
    authorAssociation: githubString(pull.author_association),
    labels: normalizeGitHubLabels(pull.labels),
    assignees: normalizeGitHubUsers(pull.assignees),
    requestedReviewers: normalizeGitHubUsers(pull.requested_reviewers),
    milestone: milestone
      ? {
          number: githubInteger(milestone.number),
          title: githubString(milestone.title),
          state: githubString(milestone.state),
          dueOn: githubString(milestone.due_on),
          url: githubString(milestone.html_url),
        }
      : undefined,
    head: branch(pull.head),
    base: branch(pull.base),
    additions: githubInteger(pull.additions) ?? 0,
    deletions: githubInteger(pull.deletions) ?? 0,
    changedFiles: githubInteger(pull.changed_files) ?? 0,
    commitCount: githubInteger(pull.commits) ?? 0,
    commentCount: githubInteger(pull.comments) ?? 0,
    reviewCommentCount: githubInteger(pull.review_comments) ?? 0,
    createdAt: githubString(pull.created_at),
    updatedAt: githubString(pull.updated_at),
    closedAt: githubString(pull.closed_at),
    mergedAt: githubString(pull.merged_at),
    mergedBy: normalizeGitHubUser(pull.merged_by),
    url: githubString(pull.html_url),
  };
}

function normalizeFile(file: Record<string, unknown>): Record<string, unknown> {
  return {
    filename: githubString(file.filename),
    previousFilename: githubString(file.previous_filename),
    status: githubString(file.status),
    additions: githubInteger(file.additions) ?? 0,
    deletions: githubInteger(file.deletions) ?? 0,
    changes: githubInteger(file.changes) ?? 0,
    patch: githubString(file.patch),
    url: githubString(file.blob_url),
  };
}

function gitSignature(value: unknown): Record<string, unknown> | undefined {
  const signature = githubRecord(value);
  if (!signature) return undefined;
  return {
    name: githubString(signature.name),
    email: githubString(signature.email),
    date: githubString(signature.date),
  };
}

function normalizeCommit(value: Record<string, unknown>): Record<string, unknown> {
  const commit = githubRecord(value.commit);
  const parents = Array.isArray(value.parents)
    ? value.parents.flatMap((parent) => {
        const sha = githubString(githubRecord(parent)?.sha);
        return sha ? [sha] : [];
      })
    : [];
  return {
    sha: githubString(value.sha),
    url: githubString(value.html_url),
    message: githubString(commit?.message),
    author: gitSignature(commit?.author),
    committer: gitSignature(commit?.committer),
    githubAuthor: normalizeGitHubUser(value.author),
    githubCommitter: normalizeGitHubUser(value.committer),
    parents,
  };
}

function normalizeReview(review: Record<string, unknown>): Record<string, unknown> {
  return {
    id: githubInteger(review.id),
    state: githubString(review.state),
    body: githubString(review.body),
    author: normalizeGitHubUser(review.user),
    authorAssociation: githubString(review.author_association),
    commitId: githubString(review.commit_id),
    submittedAt: githubString(review.submitted_at),
    url: githubString(review.html_url),
  };
}

function normalizeReviewComment(comment: Record<string, unknown>): Record<string, unknown> {
  return {
    id: githubInteger(comment.id),
    body: githubString(comment.body),
    author: normalizeGitHubUser(comment.user),
    authorAssociation: githubString(comment.author_association),
    path: githubString(comment.path),
    commitId: githubString(comment.commit_id),
    originalCommitId: githubString(comment.original_commit_id),
    line: githubInteger(comment.line),
    originalLine: githubInteger(comment.original_line),
    startLine: githubInteger(comment.start_line),
    side: githubString(comment.side),
    startSide: githubString(comment.start_side),
    subjectType: githubString(comment.subject_type),
    inReplyToId: githubInteger(comment.in_reply_to_id),
    diffHunk: githubString(comment.diff_hunk),
    createdAt: githubString(comment.created_at),
    updatedAt: githubString(comment.updated_at),
    url: githubString(comment.html_url),
  };
}

function normalizeCheckRun(check: Record<string, unknown>): Record<string, unknown> {
  const app = githubRecord(check.app);
  const output = githubRecord(check.output);
  return {
    id: githubInteger(check.id),
    name: githubString(check.name),
    status: githubString(check.status),
    conclusion: githubString(check.conclusion),
    startedAt: githubString(check.started_at),
    completedAt: githubString(check.completed_at),
    detailsUrl: githubString(check.details_url),
    app: githubString(app?.name),
    output: output
      ? {
          title: githubString(output.title),
          summary: githubString(output.summary),
        }
      : undefined,
  };
}

function normalizeStatus(status: Record<string, unknown>): Record<string, unknown> {
  return {
    id: githubInteger(status.id),
    state: githubString(status.state),
    context: githubString(status.context),
    description: githubString(status.description),
    targetUrl: githubString(status.target_url),
    createdAt: githubString(status.created_at),
    updatedAt: githubString(status.updated_at),
    creator: normalizeGitHubUser(status.creator),
  };
}

function normalizeArray(
  value: unknown,
  errorMessage: string,
  normalize: (entry: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(errorMessage);
  return value.flatMap((item) => {
    const entry = githubRecord(item);
    return entry ? [normalize(entry)] : [];
  });
}

function validate(options: GitHubPullRequestOptions): void {
  if (!OWNER_REPO.test(options.owner)) throw new Error(`Invalid GitHub owner: ${options.owner}`);
  if (!OWNER_REPO.test(options.repo)) throw new Error(`Invalid GitHub repository: ${options.repo}`);
  if (!Number.isSafeInteger(options.number) || options.number < 1) {
    throw new Error(`Invalid GitHub pull request number: ${options.number}`);
  }
}

/** Read and normalize one pull request or one bounded first page of related data. */
export async function fetchGitHubPullRequest(
  pi: ExtensionAPI,
  options: GitHubPullRequestOptions,
  signal?: AbortSignal,
  fetchText: GitHubTextFetcher = fetchGitHubApiText,
): Promise<{ fetched: FetchedContent; details: GitHubPullRequestDetails }> {
  validate(options);
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 30), 1), 100);
  const base = `repos/${options.owner}/${options.repo}/pulls/${options.number}`;
  if (options.view === "diff") {
    return {
      fetched: {
        url: `https://github.com/${options.owner}/${options.repo}/pull/${options.number}`,
        title: `${options.owner}/${options.repo}#${options.number} diff`,
        content: await fetchText(pi, base, {
          accept: "application/vnd.github.diff",
          maxBytes: MAX_GITHUB_TEXT_BYTES,
          signal,
        }),
        truncated: false,
      },
      details: {
        owner: options.owner,
        repo: options.repo,
        number: options.number,
        view: options.view,
      },
    };
  }

  const pull = githubRecord(await fetchGitHubApiJson(pi, base, { signal }));
  if (!pull) throw new Error("GitHub pull request API response was invalid");

  let content: Record<string, unknown> = { pullRequest: normalizePullRequest(pull) };
  let resultCount: number | undefined;
  let totalCount: number | undefined;
  let truncated = false;

  if (options.view === "files") {
    const files = normalizeArray(
      await fetchGitHubApiJson(pi, `${base}/files?per_page=${limit}`, { signal }),
      "GitHub pull request files response was invalid",
      normalizeFile,
    );
    resultCount = files.length;
    totalCount = githubInteger(pull.changed_files) ?? files.length;
    truncated = resultCount < totalCount;
    content = { files, totalFiles: totalCount, returnedFiles: resultCount };
  } else if (options.view === "commits") {
    const commits = normalizeArray(
      await fetchGitHubApiJson(pi, `${base}/commits?per_page=${limit}`, { signal }),
      "GitHub pull request commits response was invalid",
      normalizeCommit,
    );
    resultCount = commits.length;
    totalCount = githubInteger(pull.commits) ?? commits.length;
    truncated = resultCount < totalCount;
    content = { commits, totalCommits: totalCount, returnedCommits: resultCount };
  } else if (options.view === "comments") {
    const comments = normalizeArray(
      await fetchGitHubApiJson(
        pi,
        `repos/${options.owner}/${options.repo}/issues/${options.number}/comments?per_page=${limit}`,
        { signal },
      ),
      "GitHub pull request comments response was invalid",
      normalizeGitHubIssueComment,
    );
    resultCount = comments.length;
    totalCount = githubInteger(pull.comments) ?? comments.length;
    truncated = resultCount < totalCount;
    content = { comments, totalComments: totalCount, returnedComments: resultCount };
  } else if (options.view === "reviews") {
    const reviews = normalizeArray(
      await fetchGitHubApiJson(pi, `${base}/reviews?per_page=${limit}`, { signal }),
      "GitHub pull request reviews response was invalid",
      normalizeReview,
    );
    const remaining = Math.max(limit - reviews.length, 0);
    const reviewComments = remaining
      ? normalizeArray(
          await fetchGitHubApiJson(pi, `${base}/comments?per_page=${remaining}`, { signal }),
          "GitHub pull request review-comments response was invalid",
          normalizeReviewComment,
        )
      : [];
    const reviewsHaveMore = reviews.length === limit;
    const totalReviewComments = githubInteger(pull.review_comments) ?? reviewComments.length;
    const reviewCommentsHaveMore = reviewComments.length < totalReviewComments;
    const returnedReviews = reviews;
    const returnedReviewComments = reviewComments;
    truncated = reviewsHaveMore || reviewCommentsHaveMore;
    resultCount = returnedReviews.length + returnedReviewComments.length;
    content = {
      reviews: returnedReviews,
      returnedReviews: returnedReviews.length,
      reviewsHaveMore,
      reviewComments: returnedReviewComments,
      totalReviewComments,
      returnedReviewComments: returnedReviewComments.length,
      reviewCommentsHaveMore,
    };
  } else if (options.view === "checks") {
    const headSha = githubString(githubRecord(pull.head)?.sha);
    if (!headSha) throw new Error("GitHub pull request response did not include a head SHA");
    const checksValue = githubRecord(
      await fetchGitHubApiJson(
        pi,
        `repos/${options.owner}/${options.repo}/commits/${headSha}/check-runs?per_page=${limit}`,
        { signal },
      ),
    );
    if (!checksValue || !Array.isArray(checksValue.check_runs)) {
      throw new Error("GitHub pull request check-runs response was invalid");
    }
    const checkRuns = normalizeArray(
      checksValue.check_runs,
      "GitHub pull request check-runs response was invalid",
      normalizeCheckRun,
    );
    const remaining = Math.max(limit - checkRuns.length, 0);
    const statusValue = githubRecord(
      await fetchGitHubApiJson(
        pi,
        `repos/${options.owner}/${options.repo}/commits/${headSha}/status?per_page=${Math.max(remaining, 1)}`,
        { signal },
      ),
    );
    if (!statusValue || !Array.isArray(statusValue.statuses)) {
      throw new Error("GitHub pull request combined-status response was invalid");
    }
    const statuses = normalizeArray(
      statusValue.statuses,
      "GitHub pull request combined-status response was invalid",
      normalizeStatus,
    ).slice(0, remaining);
    totalCount = githubInteger(checksValue.total_count) ?? checkRuns.length;
    const totalStatuses = githubInteger(statusValue.total_count) ?? statuses.length;
    resultCount = checkRuns.length + statuses.length;
    truncated = checkRuns.length < totalCount || statuses.length < totalStatuses;
    content = {
      headSha,
      checkRuns,
      totalCheckRuns: totalCount,
      returnedCheckRuns: checkRuns.length,
      combinedStatus: {
        state: githubString(statusValue.state),
        totalStatuses,
        returnedStatuses: statuses.length,
        statuses,
      },
    };
  }

  const url =
    githubString(pull.html_url) ??
    `https://github.com/${options.owner}/${options.repo}/pull/${options.number}`;
  const title =
    githubString(pull.title) ?? `${options.owner}/${options.repo} pull request #${options.number}`;

  return {
    fetched: {
      url,
      title: `${options.owner}/${options.repo}#${options.number}: ${title}`,
      content: JSON.stringify(content, null, 2),
      truncated,
    },
    details: {
      owner: options.owner,
      repo: options.repo,
      number: options.number,
      view: options.view,
      resultCount,
      totalCount,
    },
  };
}
