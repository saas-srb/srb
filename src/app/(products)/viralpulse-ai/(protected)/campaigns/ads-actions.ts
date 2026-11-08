"use server";

import { run } from "@/lib/products/viralpulse-ai/run";
import { can, ForbiddenError, SmmsInputError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { recordAudit } from "@/lib/products/viralpulse-ai/audit";
import { createCampaign, parseBrief, requireCampaign, saveCampaignPaid, statusAfterEdit, updateBrief, type CampaignBrief } from "@/lib/products/viralpulse-ai/campaigns";
import { createAd, listAdsForCampaign, parseAdHeader, saveAdPaid, softDeleteAd, updateAd } from "@/lib/products/viralpulse-ai/ads";
import { normalizeAd } from "@/lib/products/viralpulse-ai/content";
import { validMediaIds } from "@/lib/products/viralpulse-ai/media";
import { ctaLabel } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { META_OBJECTIVE_LABEL, normalizeAdSet, normalizeMetaCampaign, normalizeMetaAd, normalizeTargeting, buildTargetingSpec, buildPromotedObject, MetaApiError } from "@/lib/products/viralpulse-ai/ads-platforms";
import { defaultDeps } from "@/lib/products/viralpulse-ai/ads-platforms/deps";
import { getAdAccountInfo, listCustomAudiences, listPixels, listLeadForms, listAdAccountInstagramAccounts } from "@/lib/products/viralpulse-ai/ads-platforms/meta/account";
import { searchInterests, listTargetingCategory, searchGeo, searchLocales, deliveryEstimate, type TargetingClass } from "@/lib/products/viralpulse-ai/ads-platforms/meta/search";
import { formatMinorPlain, getGuard, saveGuard, setKillSwitch, type CurrencyCaps } from "@/lib/products/viralpulse-ai/ads-platforms/guard";
import {
  activateLaunch, approveLaunch, archiveLaunch, createLaunch, editLaunch, getActiveLaunchForCampaign, getLaunch, listLaunches, LaunchBlockedError, LaunchValidationError, engageKillSwitch, pauseAllRunning, pauseLaunch, resumeLaunch, revokeApproval, rollbackLaunch, validateLaunch,
  type LaunchDoc, type LaunchEdit,
} from "@/lib/products/viralpulse-ai/ads-platforms/launches";
import { guardSummary, launchView, loadAccountOptions } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import type { FieldError } from "@/lib/products/viralpulse-ai/ads-platforms/types";

/**
 * Server actions behind the Campaigns & Ads wizard. Every one resolves the viewer from the session cookie through `run`; arguments are never
 * trusted for identity. Meta errors are turned into plain messages here, so the browser never sees a raw API payload or a token.
 */

const who = (v: SmmsViewer) => ({ actorId: v.userId, actorEmail: v.email });
const need = (v: SmmsViewer, ...p: Parameters<typeof can>[1][]) => {
  for (const x of p) if (!can(v, x)) throw new ForbiddenError(x);
};
const id = (x: unknown, what = "item") => {
  if (typeof x !== "string" || !x || x.length > 80) throw new SmmsInputError(`That ${what} no longer exists.`);
  return x;
};
async function meta<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MetaApiError) throw new SmmsInputError(e.message);
    throw e;
  }
}
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ── saving the draft ───────────────────────────────────────────────────────────────────────────────

/**
 * Saves the whole wizard draft: the campaign (brief + Meta draft) and each ad. Creates the campaign on the first save. Returns the ids so the
 * browser can replace its local ad keys. Refused (with a plain message) while a launch exists in Meta: that is edited through the launch controls.
 */
