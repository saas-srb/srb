import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { readSafeJson } from "@/lib/security/safe-json";
import { createLead, validateLeadInput } from "@/lib/leads";
import { provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { CATEGORY_TO_SOURCE } from "@/lib/lead-management/types";
import { createPortalSession, setPortalSessionCookie, getCurrentPortalUser } from "@/lib/portal-auth";
import { resolveUsagePolicy, maxUsableCredits } from "@/lib/wallet/usage-rules";
import { qualifyReferralOnEvent } from "@/lib/wallet/referrals";
import { awardActivity } from "@/lib/wallet/earn";
import { reserveWalletCredit, confirmWalletRedemption, releaseWalletReservation, getAvailableBalance } from "@/lib/wallet/redemption";
import { randomUUID } from "node:crypto";
import { getCampaign } from "@/lib/offers/campaigns";
import { getOffer } from "@/lib/offers/offers";
import { validateCoupon, redeemCoupon } from "@/lib/offers/coupons";
import { createOfferClaim, countClaimsForOffer, hasClaimByEmail } from "@/lib/offers/claims";
import { externalUsers } from "@/lib/portal-auth";
import { validateClaimInput, formatClaimMessage } from "@/lib/offers/claim-validation";
import { isValidAudience, getCampaignEffectiveStatus, DEFAULT_CURRENCY } from "@/lib/offers/constants";

async function handlePOST(req: NextRequest) {
  const limited = await limitOr429(req, "offers-claim", 12, 600);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = (await readSafeJson(req)) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const offerId = typeof body.offerId === "string" ? body.offerId : "";
  const audience = body.audience;
  const couponCodeRaw = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
  const fields = (body.fields ?? {}) as Record<string, unknown>;
  const utm = (body.utm ?? {}) as Record<string, unknown>;
  const useWallet = body.useWallet === true;
  const referralCode = typeof body.referralCode === "string" ? body.referralCode : null;

  if (!isValidAudience(audience) || !["CLIENT", "STUDENT", "INTERN", "HIRING"].includes(audience)) {
    return NextResponse.json({ error: "Invalid audience." }, { status: 400 });
  }
  const claimAudience = audience as "CLIENT" | "STUDENT" | "INTERN" | "HIRING";

  // Re-resolve the campaign and offer server-side — never trust that what the
  // client displayed is still live. Expired/paused offers can't be claimed.
  const [campaign, offer] = await Promise.all([getCampaign(campaignId), getOffer(offerId)]);
  if (!campaign || !offer || offer.campaignId !== campaignId) {
    return NextResponse.json({ error: "This offer is no longer available." }, { status: 404 });
  }
  const now = new Date();
  const campaignLive = getCampaignEffectiveStatus(campaign.status, campaign.startDate, campaign.endDate, now) === "active";
  const offerLive = offer.status === "active" && offer.validFrom <= now && offer.validUntil >= now;
  if (!campaignLive || !offerLive) {
    return NextResponse.json({ error: "This offer has expired." }, { status: 410 });
  }

  // Optional claim cap. Best-effort by design (no multi-document transactions in this codebase): two truly
  // simultaneous claims on the very last slot can both pass, so treat the limit as a soft cap.
  if (offer.claimLimit && (await countClaimsForOffer(offer._id)) >= offer.claimLimit) {
    return NextResponse.json({ error: "This offer is fully claimed. Please check our other live offers.", soldOut: true }, { status: 409 });
  }

  const claimValidation = validateClaimInput(claimAudience, fields);
  if (!claimValidation.valid) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fields: claimValidation.errors }, { status: 422 });
  }
  const { contact, audienceFields } = claimValidation;

  // Segment rules (first-time / renewal offers) are enforced here, never trusted from the client.
  if (offer.segment === "new_user" || offer.segment === "existing_user") {
    const emailLc = (contact.email ?? "").trim().toLowerCase();
    if (offer.segment === "new_user") {
      const [account, priorClaim] = await Promise.all([externalUsers().then((c) => c.findOne({ email: emailLc }, { projection: { _id: 1 } })), hasClaimByEmail(emailLc)]);
      if (account || priorClaim) {
        return NextResponse.json({ error: "This offer is for first-time customers only. Check the other live offers made for existing customers.", fields: { email: "Already a customer." } }, { status: 403 });
      }
    } else {
      const who = await getCurrentPortalUser();
      if (!who || who.email.toLowerCase() !== emailLc) {
        return NextResponse.json({ error: "This offer is for existing customers. Please sign in to your portal with the same email, then claim it.", needsLogin: true }, { status: 403 });
      }
    }
  }

  // Server-side pricing — always recomputed here, client-submitted price fields are never trusted.
  const originalPrice = offer.pricing.mode !== "custom_quote" ? offer.pricing.originalPrice : undefined;
  const currency = offer.pricing.currency ?? DEFAULT_CURRENCY;
  let offerDiscountAmount = 0;
  if (originalPrice) {
    if (offer.pricing.mode === "percentage" && offer.pricing.percentage) offerDiscountAmount = originalPrice * (offer.pricing.percentage / 100);
    else if (offer.pricing.mode === "flat" && offer.pricing.flatDiscountAmount) offerDiscountAmount = offer.pricing.flatDiscountAmount;
  }

  let couponDiscountAmount = 0;
  let redeemedCouponId: string | null = null;
  let couponCode: string | undefined;
  if (couponCodeRaw) {
    const result = await validateCoupon(couponCodeRaw, {
      campaignId,
      category: offer.category,
      subService: offer.subService,
      audience: claimAudience,
      orderValue: originalPrice,
      userEmail: contact.email,
    });
    if (!result.ok) return NextResponse.json({ error: result.error, fields: { couponCode: result.error } }, { status: 422 });
    couponDiscountAmount = result.discountAmount;
    redeemedCouponId = result.coupon._id;
    couponCode = result.coupon.code;

    const redemption = await redeemCoupon(result.coupon._id);
    if (!redemption.ok) return NextResponse.json({ error: redemption.error, fields: { couponCode: redemption.error } }, { status: 422 });
  }

  const totalDiscountApplied = originalPrice != null ? Math.min(offerDiscountAmount + couponDiscountAmount, originalPrice) : undefined;
  const finalPrice = originalPrice != null && totalDiscountApplied != null ? originalPrice - totalDiscountApplied : undefined;

  // Base contact record flows through the real leads pipeline unchanged — same
  // validation + UTM/ad-platform attribution every other public form uses.
  const leadValidation = validateLeadInput({
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    message: formatClaimMessage(offer.title, audienceFields),
    subService: offer.subService !== "all" ? offer.subService : undefined,
    source: "offer_claim",
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
    utmContent: utm.content,
    utmTerm: utm.term,
  });
  if (!leadValidation.valid) {
    return NextResponse.json({ error: "Validation failed.", fields: leadValidation.errors }, { status: 422 });
  }

  // Wallet redemption is only ever honored for the signed-in owner of the
  // wallet — never by email alone (an anonymous caller must not be able to
  // spend someone else's credits by typing their address).
  const sessionUser = await getCurrentPortalUser();
  const walletUserId =
    useWallet && sessionUser && sessionUser.email.toLowerCase() === (contact.email ?? "").trim().toLowerCase() ? sessionUser.id : null;
  let walletReserved = 0;
  const walletKey = `offer_claim_wallet:${randomUUID()}`;

  try {
    const lead = await createLead(offer.category, leadValidation.data);

    let claimUserId: string | null = null;
    let claimIsNew = false;
    let portal: { redirect: string; isNewAccount: boolean; tempPassword: string | null } | undefined;
    try {
      const result = await provisionLeadAndAccount({
        source: CATEGORY_TO_SOURCE[offer.category],
        name: leadValidation.data.name,
        email: leadValidation.data.email as string,
        phone: leadValidation.data.phone,
        subService: leadValidation.data.subService ?? null,
        message: leadValidation.data.message ?? null,
        sourceRef: { kind: "category_lead", category: offer.category, id: String(lead._id) },
        referralCode,
      });
      claimUserId = result.externalUserId;
      claimIsNew = result.isNewAccount;
      // Only a brand-new account is signed in automatically. An email that already has an account is NOT proof of identity —
      // logging the submitter in would let anyone take over (and spend the wallet of) any user whose email they know.
      if (result.isNewAccount) {
        const { token } = await createPortalSession(result.externalUserId, false);
        await setPortalSessionCookie(token, false);
      }
      portal = { redirect: result.isNewAccount ? "/clientos" : "/login", isNewAccount: result.isNewAccount, tempPassword: result.tempPassword };
    } catch (provErr) {
      console.error("Offer claim: lead provisioning failed (claim still saved)", provErr);
    }

    let walletAmountApplied = 0;
    if (walletUserId && finalPrice != null && finalPrice > 0) {
      const available = await getAvailableBalance(walletUserId);
      // Admin-configured usage rule for this account type (max % of price, per-claim cap, minimum order) — never a client-side number.
      const policy = await resolveUsagePolicy("offers", sessionUser?.role ?? "client");
      const amount = maxUsableCredits(policy, finalPrice, available);
      if (amount > 0) {
        const reserved = await reserveWalletCredit(walletUserId, amount, walletKey);
        if (reserved.ok) {
          walletReserved = amount;
          walletAmountApplied = amount;
        }
      }
    }
    const finalAfterWallet = finalPrice != null ? finalPrice - walletAmountApplied : undefined;

    const claim = await createOfferClaim({
      leadId: String(lead._id),
      category: offer.category,
      leadEmail: contact.email,
      campaignId,
      offerId,
      couponCode,
      audience: claimAudience,
      audienceFields,
      pricing: { originalPrice, offerDiscountAmount: originalPrice ? offerDiscountAmount : undefined, couponDiscountAmount: redeemedCouponId ? couponDiscountAmount : undefined, totalDiscountApplied, finalPrice: finalAfterWallet, currency, walletAmountApplied: walletAmountApplied || undefined },
    });

    if (walletReserved > 0 && walletUserId) {
      await confirmWalletRedemption(walletUserId, walletReserved, claim._id, walletKey);
      walletReserved = 0;
    }

    if (claimUserId) {
      try {
        await qualifyReferralOnEvent(claimUserId, "first_offer_claim");
        // Earned only by the signed-in owner of the account — an anonymous claim using someone's email must not pay them.
        if (claimIsNew || sessionUser?.id === claimUserId) await awardActivity({ userId: claimUserId, type: "first_offer_claim", key: claimUserId });
      } catch (refErr) {
        console.error("Offer claim: referral qualification failed (claim still saved)", refErr);
      }
    }

    return NextResponse.json(
      { data: { claimId: claim._id }, pricing: claim.pricing, portal },
      { status: 201 }
    );
  } catch (err) {
    if (walletReserved > 0 && walletUserId) {
      await releaseWalletReservation(walletUserId, walletReserved, walletKey).catch(() => {});
    }
    console.error("Failed to create offer claim", err);
    return NextResponse.json({ error: "Failed to save your claim. Please try again." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
