import { clientIpFrom } from "@/lib/security/ip";
import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * The origin the current request came in on — for links that must point back
 * to the same company's host (invites, verification). Built from the Host
 * header, which is what routes the request to its company.
 */
export async function requestOrigin(): Promise<{ origin: string; host: string | null }> {
  const h = await headers();
  const host = h.get("host");
  const local = host?.startsWith("localhost") || host?.startsWith("127.0.0.1") || host?.includes(".localhost");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return { origin: `${proto}://${host}`, host };
}

/** A stable, non-reversible key for the caller's IP — for rate limiting without storing addresses. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = clientIpFrom(h);
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}
