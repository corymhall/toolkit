import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fetchGitHubApiJson, fetchGitHubApiText } from "./github-api.ts";
import {
  githubInteger,
  githubRecord,
  githubString,
  normalizeGitHubUser,
} from "./github-normalize.ts";
import type { FetchedContent } from "./types.ts";

const OWNER_REPO = /^[A-Za-z0-9_.-]+$/;
const MAX_JOBS = 100;
const MAX_FAILED_JOB_LOGS = 20;
const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "action_required"]);

export type GitHubActionsView = "run" | "jobs" | "job_logs" | "failed_logs";

export interface GitHubActionsOptions {
  owner: string;
  repo: string;
  view: GitHubActionsView;
  runId?: number;
  jobId?: number;
  tailLines?: number;
}

export interface GitHubActionsDetails {
  owner: string;
  repo: string;
  view: GitHubActionsView;
  runId?: number;
  jobId?: number;
  resultCount?: number;
  totalCount?: number;
}

function normalizePullRequests(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const number = githubInteger(githubRecord(item)?.number);
    return number === undefined ? [] : [number];
  });
}

function normalizeRun(run: Record<string, unknown>): Record<string, unknown> {
  const headCommit = githubRecord(run.head_commit);
  return {
    id: githubInteger(run.id),
    name: githubString(run.name),
    displayTitle: githubString(run.display_title),
    workflowId: githubInteger(run.workflow_id),
    runNumber: githubInteger(run.run_number),
    attempt: githubInteger(run.run_attempt),
    event: githubString(run.event),
    status: githubString(run.status),
    conclusion: githubString(run.conclusion),
    headBranch: githubString(run.head_branch),
    headSha: githubString(run.head_sha),
    headCommit: headCommit
      ? {
          id: githubString(headCommit.id),
          message: githubString(headCommit.message),
          timestamp: githubString(headCommit.timestamp),
          author: githubString(githubRecord(headCommit.author)?.name),
        }
      : undefined,
    path: githubString(run.path),
    actor: normalizeGitHubUser(run.actor),
    triggeringActor: normalizeGitHubUser(run.triggering_actor),
    pullRequests: normalizePullRequests(run.pull_requests),
    createdAt: githubString(run.created_at),
    updatedAt: githubString(run.updated_at),
    runStartedAt: githubString(run.run_started_at),
    url: githubString(run.html_url),
  };
}

function normalizeStep(step: Record<string, unknown>): Record<string, unknown> {
  return {
    number: githubInteger(step.number),
    name: githubString(step.name),
    status: githubString(step.status),
    conclusion: githubString(step.conclusion),
    startedAt: githubString(step.started_at),
    completedAt: githubString(step.completed_at),
  };
}

function normalizeJob(job: Record<string, unknown>): Record<string, unknown> {
  const steps = Array.isArray(job.steps)
    ? job.steps.flatMap((item) => {
        const entry = githubRecord(item);
        return entry ? [normalizeStep(entry)] : [];
      })
    : [];
  return {
    id: githubInteger(job.id),
    runId: githubInteger(job.run_id),
    name: githubString(job.name),
    workflowName: githubString(job.workflow_name),
    status: githubString(job.status),
    conclusion: githubString(job.conclusion),
    headBranch: githubString(job.head_branch),
    headSha: githubString(job.head_sha),
    attempt: githubInteger(job.run_attempt),
    runnerName: githubString(job.runner_name),
    runnerGroupName: githubString(job.runner_group_name),
    labels: Array.isArray(job.labels)
      ? job.labels.filter((label): label is string => typeof label === "string")
      : [],
    steps,
    createdAt: githubString(job.created_at),
    startedAt: githubString(job.started_at),
    completedAt: githubString(job.completed_at),
    url: githubString(job.html_url),
  };
}

function parseJobs(value: unknown): {
  jobs: Array<{ raw: Record<string, unknown>; normalized: Record<string, unknown> }>;
  totalCount: number;
} {
  const response = githubRecord(value);
  if (!response || !Array.isArray(response.jobs)) {
    throw new Error("GitHub Actions jobs response was invalid");
  }
  const jobs = response.jobs.flatMap((item) => {
    const raw = githubRecord(item);
    return raw ? [{ raw, normalized: normalizeJob(raw) }] : [];
  });
  return {
    jobs,
    totalCount: githubInteger(response.total_count) ?? jobs.length,
  };
}

function tail(value: string, lineCount: number): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const trailingNewline = lines.at(-1) === "";
  if (trailingNewline) lines.pop();
  if (lines.length <= lineCount) return value;
  return `${lines.slice(-lineCount).join("\n")}${trailingNewline ? "\n" : ""}`;
}

function requireId(value: number | undefined, name: "runId" | "jobId"): number {
  if (!Number.isSafeInteger(value) || value! < 1) {
    throw new Error(`GitHub Actions ${name} must be a positive safe integer`);
  }
  return value!;
}

function validate(options: GitHubActionsOptions): void {
  if (!OWNER_REPO.test(options.owner)) throw new Error(`Invalid GitHub owner: ${options.owner}`);
  if (!OWNER_REPO.test(options.repo)) throw new Error(`Invalid GitHub repository: ${options.repo}`);
}

