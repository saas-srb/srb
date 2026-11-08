import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getActiveCampaignForPage, getUpcomingCampaignForPage, type OfferCampaign } from "@/lib/offers/campaigns";
import { getPopupTemplateMeta, audienceForPath } from "@/lib/offers/constants";
import { getSiteInfo, type SiteInfo } from "@/lib/products/sitecraft-ai/site-info";

function resolveCtaHref(contact: SiteInfo["contact"], actionType: string, actionValue: string): string {
  if (actionType === "whatsapp") return contact.whatsappHref;
  if (actionType === "call") return contact.phoneHref;
  return actionValue || "/offers";
}

/**
 * Builds the strip/popup payload for a campaign. `phase: "live"` uses the admin-authored
 * copy/CTA action as-is (it was written assuming the campaign is already running). `phase:
 * "upcoming"` is a pre-launch teaser for a scheduled campaign that hasn't started yet — the
 * authored "X is live" copy and "Claim Offer"/WhatsApp/Call actions don't make sense before
 * launch, so those are overridden with generic coming-soon wording and a CTA straight to the
 * Offers page (which already renders the full "coming soon" countdown experience with a
 * Notify Me form). Everything else the admin configured — discount text, countdown toggle,
 * close button, popup trigger/frequency/template emoji — carries over unchanged.
 */
function buildDisplay(campaign: OfferCampaign, phase: "live" | "upcoming", contact: SiteInfo["contact"]) {
  const display = campaign.display;
  const upcoming = phase === "upcoming";

  const strip = display.strip?.enabled
    ? {
        message: upcoming ? `${campaign.name} — coming soon` : display.strip.message || campaign.name,
        discountText: display.strip.discountText,
        ctaText: upcoming ? "Notify Me" : display.strip.ctaText,
        ctaHref: upcoming ? "/offers" : resolveCtaHref(contact, display.strip.ctaActionType, display.strip.ctaActionValue),
        showCountdown: display.strip.showCountdown,
        allowClose: display.strip.allowClose,
      }
    : null;

  const templateMeta = getPopupTemplateMeta(display.popup?.template);
  const popup = display.popup?.enabled
    ? {
        template: display.popup.template,
        emoji: templateMeta.emoji,
        heading: upcoming ? "Coming Soon" : templateMeta.heading,
        ctaText: upcoming ? "Notify Me" : display.popup.ctaText,
        ctaHref: upcoming ? "/offers" : resolveCtaHref(contact, display.popup.ctaActionType, display.popup.ctaActionValue),
        showCountdown: display.popup.showCountdown,
        trigger: { type: display.popup.triggerType, value: display.popup.triggerValue },
        frequency: display.popup.frequency,
      }
    : null;

  return { strip, popup };
}

/**
 * Public, best-effort read for the global top strip + popup — the single
 * source both components fetch from (never duplicated queries). Never
 * throws a 4xx/5xx for "nothing to show"; an inactive/missing campaign is a
 * normal `{ active: false }` response so the calling component can hide
 * gracefully without treating it as an error.
 *
 * Resolves a live campaign first; if none is running, falls back to the nearest scheduled
 * campaign so its "coming soon" countdown can be promoted site-wide before launch too —
 * not just once it goes live.
 */
async function handleGET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get("page") || "/";

  try {
    let campaign = await getActiveCampaignForPage(page);
    let phase: "live" | "upcoming" = "live";
    if (!campaign) {
      campaign = await getUpcomingCampaignForPage(page);
      phase = "upcoming";
    }
    if (!campaign) return NextResponse.json({ active: false, phase: null, serverTime: Date.now() });

    const { strip, popup } = buildDisplay(campaign, phase, (await getSiteInfo()).contact);
    if (!strip && !popup) return NextResponse.json({ active: false, phase: null, serverTime: Date.now() });

    const base = {
      id: campaign._id,
      slug: campaign.slug,
      name: campaign.name,
      startDate: campaign.startDate.toISOString(),
      endDate: campaign.endDate.toISOString(),
    };

    return NextResponse.json({
      active: phase === "live",
      phase,
      // Lets every countdown use the server clock instead of the visitor's (possibly wrong) device clock.
      serverTime: Date.now(),
      campaign: base,
      audience: audienceForPath(page),
      strip,
      popup,
    });
  } catch (err) {
    console.error("Failed to resolve active campaign display (hiding promotions gracefully)", err);
    // A transient DB failure must NOT read as "no campaign": the client keeps showing the last good strip/popup
    // on a 5xx, but tears them down on an honest `{ active: false }`.
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
}

export const GET = withTransport(handleGET);
