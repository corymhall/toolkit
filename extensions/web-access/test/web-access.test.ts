import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import webAccessExtension, { formatSearchSources } from "../index.ts";
import { fetchGitHubContent, parseGitHubUrl } from "../github.ts";
import { buildGitHubSearchQuery, searchGitHub } from "../github-search.ts";
import { fetchHttpContent } from "../http.ts";
import { parseOpenAIResponse, searchWithCodex } from "../openai-search.ts";
import { createPinnedRequestOptions, fetchRemoteUrl, requestPinnedUrl, validateRemoteUrl } from "../ssrf.ts";

test("drops provider header deletion markers before Codex web search", async () => {
  const ctx = {
    modelRegistry: {
      find(provider: string, modelId: string) {
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
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-keep"), "value");
    assert.equal(headers.has("x-delete"), false);
    return new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: "answer" }] }],
    }), { status: 200 });
  };

  const result = await searchWithCodex("query", {}, ctx, fetchImpl);
  assert.equal(result.answer, "answer");
});

test("parses supported GitHub URLs and rejects unrelated pages", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/acme/widgets"), {
    owner: "acme", repo: "widgets", kind: "repo",
  });
  assert.deepEqual(parseGitHubUrl("https://github.com/acme/widgets/blob/main/src/a.ts"), {
    owner: "acme", repo: "widgets", kind: "blob", ref: "main", path: "src/a.ts",
  });
  assert.equal(parseGitHubUrl("https://github.com/acme/widgets/issues/1"), null);
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
  const result = await fetchGitHubContent("https://github.com/acme/widgets/blob/main/README.md", pi);
  assert.equal(result?.content, "hello");
  assert.equal(calls[0][0], "gh");
  assert.deepEqual(calls[0].slice(0, 4), ["gh", "api", "--hostname", "github.com"]);
  assert.match(calls[1][4], /^repos\/acme\/widgets\/contents\/README\.md\?ref=main$/);
  assert.equal(calls.flat().includes("clone"), false);
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
  await assert.rejects(() => validateRemoteUrl("http://127.0.0.1/test"), /Blocked non-public address/);
  await assert.rejects(
    () => validateRemoteUrl("https://internal.example/test", async () => [{ address: "10.0.0.1", family: 4 }]),
    /Blocked non-public address/,
  );
  for (const address of ["ff02::1", "64:ff9b::7f00:1", "2002:7f00:1::", "fec0::1", "::ffff:127.0.0.1", "4000::1"]) {
    await assert.rejects(() => validateRemoteUrl(`http://[${address}]/test`), /Blocked non-public address/);
  }
  await assert.rejects(() => validateRemoteUrl("https://user:secret@example.com/test"), /containing credentials/);
  assert.equal((await validateRemoteUrl("https://public.example/test", async () => [{ address: "2606:4700:4700::1111", family: 6 }])).hostname, "public.example");
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

test("streams pinned HTTP response bodies under the active runtime", async t => {
  const server = http.createServer((request, response) => {
    assert.match(request.headers.host ?? "", /^public\.example:/);
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("stream completed");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
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
    () => fetchRemoteUrl("https://public.example/content", { signal }, {
      lookup: async () => new Promise(() => {}),
    }),
    error => error === signal.reason,
  );
});

test("aborts a pinned response body that stops making progress", async t => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.flushHeaders();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const signal = AbortSignal.timeout(50);

  const remote = await requestPinnedUrl(
    new URL(`http://public.example:${address.port}/stall`),
    [{ address: "127.0.0.1", family: 4 }],
    { signal },
  );
  try {
    await assert.rejects(() => remote.response.text(), error => error === signal.reason || /abort|timeout/i.test(String(error)));
  } finally {
    await remote.close();
  }
});

test("rejects redirects to private addresses before the second fetch", async () => {
  let fetchCalls = 0;
  const fakeFetch: typeof fetch = async () => {
    fetchCalls++;
    return new Response("", { status: 302, headers: { location: "http://internal.example/secret" } });
  };
  await assert.rejects(() => fetchRemoteUrl("https://example.com/start", {}, {
    fetch: fakeFetch,
    lookup: async hostname => [{ address: hostname === "internal.example" ? "10.0.0.2" : "93.184.216.34", family: 4 }],
  }), /Blocked non-public address/);
  assert.equal(fetchCalls, 1);
});

