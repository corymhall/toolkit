import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import webAccessExtension, { formatSearchSources } from "../index.ts";
import { fetchGitHubContent, parseGitHubUrl } from "../github.ts";
import { fetchHttpContent } from "../http.ts";
import { parseOpenAIResponse } from "../openai-search.ts";
import { createPinnedDispatcher, fetchRemoteUrl, validateRemoteUrl } from "../ssrf.ts";

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

test("loads the real npm undici dispatcher under Bun and Node", async () => {
  const dispatcher = createPinnedDispatcher((_hostname, _options, callback) => {
    callback(new Error("lookup should not run"));
  });
  assert.equal(typeof dispatcher.dispatch, "function");
  assert.equal(typeof dispatcher.close, "function");
  await dispatcher.close();
});

test("closes the dispatcher when initial validation fails", async () => {
  let closed = false;
  const dispatcher = { close: async () => { closed = true; } };
  await assert.rejects(() => fetchRemoteUrl("http://127.0.0.1/test", {}, {
    agentFactory: () => dispatcher as any,
  }), /Blocked non-public address/);
  assert.equal(closed, true);
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

test("registers exactly the two intended Pi tools", () => {
  const tools: Array<{ name: string }> = [];
  webAccessExtension({ registerTool: tool => tools.push(tool) } as unknown as ExtensionAPI);
  assert.deepEqual(tools.map(tool => tool.name), ["web_search", "fetch_content"]);
});

test("labels fetched GitHub content as untrusted", async () => {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const responses = [
    { private: false, visibility: "public", full_name: "acme/widgets", default_branch: "main" },
    { type: "file", size: 5, encoding: "base64", content: Buffer.from("hello").toString("base64") },
  ];
  const pi = {
    registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.push(tool),
    exec: async () => ({ code: 0, stdout: JSON.stringify(responses.shift()), stderr: "", killed: false }),
  } as unknown as ExtensionAPI;
  webAccessExtension(pi);
  const tool = tools.find(candidate => candidate.name === "fetch_content");
  assert.ok(tool);
  const result = await tool.execute("call", { url: "https://github.com/acme/widgets/blob/main/README.md" }, undefined, undefined);
  assert.match(result.content[0].text, /^\[Untrusted remote content follows\./);
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

test("cancels unread HTTP error bodies", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("error body")); },
    cancel() { cancelled = true; },
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