export async function saveWizardAction(input: unknown) {
  return run(["CREATE_ADS"], async (v) => {
    const s = rec(input);
    const brief = rec(s.brief);
    const metaDraft = normalizeMetaCampaign(s.meta);
    const existingId = typeof s.campaignId === "string" && s.campaignId ? s.campaignId : null;
    const adsIn = (Array.isArray(s.ads) ? s.ads : []).slice(0, 50).map(rec);
    const landing = str(brief.landingPage, 500);
    const base: Record<string, unknown> = {
      name: str(s.name, 120), platforms: ["facebook", "instagram"], objective: metaDraft.objective ? META_OBJECTIVE_LABEL[metaDraft.objective] : "", targetAudience: str(brief.targetAudience, 1500), industry: str(brief.industry, 120),
      landingPage: /^https?:\/\/\S+$/i.test(landing) ? landing : "", offerService: str(brief.offerService, 500), tone: str(brief.tone, 120), language: str(brief.language, 60) || "English", brandInfo: str(brief.brandInfo, 3000),
      currency: str(s.currency, 3), startDate: metaDraft.startTime, endDate: metaDraft.stopTime,
    };
    let campaignId: string;
    if (existingId) {
      need(v, "EDIT_CAMPAIGNS");
      const c = await requireCampaign(existingId);
      const merged: CampaignBrief = parseBrief({ ...c, ...base, budget: c.budget, platforms: c.platforms.length ? c.platforms : base.platforms, offerId: c.offerId, clientId: c.clientId, keywords: c.keywords, cta: c.cta, currency: base.currency || c.currency });
      await updateBrief(existingId, merged, v.userId);
      campaignId = existingId;
    } else {
      need(v, "CREATE_CAMPAIGNS");
      const c = await createCampaign(parseBrief(base), v.userId);
      await recordAudit({ ...who(v), action: "create", entity: "campaign", entityId: c._id, entityLabel: c.name, recordId: c._id, summary: "Created in the Campaigns & Ads wizard" });
      campaignId = c._id;
    }
    await saveCampaignPaid(campaignId, { meta: metaDraft }, v);

    const campaign = await requireCampaign(campaignId);
    const current = await listAdsForCampaign(campaignId);
    const keep = new Set<string>();
    const adIds: Record<string, string> = {};
    for (const a of adsIn) {
      const m = normalizeMetaAd(a.meta);
      const format = m.creativeType === "video" ? "video" : "image";
      const platform = a.platform === "instagram" ? "instagram" : "facebook";
      const header = parseAdHeader({ name: str(a.name, 120), platform, format }, campaign.platforms);
      const content = normalizeAd({ headline: str(a.headline, 300), primaryText: str(a.primaryText, 5000), description: str(a.description, 2000), cta: m.ctaType ? ctaLabel(m.ctaType) : "" });
      const key = str(a.key, 80);
      const found = typeof a.id === "string" ? current.find((x) => x._id === a.id) : undefined;
      const mediaIds = await validMediaIds(a.mediaIds, format === "video" ? ["video", "image"] : ["image"]);
      let adId: string;
      if (found) {
        await updateAd(found._id, { ...header, content: { ...found.content, headline: content.headline, primaryText: content.primaryText, description: content.description, cta: content.cta }, mediaIds, status: statusAfterEdit(found.status) }, v.userId);
        adId = found._id;
      } else {
        const created = await createAd(campaignId, header, v.userId, content);
        await updateAd(created._id, { mediaIds }, v.userId);
        adId = created._id;
      }
      await saveAdPaid(adId, { meta: m }, v);
      keep.add(adId);
      adIds[key] = adId;
    }
    for (const old of current) if (!keep.has(old._id) && (old.platform === "facebook" || old.platform === "instagram")) await softDeleteAd(old._id, v.userId);
    return { campaignId, adIds, savedAt: new Date().toISOString() };
  });
}

// ── live account facts and targeting search ────────────────────────────────────────────────────────

async function requireAdAccount(accountId: unknown) {
  const acct = await defaultDeps.getAccount(id(accountId, "ad account"));
  if (!acct || acct.provider !== "meta_ad_account" || !acct.enabled) throw new SmmsInputError("Choose one of the connected Meta ad accounts.");
  return acct;
}