test("fetches private GitHub repositories available to gh", async () => {
  const calls: string[][] = [];
  const responses = [
    { private: true, visibility: "private", full_name: "acme/private", default_branch: "main" },
    { type: "file", size: 6, encoding: "base64", content: Buffer.from("secret").toString("base64") },
  ];
  const pi = {
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return { code: 0, stdout: JSON.stringify(responses.shift()), stderr: "", killed: false };
    },
  } as unknown as ExtensionAPI;
  const result = await fetchGitHubContent("https://github.com/acme/private/blob/main/README.md", pi);
  assert.equal(result?.content, "secret");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].slice(0, 4), ["gh", "api", "--hostname", "github.com"]);
});

test("builds GitHub API search queries from structured scope and filters", () => {
  assert.equal(buildGitHubSearchQuery({
    kind: "pull_requests",
    query: "timeout waiter",
    repos: ["pulumi/pulumi-aws"],
    owners: ["pulumi"],
    state: "closed",
    labels: ["kind/bug"],
    language: "go",
  }), 'timeout waiter is:pr repo:"pulumi/pulumi-aws" user:"pulumi" state:closed label:"kind/bug" language:"go"');
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
          items: [{
            repository_url: "https://api.github.com/repos/acme/widgets",
            number: 42,
            title: "Fix timeout",
            state: "open",
            labels: [{ name: "bug" }],
            user: { login: "octocat" },
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
            html_url: "https://github.com/acme/widgets/issues/42",
          }],
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
  assert.match(decodeURIComponent(calls[0][4]), /^search\/issues\?q=timeout is:issue repo:"acme\/widgets" state:open&per_page=10$/);
  assert.equal(result.details.totalCount, 3);
  assert.equal(result.details.resultCount, 1);
  assert.match(result.fetched.content, /"returnedCount": 1/);
  assert.match(result.fetched.content, /"repository": "acme\/widgets"/);
  assert.match(result.fetched.content, /"number": 42/);
  assert.doesNotMatch(result.fetched.content, /body/);
});

test("registers compact renderers for the intended tools and describes fetch_content boundaries", () => {
  const tools: Array<{
    name: string;
    description: string;
    executionMode?: "parallel" | "sequential";
    renderResult?: (...args: any[]) => any;
  }> = [];
  webAccessExtension({ registerTool: tool => tools.push(tool) } as unknown as ExtensionAPI);
  assert.deepEqual(tools.map(tool => tool.name), ["web_search", "github_search", "fetch_content"]);
  assert.equal(tools.every(tool => typeof tool.renderResult === "function"), true);
  const fetchContent = tools.find(tool => tool.name === "fetch_content");
  assert.equal(fetchContent?.executionMode, "sequential");
  assert.match(fetchContent?.description ?? "", /do not use this tool for GitHub issues, pull requests, commits, releases/);
});

test("labels GitHub code search results as untrusted and bounds fragments", async t => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const calls: string[][] = [];
  const pi = {
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.push(tool),
    async exec(command: string, args: string[]) {
      calls.push([command, ...args]);
      return {
        code: 0,
        stdout: JSON.stringify({
          total_count: 1,
          incomplete_results: false,
          items: [{
            repository: { full_name: "acme/private" },
            path: "src/index.ts",
            sha: "abc123",
            html_url: "https://github.com/acme/private/blob/abc123/src/index.ts",
            text_matches: [{ fragment: "x".repeat(800) }],
          }],
        }),
        stderr: "",
        killed: false,
      };
    },
  } as unknown as ExtensionAPI;
  webAccessExtension(pi);
  const tool = tools.find(candidate => candidate.name === "github_search");
  assert.ok(tool);
  const result = await tool.execute("call", {
    kind: "code",
    query: "searchGitHub",
    repos: ["acme/private"],
    path: "src",
    limit: 5,
  }, undefined, undefined);
  const fullOutputPath = result.details.fullOutputPath as string;
  t.after(() => rm(fullOutputPath, { force: true }));
  assert.match(decodeURIComponent(calls[0][4]), /^search\/code\?q=/);
  assert.match(result.content[0].text, /^\[Untrusted remote content follows\./);
  assert.match(result.content[0].text, /"repository": "acme\/private"/);
  assert.doesNotMatch(result.content[0].text, /x{501}/);
  assert.equal(await readFile(fullOutputPath, "utf8"), result.content[0].text);
});

