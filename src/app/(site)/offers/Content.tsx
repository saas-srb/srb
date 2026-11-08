"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Code2, Bot, Users, GraduationCap, Briefcase, Megaphone } from "lucide-react";
import OffersHero from "@/components/offers/OffersHero";
import AudienceSelector from "@/components/offers/AudienceSelector";
import DealOfTheDaySection from "@/components/offers/DealOfTheDaySection";
import CategoryOffersSection from "@/components/offers/CategoryOffersSection";
import FlashDealsStrip from "@/components/offers/FlashDealsStrip";
import WhyUsSection from "@/components/offers/WhyUsSection";
import HowItWorksSection from "@/components/offers/HowItWorksSection";
import OffersFaqSection from "@/components/offers/OffersFaqSection";
import FinalCtaSection from "@/components/offers/FinalCtaSection";
import StickyMobileClaimBar from "@/components/offers/StickyMobileClaimBar";
import DesktopScrollCta from "@/components/offers/DesktopScrollCta";
import ExitIntentModal from "@/components/offers/ExitIntentModal";
import PersonalizedOffers, { type OffersViewer } from "@/components/offers/PersonalizedOffers";
import OfferDetailsSheet from "@/components/offers/OfferDetailsSheet";
import OfferCard from "@/components/offers/OfferCard";
import OfferMarketplaceBar, { type MarketplaceSort } from "@/components/offers/OfferMarketplaceBar";
import { useOfferClaim } from "@/components/offers/OfferClaimProvider";
import { useOfferTracking } from "@/lib/useOfferTracking";
import { setServerTime, nowMs } from "@/lib/offers/live";
import { PUBLIC_AUDIENCE_TABS, estimateSavings, type PublicAudienceTabKey, type OfferType } from "@/lib/offers/constants";
import type { SerializedCampaign } from "@/lib/offers/campaigns";
import type { SerializedOffer } from "@/lib/offers/offers";
import type { CategorySlug } from "@/lib/categories";
import { useText } from "@/components/products/sitecraft-ai/TextContext";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";

const CATEGORY_META = (tx: (key: string) => string): Record<CategorySlug, { id: string; icon: typeof Code2; title: string; description: string }> => ({
  "software-development": {
    id: "software-development-offers",
    icon: Code2,
    title: tx("offers.content.software-development-offers"),
    description: tx("offers.content.web-mobile-ai-and-cloud-engineering-for-"),
  },
  "digital-marketing": {
    id: "digital-marketing-offers",
    icon: Megaphone,
    title: tx("offers.content.digital-marketing-offers"),
    description: tx("offers.content.seo-ads-social-media-growth-strategies-d"),
  },
  "ai-automations": {
    id: "ai-automation-offers",
    icon: Bot,
    title: tx("offers.content.ai-automation-offers"),
    description: tx("offers.content.automate-your-business-with-ai-agents-ch"),
  },
  "resource-augmentation": {
    id: "hiring-offers",
    icon: Users,
    title: tx("offers.content.developer-hiring-offers"),
    description: tx("offers.content.hire-pre-vetted-developers-individual-de"),
  },
  "industrial-training": {
    id: "training-offers",
    icon: GraduationCap,
    title: tx("offers.content.student-training-offers"),
    description: tx("offers.content.launch-your-tech-career-for-less-industr"),
  },
  "internship-program": {
    id: "internship-offers",
    icon: Briefcase,
    title: tx("offers.content.internship-offers"),
    description: tx("offers.content.turn-your-skills-into-real-experience-li"),
  },
});

const DEFAULT_ORDER: CategorySlug[] = [
  "software-development",
  "digital-marketing",
  "ai-automations",
  "resource-augmentation",
  "industrial-training",
  "internship-program",
];

const TAB_PRIORITY: Record<PublicAudienceTabKey, CategorySlug[]> = {
  CLIENT: ["software-development", "digital-marketing", "ai-automations", "resource-augmentation"],
  STUDENT: ["industrial-training", "internship-program"],
  HIRING: ["resource-augmentation"],
};

