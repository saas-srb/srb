import { NextRequest, NextResponse } from "next/server";
import { clientIpFrom } from "@/lib/security/ip";
import { signedClientIp } from "@/lib/security/transport-ip";
import { b64uDecode, b64uEncode } from "@/lib/security/transport-shared";
import { withTransport } from "@/lib/security/transport";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sealed Server Actions. The browser seals an action call (page, Next's action headers, arguments) and posts it here; this opens it, makes the
 * same call to the page the action belongs to, and returns the answer (status, headers, body) inside the sealed reply, so the action's
 * arguments and results never appear readable in the Network tab. The forwarded call goes through the normal gate, sessions and permissions
 * like any other action; this route adds no access of its own.
 *
 * It only ever calls a path on the host the request itself arrived on (never a path under /api/, never another host), and only with
 * the headers Next's action protocol needs.
 */

/** Only the headers Next's action protocol needs are taken from the sealed message; identity (cookie, origin …) comes from the real request. */
const FROM_SEALED = new Set(["next-action", "next-router-state-tree", "next-url", "accept", "content-type", "rsc", "x-deployment-id", "x-nextjs-request-id", "x-nextjs-html-request-id"]);
const FROM_REAL = ["cookie", "user-agent", "origin", "referer", "accept-language", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "x-forwarded-proto"];
const NO_BODY = new Set([101, 204, 205, 304]);

const bad = () => NextResponse.json({ error: "Bad request" }, { status: 400 });

async function handlePOST(req: NextRequest) {
  let m: { u?: string; h?: Record<string, string>; b?: string };
  try {
    m = await req.json();
  } catch {
    return bad();
  }
  const path = String(m.u ?? "");
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/api/") || path.includes("\\") || !m.h?.["next-action"]) return bad();

  const host = req.headers.get("host");
  if (!host) return bad();
  const headers = new Headers();
  for (const [k, v] of Object.entries(m.h)) if (FROM_SEALED.has(k.toLowerCase()) && typeof v === "string") headers.set(k, v);
  for (const k of FROM_REAL) {
    const v = req.headers.get(k);
    if (v) headers.set(k, v);
  }
  headers.set("host", host);
  const ip = signedClientIp(clientIpFrom(req.headers));
  if (ip) headers.set("x-internal-ip", ip);

  // fetch ignores a Host override, so the call goes to the host the person is on (locally that is a *.localhost name, which resolves to this machine).
  const origin = `${process.env.NODE_ENV !== "production" ? "http" : "https"}://${host}`;
  let upstream: Response;
  try {
    upstream = await fetch(origin + path, { method: "POST", headers, body: Buffer.from(b64uDecode(m.b ?? "")), redirect: "manual", cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Could not reach the page. Please try again." }, { status: 502 });
  }

  const outHeaders: Record<string, string> = {};
  upstream.headers.forEach((v, k) => {
    if (!["set-cookie", "content-length", "content-encoding", "transfer-encoding", "connection"].includes(k)) outHeaders[k] = v;
  });
  const bytes = NO_BODY.has(upstream.status) ? new Uint8Array() : new Uint8Array(await upstream.arrayBuffer());
  const res = NextResponse.json({ s: upstream.status, h: outHeaders, b: b64uEncode(bytes) });
  for (const c of upstream.headers.getSetCookie()) res.headers.append("set-cookie", c);
  return res;
}

export const POST = withTransport(handlePOST);
