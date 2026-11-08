import "server-only";
import { COLLECTIONS, smmsCollection, notDeleted, escapeRegex } from "@/lib/products/viralpulse-ai/db";
import { listAccounts } from "@/lib/products/viralpulse-ai/accounts/service";
import { getCampaign, campaignsCollection, type CampaignDoc } from "@/lib/products/viralpulse-ai/campaigns";
import { listAdsForCampaign } from "@/lib/products/viralpulse-ai/ads";
import { getMediaMany } from "@/lib/products/viralpulse-ai/media";
import { normalizeAdPaid, normalizeCampaignPaid } from "./meta/draft";
import { evaluateGuard, getGuard, type GuardSettings, type GuardVerdict } from "./guard";
import { launchesCollection, approvalCovers, getActiveLaunchForCampaign, type LaunchDoc } from "./launches";
import { snapshotsCollection } from "./snapshots";
import { INSIGHTS_SOURCE } from "./ads-sync";
import { listStatus, emptyWizard, type ListStatus, type WizardAd, type WizardState } from "./ui";
import { currencyDigits } from "./types";

/** Server-side loaders for the Campaigns & Ads screens. Everything returned is plain JSON (dates as ISO strings) and carries no tokens. */

export interface AccountOption {
  id: string;
  externalId: string;
  name: string;
  handle: string | null;
  status: string;
  enabled: boolean;
  pageExternalId: string | null;
  lastError: string | null;
}
export interface WizardAccounts {
  adAccounts: AccountOption[];
  pages: AccountOption[];
  instagram: AccountOption[];
}

export async function loadAccountOptions(): Promise<WizardAccounts> {
  const [ad, pages, ig] = await Promise.all([listAccounts({ provider: "meta_ad_account" }), listAccounts({ provider: "facebook_page" }), listAccounts({ provider: "instagram_business" })]);
  const opt = (a: (typeof ad)[number]): AccountOption => ({ id: a.id, externalId: a.externalId, name: a.name, handle: a.handle, status: a.status, enabled: a.enabled, pageExternalId: a.meta?.pageId ?? null, lastError: a.lastError });
  return { adAccounts: ad.filter((a) => a.enabled).map(opt), pages: pages.filter((a) => a.enabled).map(opt), instagram: ig.filter((a) => a.enabled).map(opt) };
}

export interface GuardSummary {
  killSwitch: boolean;
  allowUncapped: boolean;
  requireSecondApprover: boolean;
  currencies: Record<string, { maxDailyPerLaunchMinor: number | null; maxTotalPerLaunchMinor: number | null; companyDailyCapMinor: number | null; companyMonthlyCapMinor: number | null; approvalThresholdMinor: number | null }>;
}
export const guardSummary = (g: GuardSettings): GuardSummary => ({ killSwitch: g.killSwitch, allowUncapped: g.allowUncapped, requireSecondApprover: g.requireSecondApprover, currencies: g.perCurrency });