function orderedCategories(tab: PublicAudienceTabKey | null): CategorySlug[] {
  if (!tab) return DEFAULT_ORDER;
  const priority = TAB_PRIORITY[tab];
  const rest = DEFAULT_ORDER.filter((c) => !priority.includes(c));
  return [...priority, ...rest];
}

const TAB_STORAGE_KEY = "offers_tab";
const LIVE_POLL_MS = 45_000;

function isTabKey(v: unknown): v is PublicAudienceTabKey {
  return v === "CLIENT" || v === "STUDENT" || v === "HIRING";
}

export default function OffersContent({
  campaign,
  offers: initialOffers,
  faqs,
  viewer,
  viewerTab,
}: {
  campaign: SerializedCampaign | null;
  offers: SerializedOffer[];
  faqs: { question: string; answer: string }[];
  viewer: OffersViewer | null;
  /** Audience tab implied by the signed-in portal role (server-decided). */
  viewerTab: PublicAudienceTabKey | null;
}) {
  const tx = useText();
  const { brand: shareSiteBrand } = useSiteInfo();
  const shareBrand = shareSiteBrand.namePrimary + shareSiteBrand.nameAccent;
  const [tab, setTabState] = useState<PublicAudienceTabKey | null>(viewerTab);
  const [offers, setOffers] = useState<SerializedOffer[]>(initialOffers);
  const [detailOffer, setDetailOffer] = useState<SerializedOffer | null>(null);
  const [campaignEnded, setCampaignEnded] = useState(false);
  // "It just went live" celebration for visitors who were waiting on the coming-soon page (or arrive within 15 min of launch).
  const [justLive, setJustLive] = useState(false);
  const [typeFilter, setTypeFilter] = useState<OfferType | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MarketplaceSort>("featured");
  const { openClaim } = useOfferClaim();
  const track = useOfferTracking(campaign?._id ?? "");
  const impressionsFired = useRef(false);

  useEffect(() => {
    if (!campaign) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser/server clock comparison only makes sense after mount
    setJustLive(nowMs() - new Date(campaign.startDate).getTime() < 15 * 60_000);
  }, [campaign]);

  const setTab = useCallback((next: PublicAudienceTabKey | null) => {
    setTabState(next);
    try {
      if (next) window.localStorage.setItem(TAB_STORAGE_KEY, next);
      else window.localStorage.removeItem(TAB_STORAGE_KEY);
    } catch {
      /* storage unavailable — selection just isn't remembered */
    }
  }, []);

  // Returning visitors: `?for=` deep link > remembered tab (a signed-in role always wins because it is already the initial state).
  useEffect(() => {
    if (viewerTab) return;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("for")?.toUpperCase();
      const remembered = window.localStorage.getItem(TAB_STORAGE_KEY);
      const pick = isTabKey(fromUrl) ? fromUrl : isTabKey(remembered) ? remembered : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists client-side
      if (pick) setTabState(pick);
    } catch {
      /* ignore */
    }
  }, [viewerTab]);

  // Real-time status: refresh claim counts / sold-out / expiry every 45s while the tab is visible.
  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/offers/public?campaignId=${encodeURIComponent(campaign!._id)}`, { cache: "no-store" });
        if (!res.ok) return; // transient failure — keep what's on screen
        const json = (await res.json()) as { active: boolean; serverTime?: number; offers: SerializedOffer[] };
        if (typeof json.serverTime === "number") setServerTime(json.serverTime);
        if (cancelled) return;
        if (!json.active) setCampaignEnded(true);
        else setOffers(json.offers);
      } catch {
        /* offline — keep what's on screen */
      }
    }
    void refresh();
    const id = setInterval(refresh, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [campaign]);

  const tabAudiences = tab ? PUBLIC_AUDIENCE_TABS.find((t) => t.key === tab)?.matches : undefined;
  const visibleOffers = useMemo(() => {
    if (!tabAudiences) return offers;
    return offers.filter((o) => o.audience.includes("ALL") || o.audience.some((a) => tabAudiences.includes(a)));
  }, [offers, tabAudiences]);

  // Marketplace: type / search / sort narrow the audience-filtered offers. Any active refinement swaps the category
  // sections for one flat, sorted result grid so results are never scattered across five sections.
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<OfferType, number>> = {};
    for (const o of visibleOffers) for (const t of o.offerTypes ?? []) counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  }, [visibleOffers]);

  const refining = typeFilter !== null || query.trim() !== "" || sort !== "featured";
  const results = useMemo(() => {
    if (!refining) return [];
    const q = query.trim().toLowerCase();
    const list = visibleOffers.filter((o) => {
      if (typeFilter && !(o.offerTypes ?? []).includes(typeFilter)) return false;
      if (!q) return true;
      return [o.title, o.description ?? "", o.linked?.label ?? "", ...(o.benefits ?? [])].some((t) => t.toLowerCase().includes(q));
    });
    const pct = (o: SerializedOffer) => {
      const { original, savings } = estimateSavings(o.pricing);
      return original ? savings / original : o.pricing.percentage ? o.pricing.percentage / 100 : 0;
    };
    const featuredScore = (o: SerializedOffer) => (o.isDealOfTheDay ? 3 : 0) + (o.isFeatured ? 2 : 0) + (o.isFlashDeal ? 1 : 0);
    return [...list].sort((a, b) =>
      sort === "ending" ? new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime()
      : sort === "discount" ? pct(b) - pct(a)
      : sort === "popular" ? (b.claimedCount ?? 0) - (a.claimedCount ?? 0)
      : featuredScore(b) - featuredScore(a) || b.priority - a.priority
    );
  }, [visibleOffers, typeFilter, query, sort, refining]);

  const dealOfTheDay = offers.find((o) => o.isDealOfTheDay) ?? null;
  const flashDeals = visibleOffers.filter((o) => o.isFlashDeal);
  const categories = orderedCategories(tab);

  useEffect(() => {
    if (!campaign || impressionsFired.current) return;
    impressionsFired.current = true;
    track("campaign_view", {});
    // offer_view is fired per card when it actually scrolls into view (see handleView), not for every offer at page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?._id]);

  const handleView = useCallback(
    (offer: SerializedOffer) => track("offer_view", { offerId: offer._id, category: offer.category }, { once: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign?._id]
  );

  const handleExpire = useCallback(
    (offer: SerializedOffer) => track("countdown_expired", { offerId: offer._id, category: offer.category }, { once: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign?._id]
  );

  function handleSelectAudience(key: PublicAudienceTabKey) {
    setTab(key);
    const id = CATEGORY_META(tx)[TAB_PRIORITY[key][0]].id;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleClaim(offer: SerializedOffer) {
    track("offer_click", { offerId: offer._id, category: offer.category, audience: tab ?? undefined }, { once: true });
    setDetailOffer(null);
    // let the details sheet finish closing before the claim sheet opens (two open sheets fight over focus)
    setTimeout(() => openClaim(offer), detailOffer ? 220 : 0);
  }

  function handleDetails(offer: SerializedOffer) {
    track("offer_detail_open", { offerId: offer._id, category: offer.category });
    setDetailOffer(offer);
  }

  async function handleShare(offer: SerializedOffer) {
    track("share_click", { offerId: offer._id, category: offer.category });
    const url = `${window.location.origin}/offers?offer=${offer._id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: offer.title, text: `${offer.title} — limited-time offer from ${shareBrand}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Offer link copied");
    } catch {
      /* share sheet dismissed */
    }
  }

  // Deep link: /offers?offer=<id> opens that offer's details once offers are on screen.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("offer");
    if (!id) return;
    const target = initialOffers.find((o) => o._id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time open from the URL
    if (target) setDetailOffer(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col min-h-screen selection:bg-primary/30 overflow-x-clip">
      {justLive && !campaignEnded && (
        <div className="border-b border-primary/30 bg-primary/10 px-4 py-3 text-center text-sm font-semibold text-primary">
          🎉 {campaign?.name}{tx("offers.content.just-went-live-claim-your-offers-before-")}</div>
      )}

      {campaignEnded && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm font-medium text-destructive">
          {tx("offers.content.this-campaign-has-just-ended")}{" "}
          <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-2">
            {tx("offers.content.refresh")}</button>{" "}
          {tx("offers.content.to-see-what-s-live-next")}</div>
      )}

      <OffersHero campaign={campaign} onSelectAudience={handleSelectAudience} onCampaignEnd={() => setCampaignEnded(true)} />

      {campaign && <AudienceSelector selected={tab} onSelect={setTab} />}

      {campaign && (
        <PersonalizedOffers
          offers={offers}
          tab={tab}
          viewer={viewer}
          onClaim={handleClaim}
          onDetails={handleDetails}
          onView={handleView}
          onExpire={handleExpire}
          onPersonalizedView={(t) => track("personalized_view", { audience: t === "CLIENT" ? "CLIENT" : t === "STUDENT" ? "STUDENT" : t === "HIRING" ? "HIRING" : undefined })}
        />
      )}

      {dealOfTheDay && <DealOfTheDaySection offer={dealOfTheDay} onClaim={handleClaim} />}

      {flashDeals.length > 0 && <FlashDealsStrip offers={flashDeals} onClaim={handleClaim} />}

      {campaign && <DesktopScrollCta campaignId={campaign._id} offer={dealOfTheDay ?? offers[0] ?? null} onClaim={handleClaim} />}

      {campaign && (
        <OfferMarketplaceBar counts={typeCounts} type={typeFilter} onType={setTypeFilter} query={query} onQuery={setQuery} sort={sort} onSort={setSort} total={visibleOffers.length} />
      )}

      {refining && (
        <section className="bg-background py-14">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <p className="mb-6 text-sm font-semibold text-muted-foreground">{results.length} {results.length === 1 ? "offer" : "offers"}{tx("offers.content.found")}</p>
            {results.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((o) => (
                  <OfferCard key={o._id} offer={o} onClaim={handleClaim} onDetails={handleDetails} onView={handleView} onExpire={handleExpire} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
                <p className="font-semibold text-foreground">{tx("offers.content.no-offers-match-that-yet")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{tx("offers.content.try-another-category-or-tell-us-what-you")}</p>
                <button type="button" onClick={() => { setTypeFilter(null); setQuery(""); setSort("featured"); }} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">{tx("offers.content.clear-filters")}</button>
              </div>
            )}
          </div>
        </section>
      )}

      {!refining && categories.map((category, i) => {
        const meta = CATEGORY_META(tx)[category];
        const categoryOffers = visibleOffers.filter((o) => o.category === category);
        return (
          <CategoryOffersSection
            key={category}
            id={meta.id}
            icon={meta.icon}
            title={meta.title}
            description={meta.description}
            offers={categoryOffers}
            onClaim={handleClaim}
            onDetails={handleDetails}
            onView={handleView}
            onExpire={handleExpire}
            tone={i % 2 === 0 ? "default" : "muted"}
          />
        );
      })}

      <WhyUsSection />
      <HowItWorksSection />
      <OffersFaqSection faqs={faqs} />
      <FinalCtaSection
        hasCampaign={Boolean(campaign)}
        campaignId={campaign?._id}
        onExploreOffers={() => document.getElementById(CATEGORY_META(tx)[DEFAULT_ORDER[0]].id)?.scrollIntoView({ behavior: "smooth" })}
      />

      <StickyMobileClaimBar topOffer={dealOfTheDay ?? visibleOffers[0] ?? null} onClaim={handleClaim} />

      {campaign && <ExitIntentModal campaignId={campaign._id} offer={dealOfTheDay ?? offers[0] ?? null} onClaim={handleClaim} />}

      <OfferDetailsSheet offer={detailOffer} onOpenChange={(open) => !open && setDetailOffer(null)} onClaim={handleClaim} onShare={handleShare} />
    </div>
  );
}