export async function accountContextAction(adAccountId: string) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const acct = await requireAdAccount(adAccountId);
    return meta(async () =>
      defaultDeps.withMeta(acct.id, async (c) => {
        const problems: Record<string, string> = {};
        const info = await getAdAccountInfo(c, acct.externalId);
        const grab = async <T>(key: string, fn: () => Promise<T>, empty: T): Promise<T> => {
          try {
            return await fn();
          } catch (e) {
            problems[key] = e instanceof MetaApiError || e instanceof Error ? e.message : "Could not be read.";
            return empty;
          }
        };
        const [pixels, audiences, instagram] = await Promise.all([
          grab("pixels", () => listPixels(c, acct.externalId), []),
          grab("audiences", () => listCustomAudiences(c, acct.externalId), []),
          grab("instagram", () => listAdAccountInstagramAccounts(c, acct.externalId), []),
        ]);
        return { info, pixels, audiences, instagram, problems, readAt: new Date().toISOString() };
      }),
    );
  }, { revalidate: false });
}

export async function leadFormsAction(pageAccountId: string) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const page = await defaultDeps.getAccount(id(pageAccountId, "Page"));
    if (!page || page.provider !== "facebook_page") throw new SmmsInputError("Choose one of the connected Facebook Pages.");
    const forms = await meta(() => defaultDeps.withMeta(page.id, (c, a) => listLeadForms(c, a.externalId)));
    return { forms };
  }, { revalidate: false });
}

const CLASSES = ["interests", "behaviors", "life_events", "industries", "income", "family_statuses"] as const;
export async function searchTargetingAction(adAccountId: string, kind: string, q: string) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const acct = await requireAdAccount(adAccountId);
    const cls = CLASSES.find((c) => c === kind) as TargetingClass | undefined;
    if (!cls) throw new SmmsInputError("Choose what to search: interests, behaviours or demographics.");
    const text = str(q, 100);
    const options = await meta(() =>
      defaultDeps.withMeta(acct.id, (c) => (cls === "interests" ? searchInterests(c, acct.id, text) : listTargetingCategory(c, acct.id, cls, text))),
    );
    return { options };
  }, { revalidate: false });
}

export async function searchGeoAction(adAccountId: string, q: string, types: string[]) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const acct = await requireAdAccount(adAccountId);
    const allowed = (Array.isArray(types) ? types : []).filter((t): t is "country" | "region" | "city" | "zip" => ["country", "region", "city", "zip"].includes(t));
    const options = await meta(() => defaultDeps.withMeta(acct.id, (c) => searchGeo(c, acct.id, str(q, 100), allowed.length ? allowed : undefined)));
    return { options };
  }, { revalidate: false });
}

export async function searchLocalesAction(adAccountId: string, q: string) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const acct = await requireAdAccount(adAccountId);
    return { options: await meta(() => defaultDeps.withMeta(acct.id, (c) => searchLocales(c, acct.id, str(q, 100)))) };
  }, { revalidate: false });
}

/** The AI proposes interest NAMES; this checks each against Meta's own search and returns only what exists (with its real id). Nothing is invented. */
export async function matchInterestsAction(adAccountId: string, names: string[]) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const acct = await requireAdAccount(adAccountId);
    const list = [...new Set((Array.isArray(names) ? names : []).map((n) => str(n, 80)).filter((n) => n.length >= 2))].slice(0, 10);
    const matches = await meta(() =>
      defaultDeps.withMeta(acct.id, async (c) => {
        const out: { query: string; options: Awaited<ReturnType<typeof searchInterests>> }[] = [];
        for (const n of list) out.push({ query: n, options: (await searchInterests(c, acct.id, n, 5)).slice(0, 3) });
        return out;
      }),
    );
    return { matches };
  }, { revalidate: false });
}

export async function deliveryEstimateAction(input: { adAccountId: string; adSet: unknown }) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const acct = await requireAdAccount(input?.adAccountId);
    const set = normalizeAdSet(input?.adSet);
    if (!set.optimizationGoal) throw new SmmsInputError("Choose the performance goal first; Meta estimates reach per goal.");
    const t = normalizeTargeting(set.targeting);
    const places = t.geo.countries.length + t.geo.regions.length + t.geo.cities.length + t.geo.zips.length;
    if (places === 0 && t.customAudiences.length === 0) throw new SmmsInputError("Add a location first.");
    const est = await meta(() => defaultDeps.withMeta(acct.id, (c) => deliveryEstimate(c, acct.externalId, { optimizationGoal: set.optimizationGoal!, targetingSpec: buildTargetingSpec(t), promotedObject: buildPromotedObject(set.promotedObject) })));
    return { estimate: est, at: new Date().toISOString() };
  }, { revalidate: false });
}

