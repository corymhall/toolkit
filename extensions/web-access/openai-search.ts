import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SearchOptions, SearchResponse, SearchResult } from "./types.ts";

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const SEARCH_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CODEX_MODELS = ["gpt-5.4", "gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2", "gpt-5.2-codex"];

interface CodexAuth {
  apiKey: string;
  model: string;
  headers: Record<string, string>;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function extractAccountId(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  const auth = payload?.["https://api.openai.com/auth"];
  if (!auth || typeof auth !== "object") return undefined;
  const id = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

async function resolveCodexAuth(ctx: ExtensionContext): Promise<CodexAuth> {
  const { getModel } = await import("@earendil-works/pi-ai/compat");
  for (const modelId of CODEX_MODELS) {
    const model = getModel("openai-codex", modelId);
    if (!model) continue;
    try {
      const resolved = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (resolved.ok && resolved.apiKey) {
        return { apiKey: resolved.apiKey, model: modelId, headers: resolved.headers ?? {} };
      }
    } catch {
      // Try the next currently supported Codex model.
    }
  }
  throw new Error("OpenAI web search requires a Pi OpenAI Codex subscription login. Run /login and select OpenAI Codex.");
}

function normalizeDomain(raw: string): string | null {
  let input = raw.trim().toLowerCase();
  if (input.startsWith("-")) input = input.slice(1).trim();
  if (!input) return null;
  try {
    input = new URL(input.includes("://") ? input : `https://${input}`).hostname;
  } catch {
    return null;
  }
  input = input.replace(/^\.+|\.+$/g, "");
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(input) ? input : null;
}

function domainFilters(values: string[] | undefined): { allowed_domains?: string[]; blocked_domains?: string[] } | undefined {
  if (!values?.length) return undefined;
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const raw of values) {
    const domain = normalizeDomain(raw);
    if (!domain) continue;
    const target = raw.trim().startsWith("-") ? blocked : allowed;
    if (!target.includes(domain)) target.push(domain);
  }
  if (!allowed.length && !blocked.length) return undefined;
  return {
    ...(allowed.length ? { allowed_domains: allowed.slice(0, 100) } : {}),
    ...(blocked.length ? { blocked_domains: blocked.slice(0, 100) } : {}),
  };
}

function instructions(options: SearchOptions): string {
  const lines = [
    "Search the web and return a concise answer grounded only in the web results.",
    "Include clickable source citations in the response text when possible.",
  ];
  if (options.recencyFilter) {
    const labels = { day: "past 24 hours", week: "past week", month: "past month", year: "past year" } as const;
    lines.push(`Prefer sources from the ${labels[options.recencyFilter]}.`);
  }
  if (options.numResults) lines.push(`Prefer around ${Math.min(Math.floor(options.numResults), 20)} distinct sources.`);
  return lines.join(" ");
}

async function readResponseText(response: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error(`OpenAI response exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit`);
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}

export async function parseOpenAIResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await readResponseText(response);
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? { output: parsed } : parsed as Record<string, unknown>;
  }

  const outputItems: unknown[] = [];
  let completed: Record<string, unknown> | null = null;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as Record<string, unknown>;
      if (event.type === "response.output_item.done" && event.item) outputItems.push(event.item);
      if ((event.type === "response.done" || event.type === "response.completed") && event.response && typeof event.response === "object") {
        completed = event.response as Record<string, unknown>;
      }
    } catch {
      // Ignore non-JSON stream lines.
    }
  }
  if (completed) {
    return Array.isArray(completed.output) && completed.output.length ? completed : { ...completed, output: outputItems };
  }
  if (outputItems.length) return { output: outputItems };
  throw new Error("OpenAI returned no parseable response output");
}

function cleanUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.searchParams.get("utm_source") === "openai") url.searchParams.delete("utm_source");
    return url.toString();
  } catch {
    return null;
  }
}

function extractResponse(output: unknown[], limit: number | undefined): SearchResponse {
  const answerParts: string[] = [];
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  const add = (urlValue: unknown, titleValue: unknown, snippet = "") => {
    if (typeof urlValue !== "string" || !urlValue.trim()) return;
    const url = cleanUrl(urlValue);
    if (!url || seen.has(url)) return;
    seen.add(url);
    results.push({ title: typeof titleValue === "string" && titleValue.trim() ? titleValue : url, url, snippet });
  };

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type === "message" && Array.isArray(record.content)) {
      for (const part of record.content) {
        if (!part || typeof part !== "object") continue;
        const content = part as Record<string, unknown>;
        const text = typeof content.text === "string" ? content.text : "";
        if (text.trim()) answerParts.push(text);
        if (!Array.isArray(content.annotations)) continue;
        for (const annotation of content.annotations) {
          if (!annotation || typeof annotation !== "object") continue;
          const citation = annotation as Record<string, unknown>;
          if (citation.type === "url_citation") add(citation.url, citation.title);
        }
      }
    }
    if (record.type === "web_search_call") {
      const action = record.action && typeof record.action === "object" ? record.action as Record<string, unknown> : {};
      for (const group of [action.sources, record.sources, record.results]) {
        if (!Array.isArray(group)) continue;
        for (const source of group) {
          if (!source || typeof source !== "object") continue;
          const value = source as Record<string, unknown>;
          add(value.url ?? value.source_website_url, value.title ?? value.caption);
        }
      }
    }
  }

  const max = limit && Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 20) : 20;
  return { answer: answerParts.join("\n").trim(), results: results.slice(0, max) };
}

export async function searchWithCodex(query: string, options: SearchOptions, ctx: ExtensionContext): Promise<SearchResponse> {
  const auth = await resolveCodexAuth(ctx);
  const headers: Record<string, string> = {
    ...auth.headers,
    Authorization: `Bearer ${auth.apiKey}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "responses=experimental",
    originator: "pi",
  };
  const accountId = extractAccountId(auth.apiKey);
  if (accountId) headers["chatgpt-account-id"] = accountId;

  const filters = domainFilters(options.domainFilter);
  const body = {
    model: auth.model,
    instructions: instructions(options),
    input: [{ role: "user", content: [{ type: "input_text", text: query }] }],
    tools: [{ type: "web_search", ...(filters ? { filters } : {}) }],
    include: ["web_search_call.action.sources"],
    store: false,
    stream: true,
    tool_choice: "required",
    parallel_tool_calls: true,
  };
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(CODEX_RESPONSES_URL, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const error = (await readResponseText(response, 64 * 1024)).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`OpenAI Codex web search failed (${response.status}): ${error}`);
  }
  const parsed = await parseOpenAIResponse(response);
  const output = Array.isArray(parsed.output) ? parsed.output : [];
  const result = extractResponse(output, options.numResults);
  if (!result.answer && !result.results.length) throw new Error("OpenAI Codex web search returned no answer or sources");
  return result;
}
