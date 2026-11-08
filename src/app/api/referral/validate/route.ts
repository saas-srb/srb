import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { normalizeReferralCode } from "@/lib/referral";
import { getReferralPreview } from "@/lib/wallet/referrals";

/** Public, rate-limit-friendly, minimal: says whether a code is live and shows the referrer's first name only. Reveals nothing else about the account. */
async function handleGET(req: Request) {
  const limited = await limitOr429(req, "referral-validate", 40, 600);
  if (limited) return limited;
  const code = normalizeReferralCode(new URL(req.url).searchParams.get("code"));
  if (!code) return NextResponse.json({ valid: false, welcomeBonus: 0 });
  const preview = await getReferralPreview(code);
  return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withTransport(handleGET);
