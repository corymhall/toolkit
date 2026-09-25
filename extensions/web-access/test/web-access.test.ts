import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import webAccessExtension, { formatSearchSources } from "../index.ts";
import { EmptyToolResult, type CompactTheme } from "../../pi-ui/tool-cards/rendering.ts";
import { fetchGitHubContent, parseGitHubUrl } from "../github.ts";
import { fetchGitHubActions } from "../github-actions.ts";
import { fetchGitHubIssue } from "../github-issue.ts";
import { fetchGitHubPullRequest } from "../github-pull-request.ts";
import { buildGitHubSearchQuery, searchGitHub } from "../github-search.ts";
import { fetchHttpContent } from "../http.ts";
import { parseOpenAIResponse, searchWithCodex } from "../openai-search.ts";
import {
  createPinnedRequestOptions,
  fetchRemoteUrl,
  requestPinnedUrl,
  validateRemoteUrl,
} from "../ssrf.ts";

const plainTheme: CompactTheme = {
  fg: (_color, text) => text,
};

test("uses gpt-6-astra and drops provider header deletion markers for Codex web search", async () => {
  const ctx = {
    modelRegistry: {
      find(provider: string, modelId: string) {
        assert.equal(provider, "openai-codex");
        assert.equal(modelId, "gpt-6-astra");
        return { provider, id: modelId };
      },
      async getApiKeyAndHeaders() {
        return {
          ok: true,
          apiKey: "test-token",
          headers: { "x-keep": "value", "x-delete": null },
        };
      },
    },
  } as unknown as ExtensionContext;

  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal(JSON.parse(init?.body as string).model, "gpt-6-astra");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-keep"), "value");
    assert.equal(headers.has("x-delete"), false);
    return new Response(
      JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: "answer" }] }],
      }),
      { status: 200 },
    );
  };

  const result = await searchWithCodex("query", {}, ctx, fetchImpl);
  assert.equal(result.answer, "answer");
});

test("parses supported GitHub URLs and rejects unrelated pages", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/acme/widgets"), {
    owner: "acme",
    repo: "widgets",
    kind: "repo",
  });
  assert.deepEqual(parseGitHubUrl("https://github.com/acme/widgets/blob/main/src/a.ts"), {
    owner: "acme",
    repo: "widgets",
    kind: "blob",
    ref: "main",
    path: "src/a.ts",
  });
  assert.deepEqual(parseGitHubUrl("https://github.com/acme/widgets/issues/42"), {
    owner: "acme",
    repo: "widgets",
    kind: "issue",
    number: 42,
  });
  assert.deepEqual(parseGitHubUrl("https://github.com/acme/widgets/pull/17"), {
    owner: "acme",
    repo: "widgets",
    kind: "pull_request",
    number: 17,
  });
  assert.deepEqual(parseGitHubUrl("https://github.com/acme/widgets/actions/runs/123"), {
    owner: "acme",
    repo: "widgets",
    kind: "actions_run",
    runId: 123,
  });
  assert.equal(parseGitHubUrl("https://github.com/acme/widgets/issues/not-a-number"), null);
  assert.equal(parseGitHubUrl("http://github.com/acme/widgets"), null);
});

test("fetches GitHub files through a constrained gh API invocation", async () => {
  const calls: string[][] = [];
  const responses = [
    { private: false, visibility: "public", full_name: "acme/widgets", default_branch: "main" },
    { type: "file", size: 5, encoding: "base64", content: Buffer.from("hello").toString("base64") },
  ];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return { code: 0, stdout: JSON.stringify(responses.shift()), stderr: "", killed: false };
    },
  } as unknown as ExtensionAPI;
  const result = await fetchGitHubContent(
    "https://github.com/acme/widgets/blob/main/README.md",
    pi,
  );
  assert.equal(result?.content, "hello");
  assert.equal(calls[0][0], "gh");
  assert.deepEqual(calls[0].slice(0, 4), ["gh", "api", "--hostname", "github.com"]);
  assert.match(calls[1][4], /^repos\/acme\/widgets\/contents\/README\.md\?ref=main$/);
  assert.equal(calls.flat().includes("clone"), false);
});

test("fetches pasted GitHub issue URLs as summaries", async () => {
  const calls: string[][] = [];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify({
          number: 42,
          title: "Fix timeout",
          body: "Issue body",
          state: "open",
          user: { login: "octocat", html_url: "https://github.com/octocat" },
          labels: [{ name: "bug" }],
          assignees: [],
          comments: 2,
          html_url: "https://github.com/acme/widgets/issues/42",
        }),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  const result = await fetchGitHubContent("https://github.com/acme/widgets/issues/42", pi);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][4], "repos/acme/widgets/issues/42");
  assert.equal(result?.title, "acme/widgets#42: Fix timeout");
  assert.match(result?.content ?? "", /"body": "Issue body"/);
  assert.doesNotMatch(result?.content ?? "", /returnedComments/);
});

