import "server-only";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { publicOnlyLookup, isBlockedAddress } from "@/lib/platform/workflows/webhook";
import net from "node:net";

/**
 * A `fetch` for addresses a person typed in (competitor sites, backlink sources, anything we must go and read). The connection itself
 * resolves the host and REFUSES private, loopback, link-local, cloud-metadata and other reserved addresses, and connects to the very
 * address it checked — so a host that answers "public" to a pre-check and "127.0.0.1" a moment later (DNS rebinding) cannot get through.
 * Redirects are never followed here (the caller walks them one by one and calls this for each hop).
 */
export function safeFetch(rawUrl: string, init: { method?: string; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return reject(new Error("Not a valid URL."));
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return reject(new Error("Only http(s) URLs are allowed."));
    if (url.username || url.password) return reject(new Error("URLs with credentials are not allowed."));
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isBlockedAddress(host)) return reject(new Error("Private or reserved addresses are not allowed."));
    const transport = url.protocol === "http:" ? http : https;
    const req = transport.request(
      url,
      { method: init.method ?? "GET", headers: init.headers, lookup: publicOnlyLookup as never, signal: init.signal, timeout: 20_000 },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        const noBody = (init.method ?? "GET") === "HEAD" || res.statusCode === 204 || res.statusCode === 304;
        resolve(new Response(noBody ? null : (Readable.toWeb(res) as unknown as ReadableStream), { status: res.statusCode ?? 502, headers }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out.")));
    req.on("error", reject);
    req.end();
  });
}
