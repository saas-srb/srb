import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { readSafeJson } from "@/lib/security/safe-json";
import { recordOfferEvent } from "@/lib/offers/analytics";
import { isValidEventType, isValidDeviceType, isValidAudience } from "@/lib/offers/constants";
import { isValidCategory } from "@/lib/categories";

/**
 * Best-effort public event beacon — called via `navigator.sendBeacon`/`fetch(..., {keepalive:true})`.
 * Never throws a validation error back at the client (a dropped analytics
 * event should never surface as visible UI failure); malformed bodies are
 * just silently ignored.
 */
async function handlePOST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await readSafeJson(req)) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  const type = body.type;
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const device = body.device;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 100) : "";

  if (!isValidEventType(type) || !campaignId || !isValidDeviceType(device) || !sessionId) {
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  const category = typeof body.category === "string" && isValidCategory(body.category) ? body.category : undefined;
  const audience = isValidAudience(body.audience) ? body.audience : undefined;
  const offerId = typeof body.offerId === "string" && body.offerId ? body.offerId : undefined;
  const source = typeof body.source === "string" ? body.source.slice(0, 100) : "direct";

  try {
    await recordOfferEvent({ type, campaignId, offerId, category, audience, device, source, sessionId });
  } catch (err) {
    console.error("Failed to record offer event (non-fatal)", err);
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}

export const POST = withTransport(handlePOST);