test("reads and normalizes GitHub issue comments with a bounded page", async () => {
  const calls: string[][] = [];
  const responses = [
    {
      number: 42,
      title: "Fix timeout",
      body: "Issue body",
      state: "closed",
      state_reason: "completed",
      draft: true,
      type: { name: "Bug" },
      reactions: { total_count: 2, heart: 2 },
      user: { login: "octocat", html_url: "https://github.com/octocat" },
      labels: [{ name: "bug" }],
      assignees: [{ login: "maintainer", html_url: "https://github.com/maintainer" }],
      comments: 3,
      html_url: "https://github.com/acme/widgets/issues/42",
    },
    [
      {
        id: 7,
        body: "A comment",
        user: { login: "maintainer", html_url: "https://github.com/maintainer" },
        author_association: "MEMBER",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/acme/widgets/issues/42#issuecomment-7",
        reactions: { total_count: 1, "+1": 1 },
      },
    ],
  ];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify(responses.shift()),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  await assert.rejects(
    () => fetchGitHubIssue(pi, { owner: "acme/other", repo: "widgets", number: 42 }),
    /Invalid GitHub owner/,
  );
  assert.equal(calls.length, 0);

  const result = await fetchGitHubIssue(pi, {
    owner: "acme",
    repo: "widgets",
    number: 42,
    view: "all",
    limit: 1,
  });
  assert.equal(calls[0][4], "repos/acme/widgets/issues/42");
  assert.equal(calls[1][4], "repos/acme/widgets/issues/42/comments?per_page=1");
  assert.equal(result.details.commentCount, 3);
  assert.equal(result.details.returnedComments, 1);
  assert.equal(result.fetched.truncated, true);
  assert.match(result.fetched.content, /"stateReason": "completed"/);
  assert.match(result.fetched.content, /"issueType": "Bug"/);
  assert.match(result.fetched.content, /"draft": true/);
  assert.match(result.fetched.content, /"heart": 2/);
  assert.match(result.fetched.content, /"body": "A comment"/);
  assert.match(result.fetched.content, /"plusOne": 1/);
});

test("fetches pasted GitHub pull-request URLs as summaries", async () => {
  const calls: string[][] = [];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify({
          number: 17,
          title: "Improve retries",
          body: "PR body",
          state: "open",
          head: { ref: "retry", sha: "abc123", repo: { full_name: "acme/widgets" } },
          base: { ref: "main", sha: "def456", repo: { full_name: "acme/widgets" } },
          html_url: "https://github.com/acme/widgets/pull/17",
        }),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  const result = await fetchGitHubContent("https://github.com/acme/widgets/pull/17", pi);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][4], "repos/acme/widgets/pulls/17");
  assert.equal(result?.title, "acme/widgets#17: Improve retries");
  assert.match(result?.content ?? "", /"body": "PR body"/);
  assert.match(result?.content ?? "", /"sha": "abc123"/);
});