// ── validation and launch ──────────────────────────────────────────────────────────────────────────

export async function validateAction(campaignId: string) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const r = await meta(() => validateLaunch(id(campaignId, "campaign")));
    return { ok: r.ok, errors: r.errors, warnings: r.warnings, commitment: r.commitment, guard: r.guard, account: r.account, checkedAt: new Date().toISOString() };
  }, { revalidate: false });
}

interface LaunchResult {
  launch: Awaited<ReturnType<typeof launchView>> | null;
  errors: FieldError[];
  message: string | null;
  reasons: string[];
  done: boolean;
}

/** Runs a launch operation and reports blocked/validation outcomes as data (not as a thrown error) so the panel can show the field list and reasons. */
async function launchOp(fn: () => Promise<LaunchDoc | { launch: LaunchDoc; errors: FieldError[]; message: string | null; ok: boolean }>): Promise<LaunchResult> {
  try {
    const r = await meta(fn);
    if ("launch" in r) return { launch: await launchView(r.launch), errors: r.errors, message: r.message, reasons: [], done: r.ok };
    return { launch: await launchView(r), errors: [], message: null, reasons: [], done: true };
  } catch (e) {
    if (e instanceof LaunchValidationError) return { launch: null, errors: e.errors, message: e.message, reasons: [], done: false };
    if (e instanceof LaunchBlockedError) return { launch: null, errors: [], message: e.message, reasons: e.reasons, done: false };
    throw e;
  }
}

export async function createLaunchAction(campaignId: string) {
  return run(["CREATE_ADS", "EDIT_CAMPAIGNS"], async (v) => ({ result: await launchOp(() => createLaunch(id(campaignId, "campaign"), v)) }));
}
export async function resumeLaunchAction(launchId: string) {
  return run(["CREATE_ADS", "EDIT_CAMPAIGNS"], async (v) => ({ result: await launchOp(() => resumeLaunch(id(launchId, "launch"), v)) }));
}
export async function rollbackLaunchAction(launchId: string) {
  return run(["CREATE_ADS"], async (v) => ({ result: await launchOp(() => rollbackLaunch(id(launchId, "launch"), v)) }));
}
export async function approveLaunchAction(launchId: string, note: string) {
  return run(["APPROVE_AD_SPEND"], async (v) => ({ result: await launchOp(() => approveLaunch(id(launchId, "launch"), v, { note: str(note, 500) })) }));
}
export async function revokeApprovalAction(launchId: string) {
  return run(["APPROVE_AD_SPEND"], async (v) => ({ result: await launchOp(() => revokeApproval(id(launchId, "launch"), v)) }));
}
export async function activateLaunchAction(launchId: string) {
  return run(["PUBLISH_CONTENT"], async (v) => ({ result: await launchOp(() => activateLaunch(id(launchId, "launch"), v)) }));
}
export async function pauseLaunchAction(launchId: string) {
  return run(["PUBLISH_CONTENT"], async (v) => ({ result: await launchOp(() => pauseLaunch(id(launchId, "launch"), v)) }));
}
export async function archiveLaunchAction(launchId: string) {
  return run(["PUBLISH_CONTENT"], async (v) => ({ result: await launchOp(() => archiveLaunch(id(launchId, "launch"), v)) }));
}
export async function editLaunchAction(launchId: string, edit: LaunchEdit) {
  return run(["EDIT_CAMPAIGNS"], async (v) => ({ result: await launchOp(() => editLaunch(id(launchId, "launch"), v, rec(edit) as LaunchEdit)) }));
}

export async function pauseAllRunningAction() {
  return run(["APPROVE_AD_SPEND"], async (v) => {
    const r = await meta(() => pauseAllRunning(v));
    return { paused: r.paused, failed: r.failed, results: r.results };
  });
}

/** Current launch of a campaign, for the status panel and its polling. Does not call Meta: it reads what the sync last stored. */
export async function launchStatusAction(campaignId: string) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const cid = id(campaignId, "campaign");
    const l = (await getActiveLaunchForCampaign(cid)) ?? (await listLaunches(cid))[0] ?? null;
    return { launch: l ? await launchView(l) : null };
  }, { revalidate: false });
}