export interface LaunchView {
  id: string;
  campaignId: string;
  state: LaunchDoc["state"];
  delivery: LaunchDoc["delivery"];
  active: boolean;
  actId: string;
  pageId: string;
  currency: string;
  commitment: LaunchDoc["commitment"];
  objects: LaunchDoc["objects"];
  pending: { kind: string; key: string; startedAt: string } | null;
  approval: { by: string; byEmail: string | null; at: string; note: string; committedDailyMinor: number; committedTotalMinor: number | null; secondApproverRequired: boolean } | null;
  approvalCovers: boolean;
  lastError: { message: string; paths: string[]; at: string } | null;
  compensation: LaunchDoc["compensation"];
  attempts: number;
  review: Record<string, { status: string | null; effectiveStatus: string | null; issues: string[]; at: string }>;
  externalStatus: { campaign: string | null; at: string } | null;
  lastSyncAt: string | null;
  events: { at: string; by: string; type: string; note: string }[];
  createdBy: string;
  createdAt: string;
  activatedAt: string | null;
  stopTime: string | null;
  adNames: Record<string, string>;
  adSetNames: Record<string, string>;
  /** The values the "edit after launch" form starts from. */
  draft: {
    campaignName: string;
    spendCapMinor: number | null;
    stopTime: string | null;
    campaignBudgetMinor: number | null;
    adSets: { key: string; name: string; budgetMinor: number | null; endTime: string | null }[];
    ads: { id: string; name: string; headline: string; primaryText: string; description: string; link: string; urlTags: string }[];
  };
  guard: GuardVerdict | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function launchView(l: LaunchDoc): Promise<LaunchView> {
  const guard = l.delivery === "active" || l.state !== "ready" ? null : await guardFor(l.currency, l.commitment, l._id);
  return {
    id: l._id, campaignId: l.campaignId, state: l.state, delivery: l.delivery, active: l.active, actId: l.actId, pageId: l.pageId, currency: l.currency, commitment: l.commitment, objects: l.objects,
    pending: l.pending ? { kind: l.pending.kind, key: l.pending.key, startedAt: l.pending.startedAt.toISOString() } : null,
    approval: l.approval ? { by: l.approval.by, byEmail: l.approval.byEmail, at: l.approval.at.toISOString(), note: l.approval.note, committedDailyMinor: l.approval.committedDailyMinor, committedTotalMinor: l.approval.committedTotalMinor, secondApproverRequired: l.approval.secondApproverRequired } : null,
    approvalCovers: approvalCovers(l),
    lastError: l.lastError ? { message: l.lastError.message, paths: l.lastError.paths, at: l.lastError.at.toISOString() } : null,
    compensation: l.compensation, attempts: l.attempts,
    review: Object.fromEntries(Object.entries(l.review).map(([k, v]) => [k, { status: v.status, effectiveStatus: v.effectiveStatus, issues: v.issues, at: v.at.toISOString() }])),
    externalStatus: l.externalStatus ? { campaign: l.externalStatus.campaign, at: l.externalStatus.at.toISOString() } : null,
    lastSyncAt: iso(l.lastSyncAt),
    events: l.events.slice(-30).map((e) => ({ at: e.at.toISOString(), by: e.by, type: e.type, note: e.note })),
    createdBy: l.createdBy, createdAt: l.createdAt.toISOString(), activatedAt: iso(l.activatedAt), stopTime: l.campaign.stopTime,
    adNames: Object.fromEntries(l.ads.map((a) => [a.id, a.name])),
    adSetNames: Object.fromEntries(l.campaign.adSets.map((s) => [s.key, s.name])),
    draft: {
      campaignName: l.campaignName,
      spendCapMinor: l.campaign.spendCapMinor,
      stopTime: l.campaign.stopTime,
      campaignBudgetMinor: l.campaign.campaignBudget?.amountMinor ?? null,
      adSets: l.campaign.adSets.map((s) => ({ key: s.key, name: s.name, budgetMinor: s.budget?.amountMinor ?? null, endTime: s.endTime })),
      ads: l.ads.map((a) => ({ id: a.id, name: a.name, headline: a.headline, primaryText: a.primaryText, description: a.description, link: a.meta.link, urlTags: a.meta.urlTags })),
    },
    guard,
  };
}

export async function guardFor(currency: string, commitment: LaunchDoc["commitment"], excludeId: string | null): Promise<GuardVerdict> {
  const col = await launchesCollection();
  const running = await col.find({ active: true, delivery: "active", currency, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).toArray();
  return evaluateGuard(await getGuard(), currency, commitment, running.map((l) => l.commitment));
}

export interface StrategyView {
  summary: string;
  keyMessages: string[];
  audiences: { name: string; description: string; interests: string[] }[];
  adConcepts: { title: string; platform: string; format: "image" | "video"; headline: string; primaryText: string; description: string; cta: string }[];
}

export interface WizardLoad {
  state: WizardState;
  strategy: StrategyView | null;
  launch: LaunchView | null;
  lastSavedAt: string | null;
}

/** Existing campaign -> wizard state. Legacy campaigns and ads (copy only) are lifted on read by `getCampaign` / the normalisers; nothing is invented. */
export async function loadWizard(campaignId: string | null): Promise<WizardLoad | null> {
  if (!campaignId) return { state: emptyWizard(), strategy: null, launch: null, lastSavedAt: null };
  const c = await getCampaign(campaignId);
  if (!c) return null;
  const ads = (await listAdsForCampaign(campaignId)).filter((a) => (a.platform === "facebook" || a.platform === "instagram") && a.status !== "archived");
  const media = await getMediaMany(ads.flatMap((a) => a.mediaIds));
  const info = new Map(media.map((m) => [m._id, { name: m.name, kind: m.kind, width: m.width, height: m.height, durationSec: m.durationSec, aiDisclosed: Boolean(m.ai?.aiGenerated) }]));
  const paid = normalizeCampaignPaid(c.paid, c);
  const wads: WizardAd[] = ads.map((a) => ({
    key: a._id, id: a._id, name: a.name, platform: a.platform as "facebook" | "instagram", format: a.format, headline: a.content.headline, primaryText: a.content.primaryText, description: a.content.description, mediaIds: a.mediaIds,
    mediaInfo: Object.fromEntries(a.mediaIds.filter((i) => info.has(i)).map((i) => [i, info.get(i)!])),
    meta: normalizeAdPaid(a.paid, { cta: a.content.cta, landingPage: c.landingPage, format: a.format }).meta,
  }));
  const l = await getActiveLaunchForCampaign(campaignId);
  const state: WizardState = {
    campaignId, platform: "meta", name: c.name,
    brief: { landingPage: c.landingPage, targetAudience: c.targetAudience, offerService: c.offerService, tone: c.tone, language: c.language, industry: c.industry, brandInfo: c.brandInfo },
    currency: c.currency, meta: paid.meta, ads: wads, step: "account", confirm: { billing: false, rights: false, policies: false, noSpecialCategory: Boolean(paid.meta.objective), cbo: paid.meta.campaignBudget !== null },
  };
  const hasAi = Boolean(c.ai.summary || c.ai.adConcepts.length);
  return {
    state,
    strategy: hasAi ? { summary: c.ai.summary, keyMessages: c.ai.keyMessages, audiences: c.ai.audiences, adConcepts: c.ai.adConcepts.map((x) => ({ title: x.title, platform: x.platform, format: x.format, headline: x.headline, primaryText: x.primaryText, description: x.description, cta: x.cta })) } : null,
    launch: l ? await launchView(l) : null,
    lastSavedAt: c.updatedAt.toISOString(),
  };
}

// ── list ────────────────────────────────────────────────────────────────────────────────────────────

export interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  platform: "meta" | "other";
  platforms: string[];
  status: ListStatus;
  adAccount: string | null;
  adAccountId: string | null;
  adCount: number;
  dailyMinor: number | null;
  currency: string | null;
  start: string | null;
  end: string | null;
  updatedAt: string;
  archived: boolean;
  delivery: string | null;
}

export interface CampaignListFilter {
  q?: string;
  status?: string;
  platform?: string;
  objective?: string;
  account?: string;
  from?: string;
  to?: string;
}

export interface CampaignListResult {
  rows: CampaignRow[];
  counts: Record<ListStatus | "all", number>;
  stats: { running: number; paused: number; inReview: number; spendMonthMinor: number | null; spendCurrency: string | null; linkClicksMonth: number | null; lastSyncAt: string | null };
  accounts: { id: string; name: string }[];
}

const validDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);

