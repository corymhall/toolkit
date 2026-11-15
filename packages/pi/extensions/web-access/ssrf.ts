import { lookup as dnsLookup } from "node:dns/promises";
import http, { type IncomingMessage } from "node:http";
import https, { type RequestOptions as HttpsRequestOptions } from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import ipaddr from "ipaddr.js";

export type LookupAddress = { address: string; family: number };
export type Lookup = (hostname: string) => Promise<LookupAddress[]>;

interface FetchOptions {
  fetch?: typeof fetch;
  lookup?: Lookup;
  maxRedirects?: number;
}

export interface RemoteResponse {
  response: Response;
  close: () => Promise<void>;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function normalizeHostname(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function assertPublic(address: string, hostname: string): void {
  const normalized = normalizeHostname(address);
  if (!net.isIP(normalized)) throw new Error(`Resolved non-IP address for ${hostname}: ${address}`);
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(normalized);
  } catch {
    throw new Error(`Resolved invalid IP address for ${hostname}: ${address}`);
  }
  const globallyRoutable =
    parsed.kind() === "ipv4"
      ? parsed.range() === "unicast"
      : parsed.range() === "unicast" && parsed.match(ipaddr.IPv6.parse("2000::"), 3);
  if (!globallyRoutable)
    throw new Error(`Blocked non-public address for ${hostname}: ${normalized}`);
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

export async function waitWithSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw abortError(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function resolveValidatedUrl(
  raw: string | URL,
  lookup?: Lookup,
  signal?: AbortSignal | null,
): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const url = raw instanceof URL ? raw : new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only HTTP and HTTPS URLs are supported");
  if (url.username || url.password)
    throw new Error("URLs containing credentials are not supported");
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) throw new Error("URL must include a hostname");
  if (hostname === "localhost" || hostname.endsWith(".localhost"))
    throw new Error(`Blocked internal hostname: ${hostname}`);
  const version = net.isIP(hostname);
  const addresses = version
    ? [{ address: hostname, family: version }]
    : await waitWithSignal(
        (lookup ?? ((host) => dnsLookup(host, { all: true, verbatim: true })))(hostname),
        signal,
      );
  if (!addresses.length) throw new Error(`Failed to resolve ${hostname}: no addresses returned`);
  for (const { address } of addresses) assertPublic(address, hostname);
  return { url, addresses };
}

export async function validateRemoteUrl(raw: string | URL, lookup?: Lookup): Promise<URL> {
  return (await resolveValidatedUrl(raw, lookup)).url;
}

export function createPinnedRequestOptions(
  url: URL,
  address: LookupAddress,
  init: RequestInit = {},
): HttpsRequestOptions {
  if (init.body != null) throw new Error("HTTP request bodies are not supported");
  const headers = new Headers(init.headers);
  headers.set("host", url.host);
  return {
    protocol: url.protocol,
    hostname: address.address,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: init.method ?? "GET",
    headers: Object.fromEntries(headers),
    agent: false,
    ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
  };
}

function responseHeaders(message: IncomingMessage): Headers {
  const headers = new Headers();
  for (let index = 0; index < message.rawHeaders.length; index += 2) {
    headers.append(message.rawHeaders[index], message.rawHeaders[index + 1]);
  }
  return headers;
}

/** The caller must validate every address before using this transport. Exported for transport-level tests. */
export async function requestPinnedUrl(
  url: URL,
  addresses: LookupAddress[],
  init: RequestInit,
): Promise<RemoteResponse> {
  let lastError: unknown;
  for (const address of addresses) {
    if (init.signal?.aborted) throw abortError(init.signal);
    try {
      return await new Promise<RemoteResponse>((resolve, reject) => {
        const transport = url.protocol === "https:" ? https : http;
        const request = transport.request(createPinnedRequestOptions(url, address, init));
        const onAbort = () => {
          const error = abortError(init.signal!);
          request.destroy(error);
          reject(error);
        };
        init.signal?.addEventListener("abort", onAbort, { once: true });
        const cleanup = () => init.signal?.removeEventListener("abort", onAbort);
        request.once("error", (error) => {
          cleanup();
          reject(error);
        });
        request.once("response", (message) => {
          try {
            const status = message.statusCode ?? 500;
            const method = (init.method ?? "GET").toUpperCase();
            const hasBody = method !== "HEAD" && status !== 204 && status !== 205 && status !== 304;
            const body = hasBody ? (Readable.toWeb(message) as ReadableStream<Uint8Array>) : null;
            const response = new Response(body, {
              status,
              statusText: message.statusMessage,
              headers: responseHeaders(message),
            });
            Object.defineProperty(response, "url", { value: url.toString() });
            resolve({
              response,
              close: async () => {
                cleanup();
                message.destroy();
              },
            });
          } catch (error) {
            cleanup();
            message.destroy();
            reject(error);
          }
        });
        request.end();
      });
    } catch (error) {
      if (init.signal?.aborted) throw abortError(init.signal);
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to connect to ${url.hostname}`);
}

export async function fetchRemoteUrl(
  url: string | URL,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<RemoteResponse> {
  const maxRedirects = options.maxRedirects ?? 5;
  let resolved = await resolveValidatedUrl(url, options.lookup, init.signal);
  let current = resolved.url;
  let requestInit = init;
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const remote = options.fetch
      ? {
          response: await options.fetch(current, { ...requestInit, redirect: "manual" }),
          close: async () => {},
        }
      : await requestPinnedUrl(current, resolved.addresses, requestInit);
    const { response } = remote;
    if (!REDIRECTS.has(response.status)) return remote;
    const location = response.headers.get("location");
    if (!location) return remote;
    if (redirects === maxRedirects) {
      void response.body?.cancel().catch(() => {});
      await remote.close();
      throw new Error(`Too many redirects fetching ${current}`);
    }
    void response.body?.cancel().catch(() => {});
    await remote.close();
    resolved = await resolveValidatedUrl(new URL(location, current), options.lookup, init.signal);
    current = resolved.url;
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        requestInit.method?.toUpperCase() === "POST")
    ) {
      const { body: _body, ...rest } = requestInit;
      requestInit = { ...rest, method: "GET" };
    }
  }
  throw new Error("Too many redirects");
}