export async function launchByIdAction(launchId: string) {
  return run(["VIEW_CAMPAIGNS"], async () => {
    const l = await getLaunch(id(launchId, "launch"));
    return { launch: l ? await launchView(l) : null };
  }, { revalidate: false });
}

// ── company spending limits ────────────────────────────────────────────────────────────────────────

export async function loadGuardAction() {
  return run(["VIEW_CAMPAIGNS"], async () => ({ guard: guardSummary(await getGuard()) }), { revalidate: false });
}

/** What changed between two sets of limits, in words, for the activity log. */
function describeGuardChange(before: Awaited<ReturnType<typeof getGuard>>, after: Awaited<ReturnType<typeof getGuard>>): string {
  const out: string[] = [];
  if (before.requireSecondApprover !== after.requireSecondApprover) out.push(`second approver ${after.requireSecondApprover ? "required" : "NOT required"}`);
  if (before.allowUncapped !== after.allowUncapped) out.push(`launches without limits ${after.allowUncapped ? "ALLOWED" : "not allowed"}`);
  const names: [keyof CurrencyCaps, string][] = [["maxDailyPerLaunchMinor", "daily per launch"], ["maxTotalPerLaunchMinor", "total per launch"], ["companyDailyCapMinor", "company daily"], ["companyMonthlyCapMinor", "company 30-day"], ["approvalThresholdMinor", "approval threshold"]];
  for (const cur of new Set([...Object.keys(before.perCurrency), ...Object.keys(after.perCurrency)])) {
    for (const [k, label] of names) {
      const b = before.perCurrency[cur]?.[k] ?? null;
      const a2 = after.perCurrency[cur]?.[k] ?? null;
      if (b !== a2) out.push(`${cur} ${label}: ${b === null ? "none" : formatMinorPlain(b, cur)} -> ${a2 === null ? "none" : formatMinorPlain(a2, cur)}`);
    }
  }
  return out.length ? out.join("; ").slice(0, 900) : "No limit changed";
}

export async function saveGuardAction(patch: { perCurrency?: Record<string, Partial<CurrencyCaps>>; requireSecondApprover?: boolean; allowUncapped?: boolean }) {
  // Lifting a cap, relaxing the approval rule or allowing uncapped launches is its own permission: not the one that approves spend.
  return run(["MANAGE_AD_LIMITS"], async (v) => {
    const before = await getGuard();
    const g = await saveGuard(
      {
        requireSecondApprover: typeof patch?.requireSecondApprover === "boolean" ? patch.requireSecondApprover : undefined,
        allowUncapped: typeof patch?.allowUncapped === "boolean" ? patch.allowUncapped : undefined,
        perCurrency: patch?.perCurrency && typeof patch.perCurrency === "object" ? patch.perCurrency : undefined,
      },
      v.userId,
    );
    await recordAudit({ ...who(v), action: "update", entity: "campaign", entityId: "ads-guard", entityLabel: "Ad spending limits", recordId: "ads-guard", summary: `Ad spending limits changed: ${describeGuardChange(before, g)}` });
    return { guard: guardSummary(g) };
  });
}

export async function setKillSwitchAction(on: boolean) {
  // Turning it ON is a safety action anyone who approves spend may take (and it pauses what is running); turning it OFF lets spending resume.
  return run([on === true ? "APPROVE_AD_SPEND" : "MANAGE_AD_LIMITS"], async (v) => {
    if (on === true) {
      const r = await engageKillSwitch(v);
      return { guard: guardSummary(r.guard), paused: r.paused, failed: r.failed };
    }
    const g = await setKillSwitch(false, v.userId);
    await recordAudit({ ...who(v), action: "status", entity: "campaign", entityId: "ads-guard", entityLabel: "Ad spending limits", recordId: "ads-guard", summary: "Ads kill switch turned off" });
    return { guard: guardSummary(g), paused: 0, failed: 0 };
  });
}

export async function loadAccountsAction() {
  return run(["VIEW_CAMPAIGNS"], async () => ({ accounts: await loadAccountOptions() }), { revalidate: false });
}
