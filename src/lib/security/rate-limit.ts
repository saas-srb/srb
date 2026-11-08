import "server-only";
import { createHash } from "node:crypto";
import { clientIpFrom } from "@/lib/security/ip";
import { NextResponse } from "next/server";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";

/**
 * A small fixed-window rate limiter for PUBLIC endpoints (forms, coupon checks, payments). Counters live in the
 * database — serverless instances share no memory — keyed by bucket + client address, and expire on their own.
 * If the database can't be reached the request is allowed: a broken limiter must not take the site down.
 */
const COLLECTION = "security_rate_limits";
let indexed = false;

/** The client's address (only headers a trusted edge sets are believed — see ip.ts). */
export function clientIp(req: Request): string {
  return clientIpFrom(req.headers);
}

export async function rateLimit(req: Request, bucket: string, limit: number, windowSeconds: number): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  try {
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const slot = Math.floor(now / windowMs);
    const id = `${bucket}:${createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 24)}:${slot}`;
    const col = (await getPlatformDb()).collection<{ _id: string; n: number; expireAt: Date }>(COLLECTION);
    if (!indexed) {
      indexed = true;
      await col.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    }
    const doc = await col.findOneAndUpdate({ _id: id }, { $inc: { n: 1 }, $setOnInsert: { expireAt: new Date((slot + 2) * windowMs) } }, { upsert: true, returnDocument: "after" });
    if ((doc?.n ?? 1) > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil(((slot + 1) * windowMs - now) / 1000)) };
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

/** `null` when allowed, else a ready 429 response. */
export async function limitOr429(req: Request, bucket: string, limit: number, windowSeconds: number): Promise<NextResponse | null> {
  const r = await rateLimit(req, bucket, limit, windowSeconds);
  if (r.ok) return null;
  const res = NextResponse.json({ ok: false, error: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  res.headers.set("Retry-After", String(r.retryAfter));
  return res;
}

/**
 * The same fixed-window limit, counted per signed-in person rather than per address: for actions that move money, where an attacker with one
 * stolen session must not be able to start payments faster than a person could.
 */
export async function userRateLimit(bucket: string, userId: string, limit: number, windowSeconds: number): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  try {
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const slot = Math.floor(now / windowMs);
    const id = `${bucket}:u:${createHash("sha256").update(userId).digest("hex").slice(0, 24)}:${slot}`;
    const col = (await getPlatformDb()).collection<{ _id: string; n: number; expireAt: Date }>(COLLECTION);
    const doc = await col.findOneAndUpdate({ _id: id }, { $inc: { n: 1 }, $setOnInsert: { expireAt: new Date((slot + 2) * windowMs) } }, { upsert: true, returnDocument: "after" });
    if ((doc?.n ?? 1) > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil(((slot + 1) * windowMs - now) / 1000)) };
    return { ok: true };
  } catch {
    // For money the limiter fails closed: if it cannot count, it does not let the payment through.
    return { ok: false, retryAfter: 30 };
  }
}
