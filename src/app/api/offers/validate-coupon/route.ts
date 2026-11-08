import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { readSafeJson } from "@/lib/security/safe-json";
import { getOffer } from "@/lib/offers/offers";
import { validateCoupon } from "@/lib/offers/coupons";
import { isValidAudience } from "@/lib/offers/constants";

/** Read-only "Apply coupon" preview. The final claim submit always re-validates from scratch — this never redeems. */
async function handlePOST(req: NextRequest) {
  const limited = await limitOr429(req, "coupon-validate", 30, 600);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = (await readSafeJson(req)) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const offerId = typeof body.offerId === "string" ? body.offerId : "";
  const couponCode = typeof body.couponCode === "string" ? body.couponCode : "";
  const audience = body.audience;

  if (!isValidAudience(audience)) return NextResponse.json({ error: "Invalid audience." }, { status: 400 });

  const offer = await getOffer(offerId);
  if (!offer || offer.campaignId !== campaignId) {
    return NextResponse.json({ error: "This offer is no longer available." }, { status: 404 });
  }

  const result = await validateCoupon(couponCode, {
    campaignId,
    category: offer.category,
    subService: offer.subService,
    audience,
    orderValue: offer.pricing.mode !== "custom_quote" ? offer.pricing.originalPrice : undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ discountAmount: result.discountAmount });
}

export const POST = withTransport(handlePOST);
