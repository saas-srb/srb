import { withTransport } from "@/lib/security/transport";
import { clientIpFrom } from "@/lib/security/ip";
import { NextRequest, NextResponse } from "next/server";
import { readSafeJson } from "@/lib/security/safe-json";
import { validateSubscription } from "@/lib/offers/subscription-validation";
import { subscribeToOffers } from "@/lib/offers/subscriptions";

// Tiny per-instance throttle so the form can't be used to spam the collection. (Not a distributed limit.)
const hits = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}

/** Public "Notify me" / early-access sign-up. Also the lead-capture path for the no-campaign fallback. */
async function handlePOST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await readSafeJson(req)) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Honeypot: real users never fill this hidden field.
  if (typeof body.website === "string" && body.website.trim() !== "") return NextResponse.json({ ok: true });

  const ip = clientIpFrom(req.headers);
  if (tooMany(ip)) return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });

  const v = validateSubscription(body);
  if (!v.valid) return NextResponse.json({ error: "Please check the highlighted fields.", fields: v.errors }, { status: 422 });

  try {
    const { created } = await subscribeToOffers(v.data);
    return NextResponse.json({ ok: true, created }, { status: created ? 201 : 200 });
  } catch (err) {
    console.error("Failed to save offer subscription", err);
    return NextResponse.json({ error: "Couldn't save that right now. Please try again." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
