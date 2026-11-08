import "server-only";
import { createHmac } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Outbound webhook delivery for workflow actions. The URL comes from a
 * company admin, so it is treated as hostile:
 *  - https only, no credentials in the URL
 *  - the host must resolve ONLY to public addresses (no loopback, private,
 *    link-local, CGNAT, multicast or metadata ranges) — and the connection is
 *    pinned to the address that was checked, so DNS can't change its answer
 *    between the check and the request
 *  - redirects are never followed; 5 second timeout; the response body is discarded
 * Every request is signed: `X-Webhook-Signature: t=<unix seconds>,v1=<hex>`
 * where v1 = HMAC-SHA256(secret, `${t}.${body}`).
 */

export const WEBHOOK_TIMEOUT_MS = 5000;

export class WebhookBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookBlockedError";
  }
}

function ipv4Blocked(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments / TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51) || // TEST-NET-2
    (a === 203 && b === 0) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** True for any address a webhook must not reach. Unknown formats are blocked. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (net.isIPv4(ip)) return ipv4Blocked(ip);
  if (!net.isIPv6(ip)) return true;
  // IPv4-mapped / -compatible / NAT64 forms carry an IPv4 address.
  const dotted = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return ipv4Blocked(dotted[1]);
  const mappedHex = ip.match(/^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return ipv4Blocked(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (ip === "::" || ip === "::1") return true;
  const first = parseInt(ip.split(":")[0] || "0", 16);
  if (ip.startsWith("::")) return true; // remaining ::/8 forms (IPv4-compatible etc.)
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // site-local (deprecated)
    (first & 0xff00) === 0xff00 || // multicast
    ip.startsWith("64:ff9b:") || // NAT64
    ip.startsWith("2001:db8:") || // documentation
    ip.startsWith("2002:") // 6to4 (embeds an IPv4 address)
  );
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

/** Parses and statically checks a webhook URL (scheme, credentials, obvious internal names, IP literals). */
export function parseWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookBlockedError("Not a valid URL.");
  }
  if (url.protocol !== "https:") throw new WebhookBlockedError("Only https:// webhook URLs are allowed.");
  if (url.username || url.password) throw new WebhookBlockedError("Webhook URLs can't contain credentials.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) throw new WebhookBlockedError("Not a valid URL.");
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new WebhookBlockedError("That address is private or reserved.");
  } else if (host === "localhost" || !host.includes(".") || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new WebhookBlockedError("That host is internal.");
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** A DNS lookup that refuses to hand back anything but public addresses — used as the socket's `lookup`. */
export function publicOnlyLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
      return callback(Object.assign(new Error("Host resolves to a private or reserved address."), { code: "EWEBHOOKBLOCKED" }), "");
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export interface WebhookDelivery {
  ok: boolean;
  status: number | null;
  error: string | null;
}

/**
 * POSTs `payload` as JSON. Never throws. `unsafeAllowAnyHost` skips the
 * https/public-address rules and exists ONLY so tests can post to a local
 * mock server — no application code passes it.
 */
export function deliverWebhook(rawUrl: string, payload: unknown, opts: { secret: string; eventType: string; deliveryId: string; unsafeAllowAnyHost?: boolean }): Promise<WebhookDelivery> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = opts.unsafeAllowAnyHost ? new URL(rawUrl) : parseWebhookUrl(rawUrl);
    } catch (err) {
      return resolve({ ok: false, status: null, error: err instanceof Error ? err.message : "Blocked URL." });
    }
    const body = JSON.stringify(payload);
    const t = Math.floor(Date.now() / 1000);
    const transport = url.protocol === "http:" ? http : https;
    let settled = false;
    const done = (r: WebhookDelivery) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const req = transport.request(
      url,
      {
        method: "POST",
        agent: false, // a fresh socket each time: the pinned lookup below always runs
        ...(opts.unsafeAllowAnyHost ? {} : { lookup: publicOnlyLookup as never }),
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "user-agent": "BusinessOS-Webhooks/1",
          "x-webhook-event": opts.eventType,
          "x-webhook-id": opts.deliveryId,
          "x-webhook-signature": `t=${t},v1=${signWebhook(opts.secret, t, body)}`,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        res.resume(); // discard the body
        // 3xx is NOT followed: a redirect could point anywhere.
        done(status >= 200 && status < 300 ? { ok: true, status, error: null } : { ok: false, status, error: status >= 300 && status < 400 ? `The endpoint redirected (${status}); redirects aren't followed.` : `The endpoint answered ${status}.` });
        req.destroy();
      },
    );
    const timer = setTimeout(() => {
      done({ ok: false, status: null, error: "The endpoint didn't answer within 5 seconds." });
      req.destroy();
    }, WEBHOOK_TIMEOUT_MS);
    req.on("error", (err: NodeJS.ErrnoException) => done({ ok: false, status: null, error: err.code === "EWEBHOOKBLOCKED" ? err.message : `Couldn't reach the endpoint (${err.code ?? err.message}).` }));
    req.end(body);
  });
}
