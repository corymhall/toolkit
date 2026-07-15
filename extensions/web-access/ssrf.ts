import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";
// Bun shadows bare "undici" imports with an incomplete compatibility module.
// The explicit package entrypoint is required for a real Dispatcher with DNS pinning.
import { Agent, fetch as undiciFetch } from "undici/index.js";

export type LookupAddress = { address: string; family: number };
export type Lookup = (hostname: string) => Promise<LookupAddress[]>;

export type PinnedLookup = (
  hostname: string,
  options: { family?: number; all?: boolean },
  callback: (...args: unknown[]) => void,
) => void;

interface FetchOptions {
  fetch?: typeof fetch;
  lookup?: Lookup;
  maxRedirects?: number;
  agentFactory?: (lookup: PinnedLookup) => Agent;
}

export interface RemoteResponse {
  response: Response;
  close: () => Promise<void>;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
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
  const globallyRoutable = parsed.kind() === "ipv4"
    ? parsed.range() === "unicast"
    : parsed.range() === "unicast" && parsed.match(ipaddr.IPv6.parse("2000::"), 3);
  if (!globallyRoutable) throw new Error(`Blocked non-public address for ${hostname}: ${normalized}`);
}

async function resolveValidatedUrl(raw: string | URL, lookup?: Lookup): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const url = raw instanceof URL ? raw : new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are supported");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported");
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) throw new Error("URL must include a hostname");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error(`Blocked internal hostname: ${hostname}`);
  const version = net.isIP(hostname);
  const addresses = version
    ? [{ address: hostname, family: version }]
    : await (lookup ?? (host => dnsLookup(host, { all: true, verbatim: true })))(hostname);
  if (!addresses.length) throw new Error(`Failed to resolve ${hostname}: no addresses returned`);
  for (const { address } of addresses) assertPublic(address, hostname);
  return { url, addresses };
}

export async function validateRemoteUrl(raw: string | URL, lookup?: Lookup): Promise<URL> {
  return (await resolveValidatedUrl(raw, lookup)).url;
}

export function createPinnedDispatcher(lookup: PinnedLookup): Agent {
  return new Agent({ connect: { lookup } });
}

export async function fetchRemoteUrl(url: string | URL, init: RequestInit = {}, options: FetchOptions = {}): Promise<RemoteResponse> {
  const pinned = new Map<string, LookupAddress[]>();
  const pinnedLookup: PinnedLookup = (hostname, lookupOptions, callback) => {
    const candidates = pinned.get(normalizeHostname(hostname)) ?? [];
    const requestedFamily = Number(lookupOptions.family ?? 0);
    const matching = candidates.filter(candidate => !requestedFamily || candidate.family === requestedFamily);
    if (!matching.length) {
      callback(new Error(`No validated address available for ${hostname}`));
      return;
    }
    if (lookupOptions.all) {
      callback(null, matching.map(candidate => ({ address: candidate.address, family: candidate.family })));
      return;
    }
    callback(null, matching[0].address, matching[0].family);
  };
  const dispatcher = options.fetch ? null : (options.agentFactory?.(pinnedLookup) ?? createPinnedDispatcher(pinnedLookup));
  const close = async () => { if (dispatcher) await dispatcher.close(); };
  const fetchImpl = options.fetch ?? ((input: URL | RequestInfo, requestInit?: RequestInit) =>
    undiciFetch(input as URL, { ...(requestInit as object), dispatcher }) as unknown as Promise<Response>);
  const maxRedirects = options.maxRedirects ?? 5;

  try {
    let resolved = await resolveValidatedUrl(url, options.lookup);
    let current = resolved.url;
    pinned.set(normalizeHostname(current.hostname), resolved.addresses);
    let requestInit = init;
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      const response = await fetchImpl(current, { ...requestInit, redirect: "manual" });
      if (!REDIRECTS.has(response.status)) return { response, close };
      const location = response.headers.get("location");
      if (!location) return { response, close };
      if (redirects === maxRedirects) throw new Error(`Too many redirects fetching ${current}`);
      await response.body?.cancel();
      resolved = await resolveValidatedUrl(new URL(location, current), options.lookup);
      current = resolved.url;
      pinned.set(normalizeHostname(current.hostname), resolved.addresses);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && requestInit.method?.toUpperCase() === "POST")) {
        const { body: _body, ...rest } = requestInit;
        requestInit = { ...rest, method: "GET" };
      }
    }
    throw new Error("Too many redirects");
  } catch (error) {
    await close();
    throw error;
  }
}