async function fetchJobLog(
  pi: ExtensionAPI,
  owner: string,
  repo: string,
  jobId: number,
  signal?: AbortSignal,
): Promise<string> {
  return fetchGitHubApiText(pi, `repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, { signal });
}

/** Read and normalize a workflow run, its jobs, or complete logs with model-visible tails. */
export async function fetchGitHubActions(
  pi: ExtensionAPI,
  options: GitHubActionsOptions,
  signal?: AbortSignal,
): Promise<{ fetched: FetchedContent; details: GitHubActionsDetails }> {
  validate(options);
  const tailLines = Math.min(Math.max(Math.floor(options.tailLines ?? 200), 1), 2_000);
  const baseUrl = `https://github.com/${options.owner}/${options.repo}`;

  if (options.view === "job_logs") {
    const jobId = requireId(options.jobId, "jobId");
    const job = githubRecord(
      await fetchGitHubApiJson(pi, `repos/${options.owner}/${options.repo}/actions/jobs/${jobId}`, {
        signal,
      }),
    );
    if (!job) throw new Error("GitHub Actions job response was invalid");
    const logs = await fetchJobLog(pi, options.owner, options.repo, jobId, signal);
    const jobName = githubString(job.name) ?? `job ${jobId}`;
    return {
      fetched: {
        url: githubString(job.html_url) ?? `${baseUrl}/actions`,
        title: `${options.owner}/${options.repo}: ${jobName} logs`,
        content: logs,
        modelContent: tail(logs, tailLines),
        truncated: false,
      },
      details: {
        owner: options.owner,
        repo: options.repo,
        view: options.view,
        jobId,
      },
    };
  }

  const runId = requireId(options.runId, "runId");
  const run = githubRecord(
    await fetchGitHubApiJson(pi, `repos/${options.owner}/${options.repo}/actions/runs/${runId}`, {
      signal,
    }),
  );
  if (!run) throw new Error("GitHub Actions run response was invalid");
  const runUrl = githubString(run.html_url) ?? `${baseUrl}/actions/runs/${runId}`;
  const runTitle = githubString(run.display_title) ?? githubString(run.name) ?? `run ${runId}`;

  if (options.view === "run") {
    return {
      fetched: {
        url: runUrl,
        title: `${options.owner}/${options.repo}: ${runTitle}`,
        content: JSON.stringify({ run: normalizeRun(run) }, null, 2),
        truncated: false,
      },
      details: { owner: options.owner, repo: options.repo, view: options.view, runId },
    };
  }

  const jobsResponse = parseJobs(
    await fetchGitHubApiJson(
      pi,
      `repos/${options.owner}/${options.repo}/actions/runs/${runId}/jobs?per_page=${MAX_JOBS}`,
      { signal },
    ),
  );

  if (options.view === "jobs") {
    return {
      fetched: {
        url: runUrl,
        title: `${options.owner}/${options.repo}: ${runTitle} jobs`,
        content: JSON.stringify(
          {
            jobs: jobsResponse.jobs.map((job) => job.normalized),
            totalJobs: jobsResponse.totalCount,
            returnedJobs: jobsResponse.jobs.length,
          },
          null,
          2,
        ),
        truncated: jobsResponse.jobs.length < jobsResponse.totalCount,
      },
      details: {
        owner: options.owner,
        repo: options.repo,
        view: options.view,
        runId,
        resultCount: jobsResponse.jobs.length,
        totalCount: jobsResponse.totalCount,
      },
    };
  }

  const failedJobs = jobsResponse.jobs.filter((job) => {
    const conclusion = githubString(job.raw.conclusion);
    return conclusion !== undefined && FAILED_CONCLUSIONS.has(conclusion);
  });
  const selectedJobs = failedJobs.slice(0, MAX_FAILED_JOB_LOGS);
  const logs: Array<{ id: number; name: string; logs: string }> = [];
  for (const job of selectedJobs) {
    const jobId = requireId(githubInteger(job.raw.id), "jobId");
    logs.push({
      id: jobId,
      name: githubString(job.raw.name) ?? `job ${jobId}`,
      logs: await fetchJobLog(pi, options.owner, options.repo, jobId, signal),
    });
  }
  const renderLogs = (select: (log: (typeof logs)[number]) => string) =>
    logs.map((log) => `## ${log.name} (${log.id})\n\n${select(log)}`).join("\n\n");
  const fullLogs = renderLogs((log) => log.logs);
  const tailedLogs = renderLogs((log) => tail(log.logs, tailLines));
  const omittedFailedJobs = failedJobs.length - selectedJobs.length;
  const jobsTruncated = jobsResponse.jobs.length < jobsResponse.totalCount;
  const summary = [
    `Jobs inspected: ${jobsResponse.jobs.length} of ${jobsResponse.totalCount}`,
    `Failed-job logs returned: ${selectedJobs.length} of ${failedJobs.length} found in the returned jobs page`,
  ].join("\n");
  const noFailedJobs = "No failed jobs were found in the returned jobs page.";

  return {
    fetched: {
      url: runUrl,
      title: `${options.owner}/${options.repo}: ${runTitle} failed logs`,
      content: `${summary}\n\n${fullLogs || noFailedJobs}`,
      modelContent: `${summary}\n\n${tailedLogs || noFailedJobs}`,
      truncated: jobsTruncated || omittedFailedJobs > 0,
    },
    details: {
      owner: options.owner,
      repo: options.repo,
      view: options.view,
      runId,
      resultCount: selectedJobs.length,
      totalCount: failedJobs.length,
    },
  };
}
