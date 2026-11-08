import type { Metadata } from "next";
import { jsonForScript } from "@/lib/security/json-script";
import { withSeoOverrides } from "@/lib/products/rankmax-ai/public";
import { cache } from "react";
import { resolveOffersPage } from "@/lib/offers/state";
import { dispatchCampaignStart } from "@/lib/offers/subscriptions";
import OffersUpcoming from "@/components/offers/OffersUpcoming";
import OffersFallback from "@/components/offers/OffersFallback";
import StateWatcher from "@/components/offers/StateWatcher";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { getAvailableBalance } from "@/lib/wallet/redemption";
import { tabForPortalRole } from "@/lib/offers/constants";
import { PORTAL_ROLE_META } from "@/lib/portal-roles";
import { breadcrumbJsonLd, faqJsonLd, socialMetadata } from "@/lib/seo";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import OffersContent from "./Content";

// This page's whole point is to reflect the live DB state (campaign status/dates set in the
// LMS) on every request with no admin-side deploy. The "coming_soon"/"future"/"none" branches
// never touch a request-time API (cookies/headers), so Next's automatic static optimization
// would otherwise happily prerender and freeze whichever state was live at build time — silently
// breaking that promise. Force this route dynamic so every state is always resolved fresh.
export const dynamic = "force-dynamic";

// One state resolution per request, shared by generateMetadata and the page body.
const loadPage = cache(() => resolveOffersPage());

/** The page's own FAQs (after the campaign's): CMS text `offers.faq.<n>.question` / `.answer`, n = 1, 2, … */
function genericFaqs(text: Record<string, string>) {
  const out: { question: string; answer: string }[] = [];
  for (let n = 1; text[`offers.faq.${n}.question`]; n++) out.push({ question: text[`offers.faq.${n}.question`], answer: text[`offers.faq.${n}.answer`] ?? "" });
  return out;
}

/** "{campaign} — …" style templates from the CMS text. */
const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverrides("/offers", await offersMetadata());
}

async function offersMetadata(): Promise<Metadata> {
  const [page, { text, brand }, siteUrl] = await Promise.all([loadPage(), getSiteInfo(), companySiteUrl()]);
  const campaign = page.active?.campaign ?? page.next?.campaign ?? null;
  const vars = { campaign: campaign?.name ?? text["offers.meta.nextCampaign"] ?? "", headline: campaign?.theme.bannerHeadline ?? campaign?.name ?? "" };
  const title = fill(
    page.state === "active" && campaign ? text["offers.meta.titleActive"]
    : page.state === "none" ? text["offers.meta.titleNone"]
    : campaign ? text["offers.meta.titleUpcoming"]
    : text["offers.meta.titleDefault"],
    vars
  );
  const description = fill(
    page.state === "active" && campaign ? text["offers.meta.descriptionActive"]
    : page.state === "none" ? text["offers.meta.descriptionNone"]
    : text["offers.meta.descriptionUpcoming"],
    vars
  );
  const image = campaign?.bannerImage ?? text["offers.meta.defaultImage"];

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/offers` },
    ...socialMetadata({ title, description, path: "/offers", image, imageAlt: title, siteName: brand.namePrimary + brand.nameAccent, origin: siteUrl }),
  };
}

export default async function OffersPage() {
  const [page, { text }, siteUrl] = await Promise.all([loadPage(), getSiteInfo(), companySiteUrl()]);
  const GENERIC_FAQS = genericFaqs(text);
  const data = page.active;

  // Personalization: a signed-in portal user gets offers matched to their role plus their spendable credits.
  // Anonymous visitors simply get the generic page — this never blocks rendering.
  let viewer: { firstName: string | null; roleLabel: string | null; credits: number } | null = null;
  let viewerTab: ReturnType<typeof tabForPortalRole> = null;
  try {
    const user = page.state === "active" ? await getCurrentPortalUser() : null;
    if (user) {
      viewerTab = tabForPortalRole(user.role);
      const credits = await getAvailableBalance(user.id).catch(() => 0);
      viewer = { firstName: user.displayName.split(" ")[0] || null, roleLabel: PORTAL_ROLE_META[user.role]?.label ?? null, credits };
    }
  } catch {
    /* treat as anonymous */
  }

  const faqCampaign = data?.campaign ?? page.next?.campaign ?? null;
  const faqs = faqCampaign
    ? [...faqCampaign.faqs.map((f) => ({ question: f.question, answer: f.answer })), ...GENERIC_FAQS]
    : GENERIC_FAQS;

  const jsonLd = [
    breadcrumbJsonLd([
      { name: text["offers.breadcrumb.home"] ?? "", path: "/" },
      { name: text["offers.breadcrumb.page"] ?? "", path: "/offers" },
    ], siteUrl),
    faqJsonLd(faqs),
  ];

  // First render of a live campaign kicks off the one-time "it's live" notifications for subscribers (idempotent, never blocks).
  if (page.state === "active" && data) void dispatchCampaignStart({ _id: data.campaign._id, name: data.campaign.name }).catch(() => {});

  return (
    <>
      {jsonLd.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
      ))}
      {page.state === "active" && data && (
        <>
          <StateWatcher serverTime={page.serverTime} endsAt={data.campaign.endDate} pollMs={120_000} />
          <OffersContent campaign={data.campaign} offers={data.offers} faqs={faqs} viewer={viewer} viewerTab={viewerTab} />
        </>
      )}
      {(page.state === "coming_soon" || page.state === "future") && page.next && (
        <OffersUpcoming variant={page.state} campaign={page.next.campaign} preview={page.next.preview} later={page.later} serverTime={page.serverTime} faqs={faqs} />
      )}
      {page.state === "none" && <OffersFallback serverTime={page.serverTime} lastEnded={page.lastEnded} faqs={faqs} />}
    </>
  );
}
