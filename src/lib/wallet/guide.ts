import "server-only";
import { listRewardRules, type RewardRule } from "@/lib/wallet/reward-rules";
import { resolveUsagePolicy } from "@/lib/wallet/usage-rules";
import { resolveCampaign, DEFAULT_CAMPAIGN_SETTINGS } from "@/lib/wallet/campaigns";
import { APPLIES_TO, GUIDE_AUDIENCES, EARN_GUIDE, type GuideAudience } from "@/lib/wallet/earn-guide";
import { REFERRAL_QUALIFYING_EVENT_LABELS, USAGE_MODULES, USAGE_MODULE_LABELS, type RewardRuleType } from "@/lib/wallet/constants";
import { workflowFor } from "@/lib/lead-management/workflows";
import { getActiveCampaign } from "@/lib/offers/campaigns";
import { getPublicOffers } from "@/lib/offers/offers";
import { formatOfferBadge } from "@/lib/offers/constants";
import { getCategoryLabel } from "@/lib/categories";

export interface GuideWay {
  type: RewardRuleType;
  title: string;
  amount: number;
  expiresInDays: number | null;
  when: string;
  steps: string[];
  note?: string;
  frequency: string;
}
export interface GuideStage {
  key: string;
  label: string;
  amount: number;
}
export interface GuideUsage {
  module: string;
  label: string;
  allowed: boolean;
  maxPercent: number;
  maxPerUse: number | null;
  minOrder: number | null;
}
export interface AudienceGuide {
  id: GuideAudience;
  label: string;
  blurb: string;
  ways: GuideWay[];
  stages: GuideStage[];
  /** Sum of every one-time reward plus every journey stage — the "you can earn up to" headline. */
  potential: number;
  usage: GuideUsage[];
  referral: { state: "default" | "active" | "off"; campaignName: string | null; event: string; cap: number; referrer: number; referee: number };
}
export interface RewardsGuide {
  audiences: AudienceGuide[];
  offers: { campaign: { name: string; endDate: string } | null; items: { id: string; title: string; badge: string; category: string; href: string }[] };
}

/** Same specificity order the payout engine uses: (role+subKey) → (ALL+subKey) → (role) → (ALL). */
export function pick(rules: RewardRule[], type: RewardRuleType, role: GuideAudience, subKey?: string | null): RewardRule | null {
  const of = rules.filter((r) => r.type === type && r.isActive);
  const order: ((r: RewardRule) => boolean)[] = [];
  if (subKey) order.push((r) => r.appliesToRole === role && r.subKey === subKey, (r) => r.appliesToRole === "ALL" && r.subKey === subKey);
  order.push((r) => r.appliesToRole === role && !r.subKey, (r) => r.appliesToRole === "ALL" && !r.subKey);
  for (const f of order) {
    const hit = of.find(f);
    if (hit) return hit.amount > 0 ? hit : null;
  }
  return null;
}

export async function getRewardsGuide(): Promise<RewardsGuide> {
  const rules = await listRewardRules();

  const audiences: AudienceGuide[] = [];
  for (const a of GUIDE_AUDIENCES) {
    const ways: GuideWay[] = [];
    for (const type of APPLIES_TO[a.id]) {
      const rule = pick(rules, type, a.id);
      // Milestone bonuses have no generic rule — list each configured milestone instead.
      if (type === "referral_milestone") {
        const milestones = rules.filter((r) => r.type === type && r.isActive && r.amount > 0 && r.subKey && (r.appliesToRole === a.id || r.appliesToRole === "ALL"));
        for (const m of milestones.sort((x, y) => Number(x.subKey) - Number(y.subKey))) {
          const g = EARN_GUIDE[type];
          ways.push({ type, title: `${m.subKey} rewarded referrals`, amount: m.amount, expiresInDays: m.expiresInDays, when: g.when, steps: g.steps, note: g.note, frequency: "One time" });
        }
        continue;
      }
      if (!rule) continue;
      const g = EARN_GUIDE[type];
      ways.push({ type, title: g.title, amount: rule.amount, expiresInDays: rule.expiresInDays, when: g.when, steps: g.steps, note: g.note, frequency: g.frequency });
    }

    const stages: GuideStage[] = workflowFor(a.id)
      .filter((s) => s.terminal !== "lost")
      .map((s) => ({ key: s.key, label: s.portalLabel, amount: pick(rules, "stage_complete", a.id, s.key)?.amount ?? 0 }))
      .filter((s) => s.amount > 0)
      .slice(1); // the first stage is where you start, not something you complete

    const oneTime = ways.filter((w) => w.frequency === "One time" && w.type !== "referral_referee").reduce((s, w) => s + w.amount, 0);
    const potential = oneTime + stages.reduce((s, x) => s + x.amount, 0);

    const usage: GuideUsage[] = [];
    for (const m of USAGE_MODULES) {
      const p = await resolveUsagePolicy(m, a.id);
      usage.push({ module: m, label: USAGE_MODULE_LABELS[m], allowed: p.enabled, maxPercent: p.maxPercentOfPrice, maxPerUse: p.maxCreditsPerTransaction, minOrder: p.minOrderValue });
    }

    const resolution = await resolveCampaign(a.id);
    const campaign = resolution.state === "active" ? resolution.campaign : null;
    const referrerRule = pick(rules, "referral_referrer", a.id);
    const refereeRule = pick(rules, "referral_referee", a.id);
    audiences.push({
      id: a.id,
      label: a.label,
      blurb: a.blurb,
      ways,
      stages,
      potential,
      usage,
      referral: {
        state: resolution.state === "inactive" ? "off" : campaign ? "active" : "default",
        campaignName: campaign?.name ?? null,
        event: REFERRAL_QUALIFYING_EVENT_LABELS[campaign?.qualifyingEvent ?? DEFAULT_CAMPAIGN_SETTINGS.qualifyingEvent],
        cap: campaign?.maxReferralsPerReferrer ?? DEFAULT_CAMPAIGN_SETTINGS.maxReferralsPerReferrer,
        referrer: referrerRule?.amount ?? 0,
        referee: refereeRule?.amount ?? 0,
      },
    });
  }

  const active = await getActiveCampaign().catch(() => null);
  const offerDocs = active ? await getPublicOffers({ campaignId: active._id }).catch(() => []) : [];
  return {
    audiences,
    offers: {
      campaign: active ? { name: active.name, endDate: active.endDate.toISOString() } : null,
      items: offerDocs.slice(0, 6).map((o) => ({ id: o._id, title: o.title, badge: o.badgeText || formatOfferBadge(o.pricing), category: getCategoryLabel(o.category), href: "/offers" })),
    },
  };
}

