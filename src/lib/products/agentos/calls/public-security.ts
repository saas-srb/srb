import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cleanContextValue } from "@/lib/products/agentos/calls/context";
import { maskPhone, normalizeE164 } from "@/lib/products/agentos/calls/phone";

/**
 * The pure security rules of website (public) voice calls: who may embed an agent, the signed page token, and what a visitor may tell the
 * agent. Nothing here touches the database or the network, so every rule is tested on its own (scripts/test-voice-public.ts).
 */

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

/** `scheme://host[:port]` of an http(s) URL in its canonical form, or null (also for "null", paths we can't parse, other schemes). */
export function parseOrigin(input: unknown): string | null {
  if (typeof input !== "string" || !input || input.length > 300) return null;
  try {
    const u = new URL(input.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * One allow-list entry against one origin. Exact match only, EXCEPT an entry the company wrote with a leading `*.` in the host
 * (`https://*.example.com`): that matches any subdomain of example.com on the same scheme and port, never example.com itself and
 * never a look-alike such as `evil-example.com` or `example.com.evil.net`. No other wildcard exists.
 */
export function originMatches(origin: string, entry: string): boolean {
  const o = parseOrigin(origin);
  if (!o) return false;
  if (!entry.includes("*")) return parseOrigin(entry) === o;
  const m = /^(https?):\/\/\*\.([a-z0-9.-]+)(:\d{1,5})?$/i.exec(entry.trim());
  if (!m) return false;
  const [, scheme, base, port = ""] = m;
  let u: URL;
  try {
    u = new URL(o);
  } catch {
    return false;
  }
  if (u.protocol !== `${scheme.toLowerCase()}:`) return false;
  if (`${u.port ? ":" + u.port : ""}` !== port) return false;
  const host = u.hostname.toLowerCase();
  const root = base.toLowerCase();
  return host.length > root.length + 1 && host.endsWith(`.${root}`) && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host.slice(0, -root.length - 1));
}

/** May a page on `embedder` open this agent? The company's own site always may; any other website must be on the agent's list. */
export function originAllowed(embedder: string | null, ownOrigin: string, allowed: readonly string[] | undefined): boolean {
  if (!embedder) return false;
  if (embedder === ownOrigin) return true;
  return (allowed ?? []).some((entry) => typeof entry === "string" && originMatches(embedder, entry));
}

/**
 * (Used for the directory page GET ONLY. A session POST does not fall back to Referer: see startPublicSession. Origins are a browser-enforced
 * convenience, not a security boundary: the signed token and the usage caps are the real limits.)
 *
 * The website that framed the directory page, from what the browser told the server about the page request. `Referer` is only believed
 * for a cross-site frame; a same-origin / typed-address load is the company's own site. Unknown (a frame whose page sent no referrer) is
 * null and gets no agent that is limited to listed websites. Honest limit: a script can forge these headers, so the browser-enforced
 * `frame-ancestors` list (publicFrameAncestors) is the strong check and this one decides which agents the page shows.
 */
export function embedderOrigin(h: { referer: string | null; secFetchSite: string | null; ownOrigin: string }): string | null {
  const fromReferer = parseOrigin(h.referer);
  if (fromReferer) return fromReferer;
  if (h.secFetchSite === "same-origin" || h.secFetchSite === "none") return h.ownOrigin;
  return null;
}

/** CSP `frame-ancestors` value: this site plus every listed website (wildcards stay as written). Invalid entries are dropped. */
export function frameAncestorsValue(origins: readonly string[]): string {
  const ok = new Set<string>();
  for (const e of origins) {
    if (typeof e !== "string") continue;
    if (e.includes("*") ? /^(https?):\/\/\*\.[a-z0-9.-]+(:\d{1,5})?$/i.test(e) : parseOrigin(e) === e) ok.add(e);
  }
  return `frame-ancestors 'self'${ok.size ? " " + [...ok].join(" ") : ""}`;
}

// ---------------------------------------------------------------------------
// Page token
// ---------------------------------------------------------------------------

/** The token is minted when the directory page is rendered and is valid for one call start, between MIN_DWELL and TTL after it was issued. */
export const TOKEN_TTL_MS = 15 * 60 * 1000;
export const TOKEN_MIN_DWELL_MS = 1500;

export interface PageTokenPayload {
  /** Company the page was served for (the Host's company): a token never works on another company's host. */
  c: string;
  /** Who embedded the page: exact origin, or the company's own origin. */
  o: string;
  /** Keyed fingerprint of the visitor's address at issue time. */
  i: string;
  /** Issued at / expires at (ms). */
  t: number;
  e: number;
  /** Unique id; consumed on first use. */
  j: string;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (secret: string, body: string) => createHmac("sha256", secret).update(`agentos-public-token.${body}`).digest();

export function signPageToken(secret: string, p: Omit<PageTokenPayload, "j" | "e" | "t"> & { now?: number; ttlMs?: number; j?: string }): { token: string; payload: PageTokenPayload } {
  const t = p.now ?? Date.now();
  const payload: PageTokenPayload = { c: p.c, o: p.o, i: p.i, t, e: t + (p.ttlMs ?? TOKEN_TTL_MS), j: p.j ?? randomBytes(16).toString("base64url") };
  const body = b64(JSON.stringify(payload));
  return { token: `v1.${body}.${b64(sign(secret, body))}`, payload };
}

export type TokenCheck = { ok: true; payload: PageTokenPayload } | { ok: false; reason: "malformed" | "signature" | "expired" | "too_fast" | "wrong_company" | "wrong_address" };

export function verifyPageToken(secret: string, token: unknown, expect: { company: string; ipFingerprint: string; now?: number }): TokenCheck {
  if (typeof token !== "string" || token.length > 1000) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const want = sign(secret, parts[1]);
  let got: Buffer;
  try {
    got = Buffer.from(parts[2], "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "signature" };
  let p: PageTokenPayload;
  try {
    p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!p || typeof p.c !== "string" || typeof p.o !== "string" || typeof p.i !== "string" || typeof p.j !== "string" || typeof p.t !== "number" || typeof p.e !== "number") return { ok: false, reason: "malformed" };
  const now = expect.now ?? Date.now();
  if (now > p.e || p.e - p.t > TOKEN_TTL_MS) return { ok: false, reason: "expired" };
  if (now - p.t < TOKEN_MIN_DWELL_MS) return { ok: false, reason: "too_fast" };
  if (p.c !== expect.company) return { ok: false, reason: "wrong_company" };
  if (p.i !== expect.ipFingerprint) return { ok: false, reason: "wrong_address" };
  return { ok: true, payload: p };
}

/** Keyed, one-way fingerprint of an address (for the token and the abuse log; the address itself is never stored). */
export function fingerprintIp(secret: string, ip: string): string {
  return createHmac("sha256", secret).update(`agentos-public-ip.${ip}`).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// What a visitor may tell the agent
// ---------------------------------------------------------------------------

export interface VisitorInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}
export interface Visitor {
  /** Dynamic variables for the agent: only these three keys, only clean one-line text. */
  variables: { visitor_name: string; visitor_email: string; visitor_phone: string };
  /** What is kept on the call record: the name, and the email / phone masked. */
  stored: { visitor_name: string; visitor_email: string; visitor_phone: string };
}

const EMAIL = /^[^\s@<>(){}"'`,;:\\]{1,64}@[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,24}$/i;

export const maskEmail = (e: string) => {
  const [local, domain] = e.split("@");
  return local && domain ? `${local.slice(0, 1)}•••@${domain}` : "";
};

/**
 * Optional name / email / phone typed by the visitor. They become {{variables}} in the agent's prompt, so they are cut to short
 * one-line plain text: control characters, template braces, angle brackets and backticks are removed (cleanContextValue), an email or phone that
 * isn't well-formed is dropped rather than repaired, and nothing else the browser sends is accepted. Returns null when a given field is invalid.
 */
export function cleanVisitor(raw: VisitorInput | null | undefined): { ok: true; visitor: Visitor } | { ok: false; error: string } {
  const r = raw ?? {};
  const name = cleanContextValue(r.name, 60);
  let email = "";
  if (typeof r.email === "string" && r.email.trim()) {
    const e = r.email.trim().toLowerCase();
    if (!EMAIL.test(e)) return { ok: false, error: "That email address doesn't look right." };
    email = e;
  }
  let phone = "";
  if (typeof r.phone === "string" && r.phone.trim()) {
    const p = normalizeE164(r.phone);
    if (!p) return { ok: false, error: "Enter your phone number with its country code, for example +91 98765 43210." };
    phone = p;
  }
  return { ok: true, visitor: { variables: { visitor_name: name, visitor_email: email, visitor_phone: phone }, stored: { visitor_name: name, visitor_email: email ? maskEmail(email) : "", visitor_phone: phone ? maskPhone(phone) : "" } } };
}

// ---------------------------------------------------------------------------
// The line the visitor reads before the call
// ---------------------------------------------------------------------------

export interface ConsentInput {
  recordingNotice: boolean;
  agentName: string;
}

/**
 * The consent text shown before the microphone opens. A public call is always disclosed as an AI call, whatever the outbound disclosure setting says: a website visitor must never think they are speaking to a person.
 */
export function consentText(i: ConsentInput): string {
  const parts = [`You are about to talk to ${i.agentName || "an AI voice agent"}, an AI voice agent, not a person.`];
  if (i.recordingNotice) parts.push("The call is recorded and a transcript is kept so the company can follow up and improve its service.");
  parts.push("Your microphone will be used for the call.");
  return parts.join(" ");
}
