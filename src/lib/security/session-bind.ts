import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { clientIpFrom } from "@/lib/security/ip";
import { SESSION_COOKIES, STRICT } from "@/lib/security/gate";

/**
 * Session binding: a session token only works from the browser and network it was first used on.
 *
 * The first request that carries a token records a fingerprint — the browser family (user-agent with version numbers
 * removed) and the network (IPv4 /24, IPv6 /48). If the same token later arrives with a different fingerprint it was
 * copied (stolen cookie, leaked log, someone replaying it from a script) — the token is revoked for good, every request
 * carrying it is refused and the cookie is cleared; the owner signs in again. Set SESSION_BIND_IP=0 to bind the browser only
 * (for fleets whose users roam between networks all day).
 */
const COLLECTION = "session_bindings";
const TTL_MS = 31 * 24 * 3600 * 1000;
const BIND_IP = process.env.SESSION_BIND_IP !== "0";

interface Binding { _id: string; ua: string; net: string; revoked?: boolean; expireAt: Date }
const cache = new Map<string, { b: Pick<Binding, "ua" | "net" | "revoked">; at: number }>();
let indexed = false;

const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

function networkOf(ip: string): string {
  if (ip.includes(":")) return ip.toLowerCase().split(":").slice(0, 3).join(":"); // IPv6 /48
  const p = ip.split(".");
  return p.length === 4 ? p.slice(0, 3).join(".") : ip; // IPv4 /24
}

function fingerprint(req: NextRequest) {
  const ua = (req.headers.get("user-agent") ?? "").replace(/[\d._]+/g, "").replace(/\s+/g, " ").slice(0, 300);
  return { ua: h(ua), net: BIND_IP ? h(networkOf(clientIpFrom(req.headers))) : "-" };
}

function refused(req: NextRequest, api: boolean) {
  const res = api
    ? NextResponse.json({ ok: false, error: "Your session is no longer valid. Please sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } })
    : NextResponse.redirect(new URL("/commandos/login", req.url), { status: 303, headers: { "Cache-Control": "no-store" } });
  for (const n of SESSION_COOKIES) if (req.cookies.has(n)) res.cookies.set(n, "", { path: "/", maxAge: 0 });
  return res;
}

/** null = carry on; a response = the token was copied (or already revoked) and the request stops here. */
export async function gateSessionBinding(req: NextRequest, api: boolean): Promise<NextResponse | null> {
  if (!STRICT) return null;
  const tokens = SESSION_COOKIES.map((n) => req.cookies.get(n)?.value).filter((v): v is string => !!v);
  if (tokens.length === 0) return null;
  const fp = fingerprint(req);
  try {
    const col = (await getPlatformDb()).collection<Binding>(COLLECTION);
    if (!indexed) {
      indexed = true;
      await col.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    }
    for (const t of tokens) {
      const id = h(t);
      let b = cache.get(id);
      if (!b || Date.now() - b.at > 30_000 || (!b.b.revoked && (b.b.ua !== fp.ua || b.b.net !== fp.net))) {
        const doc = await col.findOne({ _id: id });
        if (doc) b = { b: doc, at: Date.now() };
        else {
          await col.updateOne({ _id: id }, { $setOnInsert: { ua: fp.ua, net: fp.net, expireAt: new Date(Date.now() + TTL_MS) } }, { upsert: true });
          const again = (await col.findOne({ _id: id })) ?? { ua: fp.ua, net: fp.net };
          b = { b: again, at: Date.now() };
        }
        cache.set(id, b);
        if (cache.size > 5000) cache.clear();
      }
      if (b.b.revoked) return refused(req, api);
      if (b.b.ua !== fp.ua || b.b.net !== fp.net) {
        await col.updateOne({ _id: id }, { $set: { revoked: true } });
        cache.set(id, { b: { ...b.b, revoked: true }, at: Date.now() });
        console.warn("[security] session token replayed from a different browser/network — revoked");
        return refused(req, api);
      }
    }
  } catch (err) {
    console.error("[security] session binding check failed", err); // fail open: a database blip must not sign everyone out
  }
  return null;
}