export async function loadCampaignList(f: CampaignListFilter, now: Date = new Date()): Promise<CampaignListResult> {
  const col = await campaignsCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q.slice(0, 80)), "i");
    filter.$or = [{ name: rx }, { objective: rx }, { offerService: rx }];
  }
  const from = validDate(f.from);
  const to = validDate(f.to);
  if (from || to) filter.updatedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: new Date(to.getTime() + 86_400_000) } : {}) };
  const docs = (await col.find(filter, { projection: { ai: 0 } }).sort({ updatedAt: -1 }).limit(500).toArray()) as CampaignDoc[];
  const ids = docs.map((d) => d._id);
  const lcol = await launchesCollection();
  const launches = ids.length ? await lcol.find({ campaignId: { $in: ids }, platform: "meta", active: true }).toArray() : [];
  const byCampaign = new Map(launches.map((l) => [l.campaignId, l]));
  const adsCol = await smmsCollection<{ _id: string; campaignId: string; deletedAt: Date | null }>(COLLECTIONS.ads);
  const adCounts = ids.length ? await adsCol.aggregate<{ _id: string; n: number }>([{ $match: { campaignId: { $in: ids }, deletedAt: null } }, { $group: { _id: "$campaignId", n: { $sum: 1 } } }]).toArray() : [];
  const adCount = new Map(adCounts.map((a) => [a._id, a.n]));
  const accts = await loadAccountOptions();
  const acctName = new Map(accts.adAccounts.map((a) => [a.id, a.name]));

  const all: CampaignRow[] = docs.map((d) => {
    const l = byCampaign.get(d._id) ?? null;
    const paid = normalizeCampaignPaid(d.paid, d);
    const isMeta = d.platforms.some((p) => p === "facebook" || p === "instagram");
    const status: ListStatus = d.status === "archived" ? "ended" : listStatus(l ? { state: l.state, delivery: l.delivery, active: l.active, review: l.review, stopTime: l.campaign.stopTime } : null, now);
    const daily = (l?.commitment.dailyMinor ?? null) !== null ? l!.commitment.dailyMinor : null;
    return {
      id: d._id, name: d.name, objective: paid.meta.objective ?? "", platform: isMeta ? "meta" : "other", platforms: d.platforms, status, adAccount: paid.meta.adAccountId ? acctName.get(paid.meta.adAccountId) ?? null : null, adAccountId: paid.meta.adAccountId,
      adCount: adCount.get(d._id) ?? 0, dailyMinor: daily, currency: l?.currency ?? null, start: paid.meta.startTime ?? iso(d.startDate), end: paid.meta.stopTime ?? iso(d.endDate), updatedAt: d.updatedAt.toISOString(), archived: d.status === "archived", delivery: l?.delivery ?? null,
    };
  });
  const matches = (r: CampaignRow) =>
    (!f.platform || r.platform === f.platform) && (!f.objective || r.objective === f.objective) && (!f.account || r.adAccountId === f.account);
  const base = all.filter(matches);
  const counts = { all: base.length, draft: 0, in_review: 0, running: 0, paused: 0, ended: 0, failed: 0 } as CampaignListResult["counts"];
  for (const r of base) counts[r.status]++;
  const rows = f.status && f.status !== "all" ? base.filter((r) => r.status === f.status) : base;

  // Stat cards: counts come from the same launches; money and clicks only from synced insight snapshots.
  const monthStart = `${now.toISOString().slice(0, 7)}-01`;
  const snaps = await snapshotsCollection();
  const sums = await snaps.aggregate<{ _id: string; v: number }>([{ $match: { platform: "meta", level: "campaign", source: INSIGHTS_SOURCE, date: { $gte: monthStart }, metric: { $in: ["spend", "inline_link_clicks"] } } }, { $group: { _id: "$metric", v: { $sum: "$value" } } }]).toArray();
  const spend = sums.find((s) => s._id === "spend")?.v ?? null;
  const clicks = sums.find((s) => s._id === "inline_link_clicks")?.v ?? null;
  const allLaunches = await lcol.find({ platform: "meta", active: true }).toArray();
  const currencies = [...new Set(allLaunches.map((l) => l.currency))];
  const synced = allLaunches.map((l) => l.lastSyncAt).filter((x): x is Date => Boolean(x)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const statuses = allLaunches.map((l) => listStatus({ state: l.state, delivery: l.delivery, active: l.active, review: l.review, stopTime: l.campaign.stopTime }, now));
  return {
    rows, counts,
    stats: {
      running: statuses.filter((s) => s === "running").length, paused: statuses.filter((s) => s === "paused").length, inReview: statuses.filter((s) => s === "in_review").length,
      // Spend is stored in the account's major unit; with several currencies a single total would be wrong, so it is only shown for one.
      spendMonthMinor: spend === null || currencies.length !== 1 ? null : Math.round(spend * 10 ** currencyDigits(currencies[0])), spendCurrency: currencies.length === 1 ? currencies[0] : null, linkClicksMonth: clicks, lastSyncAt: iso(synced),
    },
    accounts: accts.adAccounts.map((a) => ({ id: a.id, name: a.name })),
  };
}

