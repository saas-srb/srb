import "server-only";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/security/rate-limit";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";

/**
 * Rate limit for a signed-in SERVER ACTION that calls an outside service or sends mail (connection tests, "send me a test email", bulk access, setup marks).
 * The bucket is per company and per person, so one person cannot spend another's allowance and a company cannot flood a provider. Returns the plain message
 * to show when the limit is hit, or null when the action may go on. A broken limiter never blocks (see `rateLimit`).
 */
export async function limitAction(personId: string, bucket: string, limit: number, windowSeconds: number): Promise<string | null> {
  const company = (await currentCompanyIdOrNull()) ?? "none";
  const h = await headers();
  const r = await rateLimit(new Request("http://internal", { headers: h }), `act:${bucket}:${company}:${personId}`, limit, windowSeconds);
  return r.ok ? null : `You are doing that too often. Please wait ${Math.ceil(r.retryAfter / 60)} minute${r.retryAfter > 90 ? "s" : ""} and try again.`;
}
