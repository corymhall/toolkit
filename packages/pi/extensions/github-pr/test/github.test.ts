import assert from "node:assert/strict";
import { test } from "node:test";
import { createGitHubClient, GitHubError, type Execute } from "../github.ts";
import { clean, latestChecks, parseTarget, restoreWatches } from "../model.ts";

const target = parseTarget("https://github.com/acme/widget/pull/42");
const head = "a".repeat(40);
const signal = () => new AbortController().signal;
function page(nodes: object[], hasNextPage = false, endCursor: string | null = null, sha = head) {
  return {
    data: {
      repository: {
        pullRequest: {
          title: "Fix widget",
          state: "OPEN",
          isDraft: true,
          headRefName: "fix",
          headRefOid: sha,
          reviewDecision: "REVIEW_REQUIRED",
          mergeStateStatus: "BLOCKED",
          commits: {
            nodes: [
              {
                commit: {
                  oid: sha,
                  statusCheckRollup: { contexts: { nodes, pageInfo: { hasNextPage, endCursor } } },
                },
              },
            ],
          },
        },
      },
    },
  };
}
function check(id: number, status: string, conclusion: string | null, workflow = "CI") {
  return {
    __typename: "CheckRun",
    databaseId: id,
    name: "test",
    status,
    conclusion,
    startedAt: status === "QUEUED" ? null : "2026-01-01T10:00:00Z",
    detailsUrl: `https://github.com/acme/widget/actions/runs/10/job/${id}`,
    checkSuite: {
      databaseId: 1,
      app: { slug: "github-actions" },
      workflowRun: { databaseId: 10, workflow: { id: `workflow-${workflow}`, name: workflow } },
    },
  };
}

test("paginated check contexts retain distinct workflows and pending reruns supersede old failures", async () => {
  const calls: string[][] = [];
  const execute: Execute = async (command, args) => {
    assert.equal(command, "gh");
    calls.push(args);
    if (args.includes("graphql"))
      return JSON.stringify(
        args.includes("cursor=next")
          ? page([check(12, "QUEUED", null), check(11, "COMPLETED", "SUCCESS", "Release")])
          : page([check(10, "COMPLETED", "FAILURE")], true, "next"),
      );
    assert.ok(args.includes("GET"));
    return JSON.stringify({ head: { sha: head }, state: "open", merged: false });
  };
  const snapshot = await createGitHubClient("/tmp", execute).snapshot(target, signal());
  assert.equal(calls.length, 3);
  assert.deepEqual(
    snapshot.checks.map((c) => [c.name, c.state]),
    [
      ["CI / test", "pending"],
      ["Release / test", "passed"],
    ],
  );
  assert.equal(snapshot.checks[0].jobId, 12);
});

test("distinct workflows with the same display name cannot hide one another's failures", async () => {
  const failed = check(10, "COMPLETED", "FAILURE");
  const passed = check(11, "COMPLETED", "SUCCESS");
  passed.checkSuite.workflowRun.workflow.id = "another-workflow";
  const client = createGitHubClient("/tmp", async (_command, args) =>
    JSON.stringify(
      args.includes("graphql")
        ? page([failed, passed])
        : { head: { sha: head }, state: "open", merged: false },
    ),
  );
  const snapshot = await client.snapshot(target, signal());
  assert.deepEqual(
    snapshot.checks.map((c) => c.state),
    ["failed", "passed"],
  );
});

test("head movement during check pagination rejects the incomplete observation", async () => {
  const execute: Execute = async (_command, args) =>
    JSON.stringify(
      args.includes("cursor=next")
        ? page([], false, null, "b".repeat(40))
        : page([check(1, "COMPLETED", "SUCCESS")], true, "next"),
    );
  await assert.rejects(
    createGitHubClient("/tmp", execute).snapshot(target, signal()),
    (e: unknown) => e instanceof GitHubError && e.transient,
  );
});

