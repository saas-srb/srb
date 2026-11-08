import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { safeFetch } from "@/lib/security/safe-fetch";

/**
 * HTTP fetching for the crawler, sitemap/robots readers and backlink checks.
 * Redirects are followed by hand (max 10) so the audit can report chains and
 * temporary redirects. Bodies are capped so one huge response can't exhaust
 * memory.
 *
 * `guard: true` is for URLs a user typed in (backlink sources, competitor
 * sites): every hop must resolve to a public address, so the product can't be
 * used to probe internal networks or cloud metadata endpoints. The configured
 * site origin is trusted (admins may point it at localhost/staging) and is
 * fetched unguarded.
 */

export const SEO_USER_AGENT = "Mozilla/5.0 (compatible; SEOBot/1.0)";
const MAX_BODY = 5 * 1024 * 1024;

export interface FetchResult {
  status: number;
  finalUrl: string;
  chain: { url: string; status: number }[];
  ms: number;
  contentType: string | null;
  bytes: number;
  body: string | null;
  xRobotsTag: string | null;
  error: string | null;
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

export class UnsafeUrlError extends Error {}

/** Throws `UnsafeUrlError` unless `raw` is an http(s) URL whose host resolves only to public addresses. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError("Only http(s) URLs are allowed.");
  if (u.username || u.password) throw new UnsafeUrlError("URLs with credentials are not allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new UnsafeUrlError("Internal hosts are not allowed.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new UnsafeUrlError("Host does not resolve.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new UnsafeUrlError("Private or reserved addresses are not allowed.");
  return u;
}

async function readCapped(res: Response): Promise<{ text: string; bytes: number }> {
  if (!res.body) return { text: "", bytes: 0 };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY) {
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((s, c) => s + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return { text: new TextDecoder().decode(buf), bytes };
}

export async function fetchUrl(
  url: string,
  opts: { timeoutMs?: number; method?: "GET" | "HEAD"; guard?: boolean; wantBody?: boolean } = {}
): Promise<FetchResult> {
  // Outbound fetches are SSRF-guarded in production by default (a company controls its own domain and the pages it links to);
  // only local development, where the "site" is localhost, skips the check.
  const { timeoutMs = 15000, method = "GET", guard = process.env.NODE_ENV === "production", wantBody = true } = opts;
  const chain: { url: string; status: number }[] = [];
  const started = Date.now();
  let current = url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop < 10; hop++) {
      if (guard) await assertPublicUrl(current);
      const headers = { "user-agent": SEO_USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
      // Guarded hops connect only to the public address they were checked against (no DNS rebinding); the trusted site origin uses plain fetch.
      const res = guard
        ? await safeFetch(current, { method, headers, signal: controller.signal })
        : await fetch(current, { method, redirect: "manual", signal: controller.signal, cache: "no-store", headers });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        chain.push({ url: current, status: res.status });
        await res.body?.cancel().catch(() => {});
        current = new URL(res.headers.get("location") as string, current).toString();
        continue;
      }
      const contentType = res.headers.get("content-type");
      const isText = !!contentType && /text\/|xml|json/.test(contentType);
      const { text, bytes } = wantBody && method === "GET" && isText ? await readCapped(res) : { text: null, bytes: Number(res.headers.get("content-length") ?? 0) };
      if (text === null) await res.body?.cancel().catch(() => {});
      return {
        status: res.status,
        finalUrl: current,
        chain,
        ms: Date.now() - started,
        contentType,
        bytes,
        body: text,
        xRobotsTag: res.headers.get("x-robots-tag"),
        error: null,
      };
    }
    return { status: 0, finalUrl: current, chain, ms: Date.now() - started, contentType: null, bytes: 0, body: null, xRobotsTag: null, error: "Too many redirects" };
  } catch (err) {
    const message = err instanceof UnsafeUrlError ? err.message : controller.signal.aborted ? `Timed out after ${timeoutMs} ms` : err instanceof Error ? err.message : "Fetch failed";
    return { status: 0, finalUrl: current, chain, ms: Date.now() - started, contentType: null, bytes: 0, body: null, xRobotsTag: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return out;
}
