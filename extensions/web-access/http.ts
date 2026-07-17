import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { fetchRemoteUrl, type Lookup, waitWithSignal } from "./ssrf.ts";
import type { FetchedContent } from "./types.ts";

const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

interface HttpFetchOptions {
  fetch?: typeof fetch;
  lookup?: Lookup;
  timeoutMs?: number;
}

async function readBody(response: Response, maxBytes: number, signal?: AbortSignal): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  const onAbort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await waitWithSignal(reader.read(), signal);
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new Error(`Response exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit`);
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try { reader.releaseLock(); } catch { /* An uncooperative stream may still have a pending read after abort. */ }
  }
}

function titleFromText(text: string, url: URL): string {
  const heading = text.match(/^#{1,2}\s+(.+)/m)?.[1]?.replace(/\*+/g, "").trim();
  return heading || url.pathname.split("/").filter(Boolean).pop() || url.hostname;
}

export async function fetchHttpContent(raw: string, signal?: AbortSignal, options: HttpFetchOptions = {}): Promise<FetchedContent> {
  // Bun's AbortSignal.timeout() timer can remain unref'ed while a Web Stream read is
  // pending. Use a normal timer so the deadline always fires under standalone Pi.
  const deadline = new AbortController();
  const timeoutId = setTimeout(() => {
    deadline.abort(new DOMException("The operation timed out", "TimeoutError"));
  }, options.timeoutMs ?? TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  let remote: Awaited<ReturnType<typeof fetchRemoteUrl>> | undefined;

  try {
    remote = await fetchRemoteUrl(raw, {
      signal: combinedSignal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; pi-web-access/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1",
      },
    }, { fetch: options.fetch, lookup: options.lookup });
    const { response } = remote;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new Error(`Response exceeds ${Math.round(MAX_RESPONSE_BYTES / 1024 / 1024)}MB limit`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
    const isText = contentType.startsWith("text/") ||
      contentType.includes("application/json") ||
      contentType.includes("application/xml") ||
      contentType.includes("application/javascript") ||
      contentType.includes("application/x-javascript");
    if (!isHtml && !isText) {
      throw new Error(`Unsupported content type: ${contentType.split(";")[0] || "unknown"}`);
    }

    const text = await readBody(response, MAX_RESPONSE_BYTES, combinedSignal);
    const finalUrl = new URL(response.url || raw);
    if (!isHtml) return { url: finalUrl.toString(), title: titleFromText(text, finalUrl), content: text, truncated: false };

    const { document } = parseHTML(text);
    for (const element of document.querySelectorAll("a[href], img[src]")) {
      const attribute = element.hasAttribute("href") ? "href" : "src";
      const value = element.getAttribute(attribute);
      if (!value) continue;
      try { element.setAttribute(attribute, new URL(value, finalUrl).toString()); } catch { element.removeAttribute(attribute); }
    }
    const article = new Readability(document as unknown as Document).parse();
    if (!article?.content) throw new Error("Could not extract readable content from HTML");
    const markdown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" }).turndown(article.content).trim();
    if (!markdown) throw new Error("Readability extracted no usable content from HTML");
    return { url: finalUrl.toString(), title: article.title?.trim() || finalUrl.hostname, content: markdown, truncated: false };
  } finally {
    clearTimeout(timeoutId);
    if (remote) {
      // Never await cancellation: some Bun/Web Stream adapters leave the cancel promise pending.
      void remote.response.body?.cancel().catch(() => {});
      await remote.close();
    }
  }
}