test("saves fetched content and renders only its remote-content summary", async t => {
  const tools: Array<{
    name: string;
    execute: (...args: any[]) => Promise<any>;
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
      renderResult?: (...args: any[]) => any;
    }) => tools.push(tool),
    exec: async () => ({ code: 0, stdout: JSON.stringify(responses.shift()), stderr: "", killed: false }),
  } as unknown as ExtensionAPI;
  webAccessExtension(pi);
  const tool = tools.find(candidate => candidate.name === "fetch_content");
  assert.ok(tool);
  const result = await tool.execute("call", { url: "https://github.com/acme/widgets/blob/main/README.md" }, undefined, undefined);
  const fullOutputPath = result.details.fullOutputPath as string;
  t.after(() => rm(fullOutputPath, { force: true }));

  assert.match(result.content[0].text, /^\[Untrusted remote content follows\./);
  assert.match(result.content[0].text, /hello/);
  assert.equal(await readFile(fullOutputPath, "utf8"), result.content[0].text);
  assert.equal((await stat(fullOutputPath)).mode & 0o777, 0o600);

  assert.ok(tool.renderResult);
  const rendered = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    { fg: (_color: string, text: string) => text },
    { isError: false },
  ).render(240).join("\n");
  assert.match(rendered, /^\[Untrusted remote content follows\./);
  assert.match(rendered, /# acme\/widgets: README\.md/);
  assert.match(rendered, /Source: https:\/\/github\.com\/acme\/widgets\/blob\/main\/README\.md/);
  assert.match(rendered, new RegExp(fullOutputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(rendered, /hello/);
});

test("renders hostile search citation metadata as escaped plain text", () => {
  const output = formatSearchSources([{
    title: "Source](https://evil.example)",
    url: "https://good.example/a)b",
    snippet: "[click me](https://evil.example)",
  }]);
  assert.doesNotMatch(output, /\[Source\]\(https:\/\/evil\.example\)/);
  assert.doesNotMatch(output, /\[click me\]\(https:\/\/evil\.example\)/);
  assert.match(output, /https:\/\/good\.example\/a\)b/);
});

test("extracts HTML locally with Readability", async () => {
  const fakeFetch: typeof fetch = async () => new Response(
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
    const response = new Response("<html><head><title>Moved</title></head><body><article><h1>Moved</h1><p>Read the <a href=\"/guide\">guide page</a> for complete details.</p></article></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
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

test("enforces the deadline when a response stream ignores cancellation", { timeout: 1_000 }, async () => {
  let cancelled = false;
  const never = () => new Promise<void>(() => {});
  const body = new ReadableStream<Uint8Array>({
    pull: never,
    cancel() {
      cancelled = true;
      return never();
    },
  });
  const fakeFetch: typeof fetch = async () => new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
  await assert.rejects(() => fetchHttpContent("https://example.com/stall", new AbortController().signal, {
    fetch: fakeFetch,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    timeoutMs: 20,
  }), /abort|timeout/i);
  assert.equal(cancelled, true);
});

test("does not await non-settling cleanup after the response exceeds the byte limit", { timeout: 1_000 }, async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); },
    cancel() {
      cancelled = true;
      return new Promise<void>(() => {});
    },
  });
  const fakeFetch: typeof fetch = async () => new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
  await assert.rejects(() => fetchHttpContent("https://example.com/large", new AbortController().signal, {
    fetch: fakeFetch,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    timeoutMs: 200,
  }), /exceeds 5MB limit/);
  assert.equal(cancelled, true);
});

test("does not await non-settling cleanup of unread HTTP error bodies", { timeout: 1_000 }, async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("error body")); },
    cancel() {
      cancelled = true;
      return new Promise<void>(() => {});
    },
  });
  const fakeFetch: typeof fetch = async () => new Response(body, { status: 500, statusText: "Failure", headers: { "content-type": "text/plain" } });
  await assert.rejects(() => fetchHttpContent("https://example.com/failure", undefined, {
    fetch: fakeFetch,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  }), /HTTP 500/);
  assert.equal(cancelled, true);
});

test("returns a clear error when Readability cannot extract HTML", async () => {
  const fakeFetch: typeof fetch = async () => new Response("<html><body><script>app()</script></body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
  await assert.rejects(
    () => fetchHttpContent("https://example.com/app", undefined, {
      fetch: fakeFetch,
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    }),
    /Could not extract readable content|no usable content/,
  );
});

test("parses OpenAI streaming responses", async () => {
  const stream = [
    "data: " + JSON.stringify({
      type: "response.output_item.done",
      item: { type: "message", content: [{ text: "answer", annotations: [] }] },
    }),
    "data: [DONE]",
  ].join("\n");
  const parsed = await parseOpenAIResponse(new Response(stream));
  assert.deepEqual(parsed.output, [{ type: "message", content: [{ text: "answer", annotations: [] }] }]);
});

test("caps OpenAI response buffering", async () => {
  await assert.rejects(
    () => parseOpenAIResponse(new Response("x".repeat(5 * 1024 * 1024 + 1))),
    /OpenAI response exceeds 5MB limit/,
  );
});
