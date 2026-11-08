/**
 * ViralPulse Campaigns & Ads wizard: pure helper tests (no database, no network, no provider). Covers money formatting per currency, the
 * objective -> destination -> goal filters, placement compatibility, field-path error mapping, the wizard reducer, commitment math, status
 * mapping, polling stop rules, hand-off parsing and the validate-only planners' helpers.
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_vpads npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-ads-ui.ts
 */
import assert from "node:assert/strict";

const uri = process.env.MONGODB_URI ?? "";
assert.ok(uri === "" || /zz_throwaway/.test(uri), "refusing to run against a non-throwaway database");

import {
  OBJECTIVE_OPTIONS, adIdOf, adSetIndexOf, adsManagerUrl, aspectFit, blankAd, canAutosave, CTA_BY_OBJECTIVE, dailyCommitmentMinor, describeError, destinationsFor, draftSnapshot, emptyWizard, explainIssue, fieldId, formatMinor, goalsFor,
  groupErrorsByStep, isStepKey, listStatus, majorToMicros, microsToMajor, minorToInput, parseHandoff, parseMajorToMinor, parseKeywords, placementBlockReason, placementRatioNotes, pollPlan, promotedNeeds, PLACEMENT_OPTIONS,
  reconcileAdSet, reviewLabel, reviewPending, reviewProblems, stepForPath, targetsEu, togglePlacement, wizardReducer, isPlacementOn, type WizardState, type LaunchLike,
} from "../src/lib/products/viralpulse-ai/ads-platforms/ui";
import { META_CTA_TYPES, META_OBJECTIVES, OBJECTIVE_RULES, META_DESTINATION_TYPES } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import { emptyAdSet, emptyMetaAd, emptyMetaCampaign, emptyTargeting } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/draft";
import { validateMetaLaunch } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/validate";
import { commitmentOf } from "../src/lib/products/viralpulse-ai/ads-platforms/guard";
import { validateGoogleSearch } from "../src/lib/products/viralpulse-ai/ads-platforms/google";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${name}\n       ${(e as Error).message}`);
  }
}
const nbsp = (s: string) => s.replace(/ /g, " ");

console.log("money");
t("formats minor units with the currency's own digits", () => {
  assert.equal(nbsp(formatMinor(150050, "INR")), "₹1,500.50");
  assert.equal(nbsp(formatMinor(1500, "JPY", "en-US")), "¥1,500");
  assert.equal(nbsp(formatMinor(1500, "KWD", "en-US")), "KWD 1.500");
  assert.equal(nbsp(formatMinor(1999, "USD", "en-US")), "$19.99");
  assert.equal(formatMinor(null, "INR"), "-");
});
t("parses typed amounts to integers and rejects what a currency cannot hold", () => {
  assert.equal(parseMajorToMinor("1500", "INR"), 150000);
  assert.equal(parseMajorToMinor("1,500.5", "INR"), 150050);
  assert.equal(parseMajorToMinor("1500", "JPY"), 1500);
  assert.equal(parseMajorToMinor("1500.5", "JPY"), null);
  assert.equal(parseMajorToMinor("10.001", "KWD"), 10001);
  assert.equal(parseMajorToMinor("10.001", "USD"), null);
  assert.equal(parseMajorToMinor("0", "INR"), null);
  assert.equal(parseMajorToMinor("-5", "INR"), null);
  assert.equal(parseMajorToMinor("abc", "INR"), null);
  assert.equal(parseMajorToMinor("", "INR"), null);
});
t("round trips minor <-> input text", () => {
  for (const [minor, cur] of [[150050, "INR"], [150000, "INR"], [1500, "JPY"], [10001, "KWD"]] as const) assert.equal(parseMajorToMinor(minorToInput(minor, cur), cur), minor);
  assert.equal(minorToInput(150000, "INR"), "1500");
  assert.equal(minorToInput(null, "INR"), "");
});
t("micros helpers", () => {
  assert.equal(majorToMicros("12.5"), 12_500_000);
  assert.equal(majorToMicros("x"), 0);
  assert.equal(microsToMajor(12_500_000), "12.5");
  assert.equal(microsToMajor(0), "");
});

console.log("objective, destination and goal filters");
t("six ODAX objectives with plain descriptions", () => {
  assert.equal(OBJECTIVE_OPTIONS.length, 6);
  assert.ok(OBJECTIVE_OPTIONS.every((o) => o.label && o.description.length > 20));
  assert.deepEqual(OBJECTIVE_OPTIONS.map((o) => o.value), [...META_OBJECTIVES]);
});
t("awareness and app promotion have no conversion location", () => {
  assert.equal(destinationsFor("OUTCOME_AWARENESS"), null);
  assert.equal(destinationsFor("OUTCOME_APP_PROMOTION"), null);
  assert.deepEqual([...destinationsFor("OUTCOME_LEADS")!], ["ON_AD", "WEBSITE", "MESSENGER", "INSTAGRAM_DIRECT"]);
});
t("goals narrow by destination per the documented table", () => {
  assert.deepEqual(goalsFor("OUTCOME_LEADS", "ON_AD"), ["LEAD_GENERATION", "QUALITY_LEAD"]);
  assert.deepEqual(goalsFor("OUTCOME_TRAFFIC", "MESSENGER"), ["LINK_CLICKS", "REACH", "IMPRESSIONS"]);
  assert.deepEqual(goalsFor("OUTCOME_ENGAGEMENT", "ON_PAGE"), ["PAGE_LIKES"]);
  assert.deepEqual(goalsFor("OUTCOME_SALES", "WEBSITE"), ["OFFSITE_CONVERSIONS"]);
  assert.deepEqual(goalsFor("OUTCOME_SALES", null), [...OBJECTIVE_RULES.OUTCOME_SALES.goals]);
  assert.deepEqual(goalsFor(null, null), []);
});
t("every goal offered is accepted by the validator for its objective", () => {
  for (const o of META_OBJECTIVES) {
    const dests = destinationsFor(o);
    for (const d of dests ?? [null]) for (const g of goalsFor(o, d)) assert.ok(OBJECTIVE_RULES[o].goals.includes(g), `${o}/${d}/${g}`);
  }
});
t("the reconciled ad set never trips the goal/destination validator rules", () => {
  for (const o of META_OBJECTIVES) {
    for (const d of destinationsFor(o) ?? [null]) {
      for (const g of goalsFor(o, d)) {
        const camp = { ...emptyMetaCampaign(), adAccountId: "a", pageAccountId: "p", objective: o };
        const set = reconcileAdSet({ ...emptyAdSet("set1", "S"), destinationType: d, optimizationGoal: g }, o);
        const r = validateMetaLaunch({ campaign: { ...camp, adSets: [set] }, ads: [], media: [], account: null });
        const codes = r.errors.map((e) => e.code);
        assert.ok(!codes.includes("goal_objective") && !codes.includes("destination_objective") && !codes.includes("destination_unused"), `${o}/${d}/${g}: ${codes.join(",")}`);
      }
    }
  }
});
t("reconcile drops a goal the new objective does not allow and picks a sole option", () => {
  const set = { ...emptyAdSet("set1", "S"), destinationType: "ON_AD" as const, optimizationGoal: "LEAD_GENERATION" as const };
  const toAwareness = reconcileAdSet(set, "OUTCOME_AWARENESS");
  assert.equal(toAwareness.destinationType, null);
  assert.equal(toAwareness.optimizationGoal, null);
  const page = reconcileAdSet({ ...emptyAdSet("set1", "S"), destinationType: "ON_PAGE" }, "OUTCOME_ENGAGEMENT");
  assert.equal(page.optimizationGoal, "PAGE_LIKES");
  assert.equal(page.billingEvent, "IMPRESSIONS");
});
t("promoted object needs come from the validator table", () => {
  assert.deepEqual(promotedNeeds("OUTCOME_SALES", "OFFSITE_CONVERSIONS").needs, ["pixel_id", "custom_event_type"]);
  assert.deepEqual(promotedNeeds("OUTCOME_SALES", "OFFSITE_CONVERSIONS").alt, ["application_id", "object_store_url"]);
  assert.deepEqual(promotedNeeds("OUTCOME_LEADS", "LEAD_GENERATION").needs, ["page_id"]);
  assert.deepEqual(promotedNeeds("OUTCOME_TRAFFIC", "LINK_CLICKS"), { needs: [], alt: null });
});
t("call-to-action lists only hold values Meta accepts", () => {
  for (const [o, list] of Object.entries(CTA_BY_OBJECTIVE)) for (const c of list) assert.ok((META_CTA_TYPES as readonly string[]).includes(c), `${o}: ${c}`);
  assert.equal(Object.keys(CTA_BY_OBJECTIVE).length, 6);
});
t("every destination in a rule has a label or a graceful fallback", () => {
  for (const d of META_DESTINATION_TYPES) assert.ok(typeof d === "string");
});

console.log("placements");
t("toggling keeps the publisher platforms in step", () => {
  const fbFeed = PLACEMENT_OPTIONS.find((o) => o.value === "feed" && o.publisher === "facebook")!;
  const igStory = PLACEMENT_OPTIONS.find((o) => o.value === "story" && o.publisher === "instagram")!;
  let p = togglePlacement(emptyTargeting().placements, fbFeed, true);
  assert.equal(p.automatic, false);
  assert.deepEqual(p.publisherPlatforms, ["facebook"]);
  p = togglePlacement(p, igStory, true);
  assert.deepEqual(p.publisherPlatforms.sort(), ["facebook", "instagram"]);
  p = togglePlacement(p, igStory, false);
  assert.deepEqual(p.publisherPlatforms, ["facebook"]);
  assert.ok(isPlacementOn(p, fbFeed));
});
t("an option that breaks a rule is blocked with the validator's reason", () => {
  const fbStory = PLACEMENT_OPTIONS.find((o) => o.value === "story" && o.publisher === "facebook")!;
  const fbFeed = PLACEMENT_OPTIONS.find((o) => o.value === "feed" && o.publisher === "facebook")!;
  const marketplace = PLACEMENT_OPTIONS.find((o) => o.value === "marketplace")!;
  const rhc = PLACEMENT_OPTIONS.find((o) => o.value === "right_hand_column")!;
  const manual = { ...emptyTargeting().placements, automatic: false };
  assert.match(placementBlockReason(manual, fbStory, "LINK_CLICKS") ?? "", /Facebook Feed or Instagram Stories/);
  assert.match(placementBlockReason(manual, marketplace, "LINK_CLICKS") ?? "", /needs Facebook Feed/);
  assert.equal(placementBlockReason(togglePlacement(manual, fbFeed, true), marketplace, "LINK_CLICKS"), null);
  assert.match(placementBlockReason(manual, rhc, "POST_ENGAGEMENT") ?? "", /right column/i);
  assert.equal(placementBlockReason(emptyTargeting().placements, fbStory, null), null, "automatic placements never block");
});
t("sponsored messages cannot be combined", () => {
  const sponsored = PLACEMENT_OPTIONS.find((o) => o.value === "sponsored_messages")!;
  const fbFeed = PLACEMENT_OPTIONS.find((o) => o.value === "feed" && o.publisher === "facebook")!;
  const p = togglePlacement({ ...emptyTargeting().placements, automatic: false }, sponsored, true);
  assert.match(placementBlockReason(p, fbFeed, null) ?? "", /Sponsored messages/);
});
t("ratio notes per placement", () => {
  assert.deepEqual(aspectFit(1080, 1920).vertical, true);
  assert.equal(aspectFit(1080, 1350).feed, true);
  assert.equal(aspectFit(null, 100).ratio, null);
  const manualFeed = { ...emptyTargeting().placements, automatic: false, publisherPlatforms: ["facebook"], facebookPositions: ["feed"] };
  assert.deepEqual(placementRatioNotes({ width: 1080, height: 1350 }, manualFeed), []);
  assert.equal(placementRatioNotes({ width: 1080, height: 1350 }, { ...manualFeed, instagramPositions: ["story"] }).length, 1);
  assert.equal(placementRatioNotes({ width: 1080, height: 1350 }, emptyTargeting().placements).length, 1, "Advantage+ may include Stories and Reels");
  assert.equal(placementRatioNotes({ width: 1080, height: 1920 }, emptyTargeting().placements).length, 0);
  assert.equal(placementRatioNotes(null, manualFeed).length, 0);
});

console.log("error paths");
t("paths map to steps", () => {
  assert.equal(stepForPath("meta.adAccountId"), "account");
  assert.equal(stepForPath("meta.pageAccountId"), "account");
  assert.equal(stepForPath("meta.objective"), "campaign");
  assert.equal(stepForPath("meta.campaignBudget"), "campaign");
  assert.equal(stepForPath("meta.spendCapMinor"), "campaign");
  assert.equal(stepForPath("meta.adSets[2].budget.amountMinor"), "adsets");
  assert.equal(stepForPath("meta.adSets"), "adsets");
  assert.equal(stepForPath("ads[abc].meta.link"), "ads");
  assert.equal(stepForPath("ads"), "ads");
  assert.equal(stepForPath("something.else"), "review");
});
t("indices and ids are parsed from paths", () => {
  assert.equal(adSetIndexOf("meta.adSets[3].targeting.geo"), 3);
  assert.equal(adSetIndexOf("meta.objective"), null);
  assert.equal(adIdOf("ads[xyz-1].meta.cards[0].mediaId"), "xyz-1");
  assert.equal(adIdOf("meta.adSets[0]"), null);
});
t("field ids are stable DOM ids", () => {
  assert.equal(fieldId("meta.adSets[0].budget.amountMinor"), "f-meta-adSets-0-budget-amountMinor");
  assert.equal(fieldId("ads[abc].meta.link"), "f-ads-abc-meta-link");
});
t("real validator output maps to steps and is described", () => {
  const camp = { ...emptyMetaCampaign(), objective: "OUTCOME_TRAFFIC" as const, adSets: [emptyAdSet("set1", "Set A")] };
  const ad = { id: "ad1", name: "Ad A", format: "image" as const, headline: "", primaryText: "", description: "", mediaIds: [], meta: { ...emptyMetaAd(), adSetKey: "set1" } };
  const r = validateMetaLaunch({ campaign: camp, ads: [ad], media: [], account: null });
  const g = groupErrorsByStep([...r.errors, ...r.warnings]);
  assert.ok(g.account.length >= 2, "account + page required");
  assert.ok(g.adsets.some((e) => e.code === "goal_required"));
  assert.ok(g.ads.some((e) => e.code === "primary_required"));
  const e = r.errors.find((x) => x.code === "goal_required")!;
  assert.equal(describeError(e, { adSets: camp.adSets, ads: [{ id: "ad1", name: "Ad A" }] }), "Ad set 1 (Set A): Choose what the ad set optimises for.");
  const a = r.errors.find((x) => x.code === "primary_required")!;
  assert.equal(describeError(a, { adSets: camp.adSets, ads: [{ id: "ad1", name: "Ad A" }] }), "Ad 1 (Ad A): Write the primary text.");
  for (const x of r.errors) assert.ok(document_free(fieldId(x.path)), x.path);
});
function document_free(id: string) {
  return /^f-[A-Za-z0-9_-]+$/.test(id);
}

console.log("wizard reducer");
const base = (): WizardState => ({ ...emptyWizard(), name: "Diwali", meta: { ...emptyMetaCampaign(), objective: "OUTCOME_LEADS" } });
t("changing the objective reconciles every ad set", () => {
  let s = wizardReducer(base(), { type: "addAdSet" });
  s = wizardReducer(s, { type: "adset", index: 0, patch: { destinationType: "ON_AD" } });
  s = wizardReducer(s, { type: "adset", index: 0, patch: { optimizationGoal: "LEAD_GENERATION" } });
  assert.equal(s.meta.adSets[0].billingEvent, "IMPRESSIONS");
  s = wizardReducer(s, { type: "campaign", patch: { objective: "OUTCOME_AWARENESS" } });
  assert.equal(s.meta.adSets[0].destinationType, null);
  assert.equal(s.meta.adSets[0].optimizationGoal, null);
});
t("a campaign budget clears ad set budgets (one place for the money)", () => {
  let s = wizardReducer(base(), { type: "addAdSet" });
  s = wizardReducer(s, { type: "adset", index: 0, patch: { budget: { type: "daily", amountMinor: 50000 } } });
  s = wizardReducer(s, { type: "campaign", patch: { campaignBudget: { type: "daily", amountMinor: 100000 } } });
  assert.equal(s.meta.adSets[0].budget, null);
  assert.equal(dailyCommitmentMinor(s.meta), 100000);
});
t("add, duplicate and remove ad sets keep keys unique and unlink ads", () => {
  let s = wizardReducer(base(), { type: "addAdSet" });
  s = wizardReducer(s, { type: "addAdSet" });
  s = wizardReducer(s, { type: "duplicateAdSet", index: 0 });
  assert.equal(new Set(s.meta.adSets.map((x) => x.key)).size, 3);
  assert.equal(s.meta.adSets[2].name, "Ad set 1 (copy)");
  s = wizardReducer(s, { type: "addAd", adSetKey: s.meta.adSets[1].key });
  assert.equal(s.ads[0].meta.adSetKey, "set2");
  s = wizardReducer(s, { type: "removeAdSet", index: 1 });
  assert.equal(s.ads[0].meta.adSetKey, null, "the ad keeps its copy but must be placed again");
  assert.equal(s.meta.adSets.length, 2);
});
t("a second ad set starts from the first one's audience", () => {
  let s = wizardReducer(base(), { type: "addAdSet" });
  s = wizardReducer(s, { type: "targeting", index: 0, patch: { ageMin: 25, geo: { ...emptyTargeting().geo, countries: ["IN"] } } });
  s = wizardReducer(s, { type: "addAdSet" });
  assert.deepEqual(s.meta.adSets[1].targeting.geo.countries, ["IN"]);
  assert.equal(s.meta.adSets[1].targeting.ageMin, 25);
  s = wizardReducer(s, { type: "targeting", index: 1, patch: { ageMin: 30 } });
  assert.equal(s.meta.adSets[0].targeting.ageMin, 25, "no shared references");
});
t("saving swaps local ad keys for server ids", () => {
  let s = wizardReducer(base(), { type: "addAd", adSetKey: null });
  const key = s.ads[0].key;
  s = wizardReducer(s, { type: "saved", campaignId: "c1", adIds: { [key]: "srv9" } });
  assert.equal(s.campaignId, "c1");
  assert.equal(s.ads[0].id, "srv9");
  assert.equal(s.ads[0].key, "srv9");
});
t("snapshot ignores step and confirmations, sees real edits", () => {
  const a = base();
  const b = wizardReducer(wizardReducer(a, { type: "step", step: "ads" }), { type: "confirm", patch: { rights: true } });
  assert.equal(draftSnapshot(a), draftSnapshot(b));
  assert.notEqual(draftSnapshot(a), draftSnapshot(wizardReducer(a, { type: "name", name: "Other" })));
  assert.equal(canAutosave(emptyWizard()), false);
  assert.equal(canAutosave(a), true);
});
t("step keys", () => {
  assert.ok(isStepKey("review") && !isStepKey("nope"));
  assert.equal(blankAd("ad1", "set1").meta.adSetKey, "set1");
});
t("EU targeting is detected for the payor and beneficiary fields", () => {
  const eu = { ...emptyTargeting(), geo: { ...emptyTargeting().geo, countries: ["DE"] } };
  assert.equal(targetsEu(eu), true);
  assert.equal(targetsEu({ ...emptyTargeting(), geo: { ...emptyTargeting().geo, countries: ["IN"] } }), false);
});

console.log("commitment math");
t("daily and lifetime commitments (the numbers the guard uses)", () => {
  const now = new Date("2026-11-02T00:00:00.000Z");
  const c = { ...emptyMetaCampaign(), adSets: [{ ...emptyAdSet("a", "A"), budget: { type: "daily" as const, amountMinor: 50000 } }, { ...emptyAdSet("b", "B"), budget: { type: "lifetime" as const, amountMinor: 700000 }, endTime: "2026-11-30T00:00:00.000Z" }] };
  const k = commitmentOf(c, now);
  assert.equal(k.dailyMinor, 50000);
  assert.equal(k.totalMinor, null, "the daily budget has no end date");
  assert.equal(dailyCommitmentMinor(c), k.dailyMinor);
  const bounded = commitmentOf({ ...c, stopTime: "2026-11-12T00:00:00.000Z" }, now);
  assert.equal(bounded.totalMinor, 50000 * 10 + 700000);
  const cbo = commitmentOf({ ...emptyMetaCampaign(), campaignBudget: { type: "daily", amountMinor: 20000 }, stopTime: "2026-11-05T00:00:00.000Z", adSets: [emptyAdSet("a", "A")] }, now);
  assert.equal(cbo.dailyMinor, 20000);
  assert.equal(cbo.totalMinor, 60000);
});

console.log("status mapping and polling");
const L = (o: Partial<LaunchLike>): LaunchLike => ({ state: "ready", delivery: "paused", active: true, review: {}, stopTime: null, ...o });
t("list status", () => {
  const now = new Date("2026-11-02T00:00:00.000Z");
  assert.equal(listStatus(null, now), "draft");
  assert.equal(listStatus(L({ state: "rolled_back", active: false }), now), "draft");
  assert.equal(listStatus(L({ state: "failed" }), now), "failed");
  assert.equal(listStatus(L({ state: "partial" }), now), "failed");
  assert.equal(listStatus(L({ state: "creating" }), now), "failed");
  assert.equal(listStatus(L({ delivery: "paused" }), now), "paused");
  assert.equal(listStatus(L({ delivery: "active" }), now), "running");
  assert.equal(listStatus(L({ delivery: "active", review: { a: { effectiveStatus: "PENDING_REVIEW" } } }), now), "in_review");
  assert.equal(listStatus(L({ delivery: "active", review: { a: { effectiveStatus: "DISAPPROVED" } } }), now), "failed");
  assert.equal(listStatus(L({ delivery: "archived", active: false }), now), "ended");
  assert.equal(listStatus(L({ delivery: "active", stopTime: "2026-11-01T00:00:00.000Z" }), now), "ended");
  assert.equal(reviewPending({ a: { effectiveStatus: "ACTIVE" } }), false);
  assert.equal(reviewProblems({ a: { effectiveStatus: "WITH_ISSUES" }, b: { effectiveStatus: "ACTIVE" } }), 1);
});
t("polling starts only when something is in flight and stops when settled", () => {
  const base = { hidden: false, errors: 0, sinceActionMs: 0, pendingReview: false };
  assert.equal(pollPlan({ ...base, state: null, delivery: null }).poll, false);
  assert.deepEqual(pollPlan({ ...base, state: "creating", delivery: "paused" }), { poll: true, everyMs: 4000 });
  assert.deepEqual(pollPlan({ ...base, state: "ready", delivery: "active", pendingReview: true }), { poll: true, everyMs: 30000 });
  assert.equal(pollPlan({ ...base, state: "ready", delivery: "active" }).poll, false, "running and reviewed: settled");
  assert.equal(pollPlan({ ...base, state: "ready", delivery: "paused" }).poll, false);
  assert.equal(pollPlan({ ...base, state: "rolled_back", delivery: "paused" }).poll, false);
  assert.equal(pollPlan({ ...base, state: "creating", delivery: "paused", hidden: true }).poll, false, "hidden tab");
  assert.equal(pollPlan({ ...base, state: "creating", delivery: "paused", errors: 5 }).poll, false, "too many errors");
  assert.equal(pollPlan({ ...base, state: "creating", delivery: "paused", errors: 2 }).everyMs, 16000, "backs off");
  assert.equal(pollPlan({ ...base, state: "ready", delivery: "active", pendingReview: true, sinceActionMs: 31 * 60_000 }).poll, false, "gives up after 30 minutes");
});
t("review text is plain", () => {
  assert.equal(reviewLabel("PENDING_REVIEW"), "In review by Meta");
  assert.equal(reviewLabel(null), "Not synced yet");
  assert.equal(reviewLabel("SOMETHING_NEW"), "Something new");
  assert.deepEqual(explainIssue("adult_content: Image shows too much skin"), { title: "Adult content", detail: "Image shows too much skin" });
  assert.deepEqual(explainIssue("policy_issue"), { title: "Policy issue", detail: null });
});
t("Ads Manager links", () => {
  assert.equal(adsManagerUrl("act_123", "campaign", "999"), "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123&selected_campaign_ids=999");
  assert.match(adsManagerUrl("123", "ad", "5"), /manage\/ads\?act=123&selected_ad_ids=5/);
});

console.log("hand-offs");
t("parses media and step, drops anything malformed", () => {
  assert.deepEqual(parseHandoff({ media: "abc12345", step: "ads", ugc: "proj_123456" }), { mediaIds: ["abc12345"], ugcProjectId: "proj_123456", step: "ads" });
  assert.deepEqual(parseHandoff({ media: ["abc12345", "abc12345", "x", "../etc/passwd", "def67890,ghi01234"] }).mediaIds, ["abc12345", "def67890", "ghi01234"]);
  assert.equal(parseHandoff({ step: "hack" }).step, null);
  assert.equal(parseHandoff({ ugc: "<script>" }).ugcProjectId, null);
  assert.deepEqual(parseHandoff({}), { mediaIds: [], ugcProjectId: null, step: null });
  assert.equal(parseHandoff({ media: Array.from({ length: 30 }, (_, i) => `media_${String(i).padStart(4, "0")}`) }).mediaIds.length, 10);
});

console.log("validate-only planners");
t("google keyword notation", () => {
  assert.deepEqual(parseKeywords('red shoes\n"red running shoes"\n[buy red shoes]\n\n'), [
    { text: "red shoes", matchType: "BROAD" }, { text: "red running shoes", matchType: "PHRASE" }, { text: "buy red shoes", matchType: "EXACT" },
  ]);
});
t("google plan shows the real limits and the access warning, never claims to launch", () => {
  const r = validateGoogleSearch({ customerId: "123", name: "", dailyBudgetMicros: 0, startDate: null, endDate: null, keywords: [], headlines: ["x".repeat(31)], descriptions: [], finalUrl: "http://x" });
  const codes = r.errors.map((e) => e.code);
  for (const c of ["customer_id", "name_required", "budget_required", "url_https", "keywords_required", "headlines_count", "descriptions_count", "headline_max"]) assert.ok(codes.includes(c), c);
  assert.ok(r.warnings.some((w) => w.code === "requires_access"));
});

console.log(`\nviralpulse ads ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
