import { verifiedClientIp } from "@/lib/security/transport-ip";

/**
 * The address a request really came from. Trust is explicit, never guessed from whichever header happens to be present:
 *  1. On Vercel (`VERCEL` is set) the platform's own `x-vercel-forwarded-for` is used: Vercel overwrites it, the caller cannot choose it.
 *  2. Behind Cloudflare, `cf-connecting-ip` is believed ONLY when `TRUST_CLOUDFLARE=1` (the app must then be reachable solely through Cloudflare).
 *  3. Otherwise `x-forwarded-for` is read from the right: the right-most entry is the one our nearest proxy appended, and `TRUSTED_PROXY_HOPS`
 *     (default 1) says how many proxies of ours are in front of the app, so the client is entry `length - hops`. Left-most entries are
 *     whatever the caller typed and are never trusted. `TRUSTED_PROXY_HOPS=0` means no proxy in front: forwarding headers are ignored.
 * `x-real-ip` is never believed: a proxy that does not overwrite it forwards the caller's own value.
 * With no usable header the answer is "unknown" (one shared bucket), which is the safe side for rate limits and bans.
 */
export function clientIpFrom(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  const internal = verifiedClientIp(headers.get("x-internal-ip")); // our own server forwarding a Server Action on a person's behalf
  if (internal) return internal;
  const first = (v: string | null) => (v ?? "").split(",")[0].trim();
  if (env.VERCEL) {
    const v = first(headers.get("x-vercel-forwarded-for"));
    if (v) return v.slice(0, 64);
  }
  if (env.TRUST_CLOUDFLARE === "1") {
    const cf = first(headers.get("cf-connecting-ip"));
    if (cf) return cf.slice(0, 64);
  }
  return fromForwardedFor(headers.get("x-forwarded-for"), trustedProxyHops(env.TRUSTED_PROXY_HOPS));
}

/** `TRUSTED_PROXY_HOPS`: a whole number 0-10, default 1. Anything else falls back to the default. */
export function trustedProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 1;
}

/** The client entry of an `x-forwarded-for` list given how many of our own proxies appended to it. Pure. */
export function fromForwardedFor(header: string | null, hops: number): string {
  if (hops <= 0) return "unknown";
  const xff = (header ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!xff.length) return "unknown";
  // Fewer entries than proxies configured: the list was not built by that many proxies, so take the oldest entry we have the least reason to distrust.
  const i = Math.max(0, xff.length - hops);
  return xff[i].slice(0, 64);
}