// ── performance (synced insights only) ──────────────────────────────────────────────────────────────

export interface CampaignPerformance {
  totals: Partial<Record<"spend" | "impressions" | "reach" | "clicks" | "inline_link_clicks", number>>;
  actions: { metric: string; value: number }[];
  days: number;
  from: string;
  to: string;
  capturedAt: string;
  currency: string | null;
}

/** Totals from `smms_metric_snapshots` for this campaign's Meta campaign. null = nothing has been synced yet (the page then says so; it never shows zeros). */
export async function loadPerformance(campaignId: string, currency: string | null): Promise<CampaignPerformance | null> {
  const snaps = await snapshotsCollection();
  const rows = await snaps.aggregate<{ _id: string; v: number; from: string; to: string; at: Date; days: string[] }>([
    { $match: { platform: "meta", level: "campaign", source: INSIGHTS_SOURCE, campaignId } },
    { $group: { _id: "$metric", v: { $sum: "$value" }, from: { $min: "$date" }, to: { $max: "$date" }, at: { $max: "$capturedAt" }, days: { $addToSet: "$date" } } },
  ]).toArray();
  if (rows.length === 0) return null;
  const pick = (m: string) => rows.find((r) => r._id === m)?.v;
  const totals: CampaignPerformance["totals"] = {};
  for (const k of ["spend", "impressions", "reach", "clicks", "inline_link_clicks"] as const) { const v = pick(k); if (v !== undefined) totals[k] = v; }
  return {
    totals,
    actions: rows.filter((r) => r._id.startsWith("action:")).map((r) => ({ metric: r._id.slice(7), value: r.v })).sort((a, b) => b.value - a.value).slice(0, 8),
    days: Math.max(...rows.map((r) => r.days.length)),
    from: rows.map((r) => r.from).sort()[0],
    to: rows.map((r) => r.to).sort().at(-1)!,
    capturedAt: rows.map((r) => r.at).sort((a, b) => b.getTime() - a.getTime())[0].toISOString(),
    currency,
  };
}