test("unknown check conclusions remain pending; an unknown status cannot hide a known failure", async () => {
  const execute: Execute = async (_command, args) =>
    JSON.stringify(
      args.includes("graphql")
        ? page([
            check(1, "COMPLETED", "NEW_GITHUB_CONCLUSION"),
            {
              __typename: "StatusContext",
              id: "context",
              context: "external",
              state: "ERROR",
              targetUrl: "https://ci.example/test",
            },
          ])
        : { head: { sha: head }, state: "open", merged: false },
    );
  const snapshot = await createGitHubClient("/tmp", execute).snapshot(target, signal());
  assert.deepEqual(
    snapshot.checks.map((c) => c.state),
    ["pending", "failed"],
  );
});

test("a workflow rerun during job collection rejects the stale attempt", async () => {
  const target = parseTarget("https://github.com/acme/widget/actions/runs/10");
  let attempt = 1;
  const execute: Execute = async (_command, args) => {
    const path = args.at(-1)!;
    if (path.includes("/jobs?")) {
      attempt = 2;
      return JSON.stringify({ jobs: [], total_count: 0 });
    }
    return JSON.stringify({
      head_sha: head,
      run_attempt: attempt,
      status: "in_progress",
      conclusion: null,
      display_title: "Release",
    });
  };
  await assert.rejects(
    createGitHubClient("/tmp", execute).snapshot(target, signal()),
    /Workflow changed/,
  );
});

test("discovery clears the old target before fetching a changed branch and caches GitHub lookups", async () => {
  let branch = "main";
  let ghCalls = 0;
  let clears = 0;
  const client = createGitHubClient(
    "/tmp",
    async (command) => {
      if (command === "git") return `/repo\n${head}\nrefs/heads/${branch}`;
      ghCalls++;
      if (branch === "other") assert.equal(clears, 2);
      return JSON.stringify({ url: target.url });
    },
    () => 100_000,
  );
  await client.discover(signal(), () => clears++);
  await client.discover(signal(), () => clears++);
  assert.equal(ghCalls, 1);
  branch = "other";
  await client.discover(signal(), () => clears++);
  assert.equal(ghCalls, 2);
});

test("a branch change during discovery cannot select the previous branch's PR", async () => {
  let branch = "old";
  const client = createGitHubClient("/tmp", async (command) => {
    if (command === "git") return `/repo\n${head}\nrefs/heads/${branch}`;
    if (branch === "old") {
      branch = "new";
      return JSON.stringify({ url: target.url });
    }
    return JSON.stringify({ url: "https://github.com/acme/widget/pull/43" });
  });
  await assert.rejects(
    client.discover(signal(), () => {}),
    /changed during PR discovery/,
  );
  const discovered = await client.discover(signal(), () => {});
  assert.equal(discovered?.url, "https://github.com/acme/widget/pull/43");
});

test("saved intent and targets cannot introduce arbitrary network destinations", () => {
  assert.throws(() => parseTarget("https://github.com.evil.example/acme/widget/pull/42"));
  assert.throws(() => parseTarget("https://github.com/acme/widget/pull/42?command=merge"));
  assert.throws(() => parseTarget("https://github.com/acme/../pull/42"));
  assert.deepEqual(
    restoreWatches({
      version: 1,
      watches: [
        {
          target: { url: "file:///tmp/secret" },
          head,
          startedAt: 1,
          deadline: 100,
          status: "watching",
        },
      ],
    }),
    [],
  );
  assert.equal(clean("hello\x1b]52;c;ZXhmaWx0cmF0ZQ==\x07\x1b[31mworld\x1b[0m"), "helloworld");
});

test("external contexts select the newest status without treating skipped checks as passes", () => {
  const latest = latestChecks([
    {
      key: "external",
      execution: "old",
      name: "external",
      state: "failed",
      completedAt: "2026-01-01T10:00:00Z",
    },
    {
      key: "external",
      execution: "new",
      name: "external",
      state: "skipped",
      completedAt: "2026-01-01T11:00:00Z",
    },
  ]);
  assert.equal(latest[0].state, "skipped");
});