test("reads a complete pull-request diff and bounded commit metadata", async () => {
  const pull = {
    number: 17,
    title: "Improve retries",
    commits: 3,
    head: { sha: "abc123" },
    html_url: "https://github.com/acme/widgets/pull/17",
  };
  const responses: Array<unknown> = [
    "diff --git a/src/retry.ts b/src/retry.ts\n+retry();\n",
    pull,
    [
      {
        sha: "abc123",
        html_url: "https://github.com/acme/widgets/commit/abc123",
        commit: {
          message: "Improve retries",
          author: { name: "Octo Cat", email: "octo@example.com", date: "2026-01-01T00:00:00Z" },
          committer: {
            name: "Octo Cat",
            email: "octo@example.com",
            date: "2026-01-01T00:00:00Z",
          },
        },
        author: { login: "octocat", html_url: "https://github.com/octocat" },
        parents: [{ sha: "def456" }],
      },
    ],
  ];
  const calls: string[][] = [];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      const response = responses.shift();
      return {
        code: 0,
        stdout: typeof response === "string" ? response : JSON.stringify(response),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  const diff = await fetchGitHubPullRequest(pi, {
    owner: "acme",
    repo: "widgets",
    number: 17,
    view: "diff",
  });
  assert.equal(calls[0][4], "repos/acme/widgets/pulls/17");
  assert.equal(calls[0].includes("Accept: application/vnd.github.diff"), true);
  assert.equal(diff.fetched.content, "diff --git a/src/retry.ts b/src/retry.ts\n+retry();\n");
  assert.equal(diff.fetched.truncated, false);

  const commits = await fetchGitHubPullRequest(pi, {
    owner: "acme",
    repo: "widgets",
    number: 17,
    view: "commits",
    limit: 1,
  });
  assert.equal(calls[2][4], "repos/acme/widgets/pulls/17/commits?per_page=1");
  assert.equal(commits.fetched.truncated, true);
  assert.match(commits.fetched.content, /"message": "Improve retries"/);
  assert.match(commits.fetched.content, /"githubAuthor":/);
  assert.match(commits.fetched.content, /"def456"/);
});

test("reads bounded pull-request files, comments, and reviews", async () => {
  const pull = {
    number: 17,
    title: "Improve retries",
    state: "open",
    changed_files: 4,
    comments: 3,
    head: { sha: "abc123" },
    html_url: "https://github.com/acme/widgets/pull/17",
  };
  const responses = [
    pull,
    [
      {
        filename: "src/retry.ts",
        status: "modified",
        additions: 5,
        deletions: 2,
        changes: 7,
        patch: "@@ -1 +1 @@",
        blob_url: "https://github.com/acme/widgets/blob/abc123/src/retry.ts",
      },
    ],
    pull,
    [
      {
        id: 8,
        body: "Conversation comment",
        user: { login: "octocat" },
        html_url: "https://github.com/acme/widgets/pull/17#issuecomment-8",
      },
    ],
    pull,
    [
      {
        id: 9,
        state: "APPROVED",
        body: "Looks good",
        user: { login: "reviewer" },
        html_url: "https://github.com/acme/widgets/pull/17#pullrequestreview-9",
      },
      { id: 10, state: "COMMENTED", body: "One more", user: { login: "reviewer" } },
    ],
    [
      {
        id: 11,
        body: "Handle this error",
        user: { login: "reviewer" },
        path: "src/retry.ts",
        line: 42,
        side: "RIGHT",
        diff_hunk: "@@ -40,3 +40,4 @@",
        html_url: "https://github.com/acme/widgets/pull/17#discussion_r11",
      },
    ],
  ];
  const calls: string[][] = [];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify(responses.shift()),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  const files = await fetchGitHubPullRequest(pi, {
    owner: "acme",
    repo: "widgets",
    number: 17,
    view: "files",
    limit: 1,
  });
  assert.equal(calls[1][4], "repos/acme/widgets/pulls/17/files?per_page=1");
  assert.equal(files.fetched.truncated, true);
  assert.match(files.fetched.content, /"filename": "src\/retry.ts"/);

  const comments = await fetchGitHubPullRequest(pi, {
    owner: "acme",
    repo: "widgets",
    number: 17,
    view: "comments",
    limit: 1,
  });
  assert.equal(calls[3][4], "repos/acme/widgets/issues/17/comments?per_page=1");
  assert.equal(comments.fetched.truncated, true);
  assert.match(comments.fetched.content, /Conversation comment/);

  const reviews = await fetchGitHubPullRequest(pi, {
    owner: "acme",
    repo: "widgets",
    number: 17,
    view: "reviews",
    limit: 1,
  });
  assert.equal(calls[5][4], "repos/acme/widgets/pulls/17/reviews?per_page=2");
  assert.equal(calls[6][4], "repos/acme/widgets/pulls/17/comments?per_page=1");
  assert.equal(reviews.fetched.truncated, true);
  assert.match(reviews.fetched.content, /"state": "APPROVED"/);
  assert.match(reviews.fetched.content, /"body": "Handle this error"/);
  assert.match(reviews.fetched.content, /"line": 42/);
  assert.doesNotMatch(reviews.fetched.content, /One more/);
});

test("reads pull-request check runs and commit statuses from the head SHA", async () => {
  const calls: string[][] = [];
  const responses = [
    {
      number: 17,
      title: "Improve retries",
      head: { sha: "abc123" },
      html_url: "https://github.com/acme/widgets/pull/17",
    },
    {
      total_count: 2,
      check_runs: [
        {
          id: 11,
          name: "test",
          status: "completed",
          conclusion: "failure",
          details_url: "https://github.com/acme/widgets/actions/runs/1",
          app: { name: "GitHub Actions" },
          output: { title: "Tests failed", summary: "failure details" },
        },
      ],
    },
    {
      state: "success",
      total_count: 1,
      statuses: [
        {
          id: 12,
          state: "success",
          context: "deploy",
          target_url: "https://ci.example/run/12",
        },
      ],
    },
  ];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify(responses.shift()),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  const result = await fetchGitHubPullRequest(pi, {
    owner: "acme",
    repo: "widgets",
    number: 17,
    view: "checks",
    limit: 1,
  });
  assert.equal(calls[1][4], "repos/acme/widgets/commits/abc123/check-runs?per_page=1");
  assert.equal(calls[2][4], "repos/acme/widgets/commits/abc123/status?per_page=1");
  assert.equal(result.fetched.truncated, true);
  assert.match(result.fetched.content, /"conclusion": "failure"/);
  assert.match(result.fetched.content, /"combinedStatus":/);
  assert.match(result.fetched.content, /"context": "deploy"/);
});

test("fetches pasted GitHub Actions run URLs as summaries", async () => {
  const calls: string[][] = [];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify({
          id: 123,
          name: "CI",
          display_title: "Test retries",
          status: "completed",
          conclusion: "failure",
          head_branch: "retry",
          head_sha: "abc123",
          html_url: "https://github.com/acme/widgets/actions/runs/123",
        }),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  const result = await fetchGitHubContent("https://github.com/acme/widgets/actions/runs/123", pi);
  assert.equal(calls[0][4], "repos/acme/widgets/actions/runs/123");
  assert.equal(result?.title, "acme/widgets: Test retries");
  assert.match(result?.content ?? "", /"conclusion": "failure"/);
});

test("reads GitHub Actions jobs and failed-job logs", async () => {
  const run = {
    id: 123,
    name: "CI",
    display_title: "Test retries",
    html_url: "https://github.com/acme/widgets/actions/runs/123",
  };
  const jobs = {
    total_count: 3,
    jobs: [
      {
        id: 44,
        run_id: 123,
        name: "test",
        status: "completed",
        conclusion: "failure",
        html_url: "https://github.com/acme/widgets/actions/runs/123/job/44",
        steps: [{ number: 1, name: "Run tests", status: "completed", conclusion: "failure" }],
      },
      {
        id: 45,
        run_id: 123,
        name: "lint",
        status: "completed",
        conclusion: "success",
      },
    ],
  };
  const responses: Array<unknown> = [run, jobs, run, jobs, "line 1\nline 2\nline 3\n"];
  const calls: string[][] = [];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      const response = responses.shift();
      return {
        code: 0,
        stdout: typeof response === "string" ? response : JSON.stringify(response),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  const jobsResult = await fetchGitHubActions(pi, {
    owner: "acme",
    repo: "widgets",
    view: "jobs",
    runId: 123,
  });
  assert.equal(calls[1][4], "repos/acme/widgets/actions/runs/123/jobs?per_page=100");
  assert.equal(jobsResult.fetched.truncated, true);
  assert.match(jobsResult.fetched.content, /"name": "Run tests"/);

  const logsResult = await fetchGitHubActions(pi, {
    owner: "acme",
    repo: "widgets",
    view: "failed_logs",
    runId: 123,
    tailLines: 2,
  });
  assert.equal(calls[4][4], "repos/acme/widgets/actions/jobs/44/logs");
  assert.match(logsResult.fetched.content, /line 1/);
  assert.doesNotMatch(logsResult.fetched.modelContent ?? "", /line 1/);
  assert.match(logsResult.fetched.modelContent ?? "", /line 2\nline 3/);
  assert.equal(logsResult.details.resultCount, 1);
});

test("reads one GitHub Actions job log without requiring a run ID", async () => {
  const calls: string[][] = [];
  const responses: Array<unknown> = [
    {
      id: 44,
      name: "test",
      html_url: "https://github.com/acme/widgets/actions/runs/123/job/44",
    },
    "first\nsecond\nthird\n",
  ];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      const response = responses.shift();
      return {
        code: 0,
        stdout: typeof response === "string" ? response : JSON.stringify(response),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;

  const result = await fetchGitHubActions(pi, {
    owner: "acme",
    repo: "widgets",
    view: "job_logs",
    jobId: 44,
    tailLines: 1,
  });
  assert.equal(calls[0][4], "repos/acme/widgets/actions/jobs/44");
  assert.equal(calls[1][4], "repos/acme/widgets/actions/jobs/44/logs");
  assert.equal(result.fetched.modelContent, "third\n");
  assert.match(result.fetched.content, /first/);
});

test("does not mistake a GitHub API 404 for a missing gh CLI", async () => {
  const pi = {
    async exec() {
      return {
        code: 1,
        stdout: "",
        stderr: "gh: Not Found (HTTP 404)",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;
  await assert.rejects(
    () => fetchGitHubContent("https://github.com/acme/missing", pi),
    /GitHub API request failed: gh: Not Found \(HTTP 404\)/,
  );
});

test("reports a missing gh CLI clearly", async () => {
  const pi = {
    async exec() {
      return {
        code: 1,
        stdout: "",
        stderr: "spawn gh ENOENT",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;
  await assert.rejects(
    () => fetchGitHubContent("https://github.com/acme/widgets", pi),
    /GitHub fetching requires the gh CLI/,
  );
});

test("blocks non-public network targets", async () => {
  await assert.rejects(
    () => validateRemoteUrl("http://127.0.0.1/test"),
    /Blocked non-public address/,
  );
  await assert.rejects(
    () =>
      validateRemoteUrl("https://internal.example/test", async () => [
        { address: "10.0.0.1", family: 4 },
      ]),
    /Blocked non-public address/,
  );
  for (const address of [
    "ff02::1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "fec0::1",
    "::ffff:127.0.0.1",
    "4000::1",
  ]) {
    await assert.rejects(
      () => validateRemoteUrl(`http://[${address}]/test`),
      /Blocked non-public address/,
    );
  }
  await assert.rejects(
    () => validateRemoteUrl("https://user:secret@example.com/test"),
    /containing credentials/,
  );
  assert.equal(
    (
      await validateRemoteUrl("https://public.example/test", async () => [
        { address: "2606:4700:4700::1111", family: 6 },
      ])
    ).hostname,
    "public.example",
  );
});

test("builds requests that connect to a validated address while preserving Host and TLS SNI", () => {
  const options = createPinnedRequestOptions(
    new URL("https://docs.example.com:8443/guide?q=one"),
    { address: "93.184.216.34", family: 4 },
    { headers: { Accept: "text/plain" } },
  );
  assert.equal(options.hostname, "93.184.216.34");
  assert.equal(options.servername, "docs.example.com");
  assert.equal(options.path, "/guide?q=one");
  assert.deepEqual(options.headers, { accept: "text/plain", host: "docs.example.com:8443" });
  assert.equal(options.agent, false);
});

test("streams pinned HTTP response bodies under the active runtime", async (t) => {
  const server = http.createServer((request, response) => {
    assert.match(request.headers.host ?? "", /^public\.example:/);
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("stream completed");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const remote = await requestPinnedUrl(
    new URL(`http://public.example:${address.port}/content`),
    [{ address: "127.0.0.1", family: 4 }],
    { signal: AbortSignal.timeout(2_000) },
  );
  try {
    assert.equal(await remote.response.text(), "stream completed");
  } finally {
    await remote.close();
  }
});

test("aborts DNS resolution that outlives the request deadline", async () => {
  const signal = AbortSignal.timeout(20);
  await assert.rejects(
    () =>
      fetchRemoteUrl(
        "https://public.example/content",
        { signal },
        {
          lookup: async () => new Promise(() => {}),
        },
      ),
    (error) => error === signal.reason,
  );
});

test("aborts a pinned response body that stops making progress", async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.flushHeaders();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const signal = AbortSignal.timeout(50);

  const remote = await requestPinnedUrl(
    new URL(`http://public.example:${address.port}/stall`),
    [{ address: "127.0.0.1", family: 4 }],
    { signal },
  );
  try {
    await assert.rejects(
      () => remote.response.text(),
      (error) => error === signal.reason || /abort|timeout/i.test(String(error)),
    );
  } finally {
    await remote.close();
  }
});

test("rejects redirects to private addresses before the second fetch", async () => {
  let fetchCalls = 0;
  const fakeFetch: typeof fetch = async () => {
    fetchCalls++;
    return new Response("", {
      status: 302,
      headers: { location: "http://internal.example/secret" },
    });
  };
  await assert.rejects(
    () =>
      fetchRemoteUrl(
        "https://example.com/start",
        {},
        {
          fetch: fakeFetch,
          lookup: async (hostname) => [
            { address: hostname === "internal.example" ? "10.0.0.2" : "93.184.216.34", family: 4 },
          ],
        },
      ),
    /Blocked non-public address/,
  );
  assert.equal(fetchCalls, 1);
});

test("fetches private GitHub repositories available to gh", async () => {
  const calls: string[][] = [];
  const responses = [
    { private: true, visibility: "private", full_name: "acme/private", default_branch: "main" },
    {
      type: "file",
      size: 6,
      encoding: "base64",
      content: Buffer.from("secret").toString("base64"),
    },
  ];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return { code: 0, stdout: JSON.stringify(responses.shift()), stderr: "", killed: false };
    },
  } as unknown as ExtensionAPI;
  const result = await fetchGitHubContent(
    "https://github.com/acme/private/blob/main/README.md",
    pi,
  );
  assert.equal(result?.content, "secret");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].slice(0, 4), ["gh", "api", "--hostname", "github.com"]);
});

test("builds GitHub API search queries from structured scope and filters", () => {
  assert.equal(
    buildGitHubSearchQuery({
      kind: "pull_requests",
      query: "timeout waiter",
      repos: ["pulumi/pulumi-aws"],
      owners: ["pulumi"],
      state: "closed",
      labels: ["kind/bug"],
      language: "go",
    }),
    'timeout waiter is:pr repo:"pulumi/pulumi-aws" user:"pulumi" state:closed label:"kind/bug" language:"go"',
  );
  assert.throws(
    () => buildGitHubSearchQuery({ kind: "issues", query: "repo:acme/widgets timeout" }),
    /repos or owners fields/,
  );
  assert.throws(
    () => buildGitHubSearchQuery({ kind: "code", query: "timeout", state: "open" }),
    /does not support state or labels/,
  );
});

test("searches GitHub through gh api and normalizes issue results", async () => {
  const calls: string[][] = [];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify({
          total_count: 3,
          incomplete_results: false,
          items: [
            {
              repository_url: "https://api.github.com/repos/acme/widgets",
              number: 42,
              title: "Fix timeout",
              state: "open",
              labels: [{ name: "bug" }],
              user: { login: "octocat" },
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
              html_url: "https://github.com/acme/widgets/issues/42",
            },
          ],
        }),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;
  const result = await searchGitHub(pi, {
    kind: "issues",
    query: "timeout",
    repos: ["acme/widgets"],
    state: "open",
    limit: 10,
  });
  assert.equal(calls[0][0], "gh");
  assert.deepEqual(calls[0].slice(1, 4), ["api", "--hostname", "github.com"]);
  assert.match(
    decodeURIComponent(calls[0][4]),
    /^search\/issues\?q=timeout is:issue repo:"acme\/widgets" state:open&per_page=10$/,
  );
  assert.equal(result.details.totalCount, 3);
  assert.equal(result.details.resultCount, 1);
  assert.match(result.fetched.content, /"returnedCount": 1/);
  assert.match(result.fetched.content, /"repository": "acme\/widgets"/);
  assert.match(result.fetched.content, /"number": 42/);
  assert.doesNotMatch(result.fetched.content, /body/);
});

test("registers tool-card renderers for the intended tools and describes fetch_content boundaries", () => {
  const tools: Array<{
    name: string;
    description: string;
    executionMode?: "parallel" | "sequential";
    renderCall?: (...args: any[]) => any;
    renderResult?: (...args: any[]) => any;
    renderShell?: string;
  }> = [];
  webAccessExtension({
    registerTool: (tool: (typeof tools)[number]) => tools.push(tool),
  } as unknown as ExtensionAPI);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "web_search",
      "github_search",
      "github_issue",
      "github_pull_request",
      "github_actions",
      "fetch_content",
    ],
  );
  assert.equal(
    tools.every(
      (tool) =>
        tool.renderShell === "self" &&
        typeof tool.renderCall === "function" &&
        typeof tool.renderResult === "function",
    ),
    true,
  );
  const githubSearch = tools.find((tool) => tool.name === "github_search");
  const renderContext = {
    args: { query: "timeout", repos: ["acme/widgets"] },
    argsComplete: true,
    executionStarted: true,
    expanded: false,
    isError: false,
    isPartial: false,
    state: {},
    toolCallId: "github-render",
  };
  const githubCard = githubSearch?.renderCall?.(
    renderContext.args,
    { fg: (_color: string, text: string) => text },
    renderContext,
  );
  githubSearch?.renderResult?.(
    {
      content: [{ type: "text", text: "results" }],
      details: {
        title: "GitHub issues search: timeout",
        source: "https://github.com/search",
        fullOutputPath: "/tmp/results.md",
        truncated: false,
        resultCount: 2,
        totalCount: 7,
      },
    },
    { expanded: false, isPartial: false },
    plainTheme,
    renderContext,
  );
  const githubOutput = githubCard.render(120).join("\n");
  assert.match(githubOutput, /Query: timeout · Repo: acme\/widgets/u);
  assert.match(githubOutput, /2 of 7 results/u);

  const githubIssue = tools.find((tool) => tool.name === "github_issue");
  const issueContext = {
    ...renderContext,
    args: { owner: "acme", repo: "widgets", number: 42, view: "all" },
    state: {},
    toolCallId: "issue-render",
  };
  const issueCard = githubIssue?.renderCall?.(
    issueContext.args,
    { fg: (_color: string, text: string) => text },
    issueContext,
  );
  assert.match(issueCard.render(120).join("\n"), /Issue: acme\/widgets#42 · View: all/u);

  const githubPullRequest = tools.find((tool) => tool.name === "github_pull_request");
  const pullContext = {
    ...renderContext,
    args: { owner: "acme", repo: "widgets", number: 17, view: "checks" },
    state: {},
    toolCallId: "pull-render",
  };
  const pullCard = githubPullRequest?.renderCall?.(
    pullContext.args,
    { fg: (_color: string, text: string) => text },
    pullContext,
  );
  assert.match(pullCard.render(120).join("\n"), /PR: acme\/widgets#17 · View: checks/u);

  const githubActions = tools.find((tool) => tool.name === "github_actions");
  assert.equal(githubActions?.executionMode, "sequential");
  const actionsContext = {
    ...renderContext,
    args: { owner: "acme", repo: "widgets", view: "failed_logs", runId: 123 },
    state: {},
    toolCallId: "actions-render",
  };
  const actionsCard = githubActions?.renderCall?.(
    actionsContext.args,
    { fg: (_color: string, text: string) => text },
    actionsContext,
  );
  assert.match(
    actionsCard.render(120).join("\n"),
    /Actions: acme\/widgets · View: failed_logs · Run: 123/u,
  );

  const fetchContent = tools.find((tool) => tool.name === "fetch_content");
  assert.equal(fetchContent?.executionMode, "sequential");
  assert.match(
    fetchContent?.description ?? "",
    /GitHub repository roots, issue pages, pull-request pages, Actions run pages/,
  );
  assert.match(fetchContent?.description ?? "", /commits and releases/);
});

test("labels GitHub code search results as untrusted and bounds fragments", async (t) => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const calls: string[][] = [];
  const pi = {
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) =>
      tools.push(tool),
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify({
          total_count: 1,
          incomplete_results: false,
          items: [
            {
              repository: { full_name: "acme/private" },
              path: "src/index.ts",
              sha: "abc123",
              html_url: "https://github.com/acme/private/blob/abc123/src/index.ts",
              text_matches: [{ fragment: "x".repeat(800) }],
            },
          ],
        }),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;
  webAccessExtension(pi);
  const tool = tools.find((candidate) => candidate.name === "github_search");
  assert.ok(tool);
  const result = await tool.execute(
    "call",
    {
      kind: "code",
      query: "searchGitHub",
      repos: ["acme/private"],
      path: "src",
      limit: 5,
    },
    undefined,
    undefined,
  );
  const fullOutputPath = result.details.fullOutputPath as string;
  t.after(() => rm(fullOutputPath, { force: true }));
  assert.match(decodeURIComponent(calls[0][4]), /^search\/code\?q=/);
  assert.match(result.content[0].text, /^\[Untrusted remote content follows\./);
  assert.match(result.content[0].text, /"repository": "acme\/private"/);
  assert.doesNotMatch(result.content[0].text, /x{501}/);
  assert.equal(await readFile(fullOutputPath, "utf8"), result.content[0].text);
});

test("saves complete Actions logs privately while returning only the requested tail", async (t) => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const responses: Array<unknown> = [
    {
      id: 44,
      name: "test",
      html_url: "https://github.com/acme/widgets/actions/runs/123/job/44",
    },
    "secret first line\nsecond line\nfinal line\n",
  ];
  const pi = {
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) =>
      tools.push(tool),
    async exec() {
      const response = responses.shift();
      return {
        code: 0,
        stdout: typeof response === "string" ? response : JSON.stringify(response),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;
  webAccessExtension(pi);
  const tool = tools.find((candidate) => candidate.name === "github_actions");
  assert.ok(tool);

  const result = await tool.execute(
    "call",
    { owner: "acme", repo: "widgets", view: "job_logs", jobId: 44, tailLines: 1 },
    undefined,
    undefined,
  );
  const fullOutputPath = result.details.fullOutputPath as string;
  t.after(() => rm(fullOutputPath, { force: true }));

  assert.doesNotMatch(result.content[0].text, /secret first line/);
  assert.match(result.content[0].text, /final line/);
  assert.match(result.content[0].text, /limited to the requested log tail/);
  const saved = await readFile(fullOutputPath, "utf8");
  assert.match(saved, /secret first line/);
  assert.equal((await stat(fullOutputPath)).mode & 0o777, 0o600);
});

test("preserves a complete pull-request diff privately while bounding model output", async (t) => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const completeDiff = `diff --git a/a b/a\n${"+x\n".repeat(20_000)}END-OF-DIFF\n`;
  const responses: Array<unknown> = [completeDiff];
  const pi = {
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) =>
      tools.push(tool),
    async exec() {
      const response = responses.shift();
      return {
        code: 0,
        stdout: typeof response === "string" ? response : JSON.stringify(response),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;
  webAccessExtension(pi);
  const tool = tools.find((candidate) => candidate.name === "github_pull_request");
  assert.ok(tool);

  const result = await tool.execute(
    "call",
    { owner: "acme", repo: "widgets", number: 17, view: "diff" },
    undefined,
    undefined,
  );
  const fullOutputPath = result.details.fullOutputPath as string;
  t.after(() => rm(fullOutputPath, { force: true }));

  assert.match(result.content[0].text, /Model-visible content truncated at Pi's safety limit/);
  assert.doesNotMatch(result.content[0].text, /END-OF-DIFF/);
  const saved = await readFile(fullOutputPath, "utf8");
  assert.match(saved, /END-OF-DIFF/);
  assert.equal((await stat(fullOutputPath)).mode & 0o777, 0o600);
});

test("distinguishes bounded GitHub collections from model-visible truncation", async (t) => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const responses = [
    {
      number: 17,
      title: "Improve retries",
      changed_files: 2,
      head: { sha: "abc123" },
      html_url: "https://github.com/acme/widgets/pull/17",
    },
    [
      {
        filename: "src/retry.ts",
        status: "modified",
        patch: "@@ -1 +1 @@",
        blob_url: "https://github.com/acme/widgets/blob/abc123/src/retry.ts",
      },
    ],
  ];
  const pi = {
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) =>
      tools.push(tool),
    async exec() {
      return {
        code: 0,
        stdout: JSON.stringify(responses.shift()),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;
  webAccessExtension(pi);
  const tool = tools.find((candidate) => candidate.name === "github_pull_request");
  assert.ok(tool);

  const result = await tool.execute(
    "call",
    { owner: "acme", repo: "widgets", number: 17, view: "files", limit: 1 },
    undefined,
    undefined,
  );
  const fullOutputPath = result.details.fullOutputPath as string;
  t.after(() => rm(fullOutputPath, { force: true }));

  assert.match(result.content[0].text, /Result limited at the extension's safety bound/);
  assert.match(result.content[0].text, /Full bounded output:/);
  const saved = await readFile(fullOutputPath, "utf8");
  assert.match(saved, /"filename": "src\/retry.ts"/);
  assert.doesNotMatch(saved, /Full bounded output:/);
  assert.equal((await stat(fullOutputPath)).mode & 0o777, 0o600);
});

test("saves fetched content and renders only its remote-content summary", async (t) => {
  const tools: Array<{
    name: string;
    execute: (...args: any[]) => Promise<any>;
    renderCall?: (...args: any[]) => any;
    renderResult?: (...args: any[]) => any;
  }> = [];
  const responses = [
    { private: false, visibility: "public", full_name: "acme/widgets", default_branch: "main" },
    { type: "file", size: 5, encoding: "base64", content: Buffer.from("hello").toString("base64") },
  ];
  const pi = {
    registerTool: (tool: {
      name: string;
      execute: (...args: any[]) => Promise<any>;
      renderCall?: (...args: any[]) => any;
      renderResult?: (...args: any[]) => any;
    }) => tools.push(tool),
    exec: async () => ({
      code: 0,
      stdout: JSON.stringify(responses.shift()),
      stderr: "",
      killed: false,
    }),
  } as unknown as ExtensionAPI;
  webAccessExtension(pi);
  const tool = tools.find((candidate) => candidate.name === "fetch_content");
  assert.ok(tool);
  const result = await tool.execute(
    "call",
    { url: "https://github.com/acme/widgets/blob/main/README.md" },
    undefined,
    undefined,
  );
  const fullOutputPath = result.details.fullOutputPath as string;
  t.after(() => rm(fullOutputPath, { force: true }));

  assert.match(result.content[0].text, /^\[Untrusted remote content follows\./);
  assert.match(result.content[0].text, /hello/);
  assert.equal(await readFile(fullOutputPath, "utf8"), result.content[0].text);
  assert.equal((await stat(fullOutputPath)).mode & 0o777, 0o600);

  assert.ok(tool.renderCall);
  assert.ok(tool.renderResult);
  const state = {};
  const context = {
    args: { url: "https://github.com/acme/widgets/blob/main/README.md" },
    argsComplete: true,
    executionStarted: true,
    expanded: false,
    isError: false,
    isPartial: false,
    lastComponent: undefined,
    state,
    toolCallId: "call",
  };
  const card = tool.renderCall(context.args, plainTheme, context);
  const collapsedResult = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    plainTheme,
    context,
  );
  const collapsed = card.render(240);
  assert.ok(collapsedResult instanceof EmptyToolResult);
  assert.equal(collapsed.length, 3);
  assert.match(collapsed[1] ?? "", /➔ Fetch Content ✓ \| URL: https:\/\/github\.com/);
  assert.doesNotMatch(collapsed.join("\n"), /Untrusted remote content/);

  context.expanded = true;
  const renderedResult = tool.renderResult(
    result,
    { expanded: true, isPartial: false },
    plainTheme,
    context,
  );
  const rendered = card.render(240).join("\n");

  assert.ok(renderedResult instanceof EmptyToolResult);
  assert.match(rendered, /➔ Fetch Content ✓/);
  assert.match(rendered, /URL: https:\/\/github\.com\/acme\/widgets\/blob\/main\/README\.md/);
  assert.match(rendered, /\[Untrusted remote content follows\./);
  assert.match(rendered, /# acme\/widgets: README\.md/);
  assert.match(rendered, /Source: https:\/\/github\.com\/acme\/widgets\/blob\/main\/README\.md/);
  assert.match(rendered, new RegExp(fullOutputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(rendered, /hello/);
});

test("renders hostile search citation metadata as escaped plain text", () => {
  const output = formatSearchSources([
    {
      title: "Source](https://evil.example)",
      url: "https://good.example/a)b",
      snippet: "[click me](https://evil.example)",
    },
  ]);
  assert.doesNotMatch(output, /\[Source\]\(https:\/\/evil\.example\)/);
  assert.doesNotMatch(output, /\[click me\]\(https:\/\/evil\.example\)/);
  assert.match(output, /https:\/\/good\.example\/a\)b/);
});

test("extracts HTML locally with Readability", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      "<!doctype html><html><head><title>Example</title></head><body><article><h1>Useful</h1><p>This is useful article content for the reader.</p></article></body></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    );
  const result = await fetchHttpContent("https://example.com/article", undefined, {
    fetch: fakeFetch,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  assert.match(result.content, /# Useful/);
  assert.match(result.content, /useful article content/);
});

test("reports the final URL and resolves relative HTML links", async () => {
  const fakeFetch: typeof fetch = async () => {
    const response = new Response(
      '<html><head><title>Moved</title></head><body><article><h1>Moved</h1><p>Read the <a href="/guide">guide page</a> for complete details.</p></article></body></html>',
      {
        status: 200,
        headers: { "content-type": "text/html" },
      },
    );
    Object.defineProperty(response, "url", { value: "https://docs.example.com/new/page" });
    return response;
  };
  const result = await fetchHttpContent("https://example.com/old", undefined, {
    fetch: fakeFetch,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  assert.equal(result.url, "https://docs.example.com/new/page");
  assert.match(result.content, /https:\/\/docs\.example\.com\/guide/);
});

test(
  "enforces the deadline when a response stream ignores cancellation",
  { timeout: 1_000 },
  async () => {
    let cancelled = false;
    const never = () => new Promise<void>(() => {});
    const body = new ReadableStream<Uint8Array>({
      pull: never,
      cancel() {
        cancelled = true;
        return never();
      },
    });
    const fakeFetch: typeof fetch = async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    await assert.rejects(
      () =>
        fetchHttpContent("https://example.com/stall", new AbortController().signal, {
          fetch: fakeFetch,
          lookup: async () => [{ address: "93.184.216.34", family: 4 }],
          timeoutMs: 20,
        }),
      /abort|timeout/i,
    );
    assert.equal(cancelled, true);
  },
);

test(
  "does not await non-settling cleanup after the response exceeds the byte limit",
  { timeout: 1_000 },
  async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    });
    const fakeFetch: typeof fetch = async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    await assert.rejects(
      () =>
        fetchHttpContent("https://example.com/large", new AbortController().signal, {
          fetch: fakeFetch,
          lookup: async () => [{ address: "93.184.216.34", family: 4 }],
          timeoutMs: 200,
        }),
      /exceeds 5MB limit/,
    );
    assert.equal(cancelled, true);
  },
);

test(
  "does not await non-settling cleanup of unread HTTP error bodies",
  { timeout: 1_000 },
  async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("error body"));
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    });
    const fakeFetch: typeof fetch = async () =>
      new Response(body, {
        status: 500,
        statusText: "Failure",
        headers: { "content-type": "text/plain" },
      });
    await assert.rejects(
      () =>
        fetchHttpContent("https://example.com/failure", undefined, {
          fetch: fakeFetch,
          lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        }),
      /HTTP 500/,
    );
    assert.equal(cancelled, true);
  },
);

test("returns a clear error when Readability cannot extract HTML", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("<html><body><script>app()</script></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  await assert.rejects(
    () =>
      fetchHttpContent("https://example.com/app", undefined, {
        fetch: fakeFetch,
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      }),
    /Could not extract readable content|no usable content/,
  );
});

test("parses OpenAI streaming responses", async () => {
  const stream = [
    "data: " +
      JSON.stringify({
        type: "response.output_item.done",
        item: { type: "message", content: [{ text: "answer", annotations: [] }] },
      }),
    "data: [DONE]",
  ].join("\n");
  const parsed = await parseOpenAIResponse(new Response(stream));
  assert.deepEqual(parsed.output, [
    { type: "message", content: [{ text: "answer", annotations: [] }] },
  ]);
});

test("caps OpenAI response buffering", async () => {
  await assert.rejects(
    () => parseOpenAIResponse(new Response("x".repeat(5 * 1024 * 1024 + 1))),
    /OpenAI response exceeds 5MB limit/,
  );
});
