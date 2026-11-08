/**
 * Revenue & subscription analytics checks (MRR normalisation, owner
 * exclusion, net new MRR components, churn, trial conversion, date ranges,
 * billed vs collected, plan/cycle mix, dashboard snapshot, backfill
 * idempotency) against a throwaway database that is dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/p2f_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-revenue-metrics.ts
 */
import assert from "node:assert/strict";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getRevenueDashboard, getRevenueSnapshot, lastMonths, resolveRevenueRange, classifyMovement, listCompanyRevenue } from "@/lib/platform/billing/metrics";
import { recordSubscriptionEvent, SUBSCRIPTION_EVENTS_COLLECTION } from "@/lib/platform/billing/events";
import { backfillSubscriptionEvents } from "@/lib/platform/billing/backfill";
import { getSubscriptionSnapshot } from "@/lib/platform/console/overview";
import { listPlans } from "@/lib/platform/billing/plans";

const DAY = 86_400_000;
// Noon IST, 15 Sep 2026.
const NOW = new Date("2026-09-15T06:30:00Z");
const at = (iso: string) => new Date(iso);
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

function sub(planId: string, status: string, interval: "monthly" | "yearly", extra: Record<string, unknown> = {}) {
  return { planId, status, interval, trialEndsAt: null, currentPeriodStart: status === "trialing" ? null : at("2026-09-01T00:00:00Z"), currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, updatedAt: NOW, ...extra };
}

let checks = 0;
function eq<T>(actual: T, expected: T, msg: string) {
  assert.deepEqual(actual, expected, msg);
  checks++;
}
const close = (a: number | null, b: number, msg: string) => {
  assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
  checks++;
};

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  const companies = db.collection("companies");
  const events = db.collection<{ _id: string } & Record<string, unknown>>(SUBSCRIPTION_EVENTS_COLLECTION);
  const invoices = db.collection("saas_invoices");
  const created = at("2025-01-01T00:00:00Z");

  // These checks cover implicit trials, which the real catalogue does not have (Free is the start, no trial): the default plan gets 30 days here.
  await listPlans();
  await db.collection("billing_plans").updateMany({}, { $set: { trialDays: 30 } });
  const plans = await listPlans();
  const price = (id: string) => plans.find((p) => p._id === id)!;
  const STARTER_M = price("starter").priceMonthly;
  const GROWTH_M = price("growth").priceMonthly;
  const BUSINESS_Y = Math.round(price("business").priceYearly / 12);
  const GROWTH_Y = Math.round(price("growth").priceYearly / 12);

  // ── Pure helpers ──
  eq([classifyMovement(0, 5), classifyMovement(5, 9), classifyMovement(9, 5), classifyMovement(5, 0), classifyMovement(5, 5)], ["new", "expansion", "contraction", "churn", null], "movement classes");
  const months = lastMonths(NOW, 12);
  eq([months.length, months[0].key, months[11].key, months[11].label], [12, "2025-10", "2026-09", "Sep 2026"], "window Oct 2025 → Sep 2026");
  eq(months[11].start.toISOString(), "2026-08-31T18:30:00.000Z", "months start at IST midnight");
  const r12 = resolveRevenueRange({}, NOW);
  eq([r12.preset, r12.from, r12.to, r12.months.length, r12.includesCurrent, r12.end.getTime()], ["12m", "2025-10", "2026-09", 12, true, NOW.getTime() + 1], "default range: last 12 months up to now");
  eq([resolveRevenueRange({ range: "3m" }, NOW).from, resolveRevenueRange({ range: "fy" }, NOW).from, resolveRevenueRange({ range: "fy" }, at("2026-02-10T00:00:00Z")).from], ["2026-07", "2026-04", "2025-04"], "presets (Indian FY from April)");
  eq(resolveRevenueRange({ range: "bogus" }, NOW).preset, "12m", "unknown preset → default");
  const rev = resolveRevenueRange({ from: "2026-08", to: "2026-03" }, NOW);
  eq([rev.preset, rev.from, rev.to, rev.includesCurrent, rev.end.toISOString()], ["custom", "2026-03", "2026-08", false, "2026-08-31T18:30:00.000Z"], "custom: reversed order fixed, past range ends at month end");
  eq([resolveRevenueRange({ range: "custom", from: "2026-06", to: "2027-05" }, NOW).to, resolveRevenueRange({ range: "custom", from: "2020-01", to: "2026-09" }, NOW).months.length], ["2026-09", 36], "custom: clamped to now, capped at 36 months");
  eq(resolveRevenueRange({ range: "custom", from: "2026-13", to: "x" }, NOW).preset, "12m", "malformed months → default");

  // ── Empty platform: only the owner exists ──
  await companies.insertOne({ _id: "owner" as never, slug: "owner", name: "Owner", status: "active", isPlatformOwner: true, createdAt: created, updatedAt: created, subscription: sub("internal", "internal", "monthly") });
  const empty = await getRevenueDashboard({ now: NOW });
  eq([empty.mrr, empty.arr, empty.arpa, empty.paying, empty.totalCompanies], [0, 0, null, 0, 0], "empty: zeros");
  eq(empty.months.length, 12, "empty: 12-month series");
  eq(empty.months.every((m) => m.mrr === 0 && m.net === 0 && m.collected === 0 && m.billed === 0 && m.logoChurnRate === null && m.revenueChurnRate === null), true, "empty: all-zero months");
  eq([empty.trialConversion.rate, empty.trialConversion.source, empty.atRisk.length, empty.planMix.length, empty.cycleMix.length], [null, "current_state", 0, 0, 0], "empty: no conversion, risk, mix");
  eq([empty.summary.logoChurnRate, empty.summary.collectionRate, empty.summary.net], [null, null, 0], "empty: summary");
  eq(empty.history, { hasEvents: false, untrackedPaying: 0 }, "empty: no history");

  // ── Seed ──
  await companies.insertMany(
    [
      ["A", sub("growth", "active", "monthly")],
      ["B", sub("business", "active", "yearly")],
      ["C", sub("starter", "canceled", "monthly")],
      ["D", sub("starter", "past_due", "monthly", { currentPeriodEnd: later(3) })],
      ["E", sub("starter", "grace", "monthly", { graceEndsAt: later(2) })],
      ["F", sub("growth", "trialing", "monthly", { trialEndsAt: later(5) })],
      ["G", sub("growth", "trialing", "monthly", { trialEndsAt: later(-1) })],
      ["H", undefined],
      ["I", sub("growth", "grace", "monthly", { graceEndsAt: later(-1) })],
      ["J", sub("starter", "active", "monthly")],
    ].map(([id, s]) => ({
      _id: id as never,
      slug: String(id).toLowerCase(),
      name: `Company ${id}`,
      status: "active",
      isPlatformOwner: false,
      createdAt: id === "D" ? at("2026-07-01T00:00:00Z") : id === "H" ? later(-2) : created,
      updatedAt: NOW,
      ...(s ? { subscription: s } : {}),
    })),
  );
  let n = 0;
  const ev = (companyId: string, type: string, iso: string, mrr: number, planId = "x") => ({ _id: `e${++n}`, companyId, type, planId, interval: "monthly", mrr, at: at(iso) });
  await events.insertMany([
    ev("owner", "activated", "2026-05-01T00:00:00Z", 9_999_900), // must be ignored
    ev("A", "trial_started", "2026-05-01T00:00:00Z", 0),
    ev("A", "activated", "2026-05-15T00:00:00Z", GROWTH_M),
    ev("B", "activated", "2026-06-10T00:00:00Z", GROWTH_M),
    ev("B", "plan_changed", "2026-08-05T00:00:00Z", BUSINESS_Y),
    ev("C", "activated", "2026-04-03T00:00:00Z", STARTER_M),
    ev("C", "canceled", "2026-08-20T00:00:00Z", 0),
    ev("E", "activated", "2026-03-01T00:00:00Z", GROWTH_M),
    ev("E", "plan_changed", "2026-07-10T00:00:00Z", STARTER_M),
    ev("E", "past_due", "2026-09-01T00:00:00Z", STARTER_M),
    ev("E", "grace", "2026-09-05T00:00:00Z", STARTER_M),
    ev("F", "trial_started", "2026-09-10T00:00:00Z", 0),
    ev("G", "trial_started", "2026-08-01T00:00:00Z", 0),
    ev("J", "trial_started", "2026-07-01T00:00:00Z", 0),
    ev("J", "activated", "2026-07-15T00:00:00Z", STARTER_M),
    ev("A", "activated", "2026-10-01T00:00:00Z", 1), // future: ignored
  ]);
  await invoices.insertMany([
    { _id: "i1" as never, companyId: "A", number: "YO-1", amount: 353_882, taxable: 299_900, tax: 53_982, currency: "INR", status: "paid", issuedAt: at("2026-08-14T00:00:00Z"), paidAt: at("2026-08-15T00:00:00Z") },
    { _id: "i2" as never, companyId: "B", number: "YO-2", amount: 9_438_820, taxable: 7_999_000, tax: 1_439_820, currency: "INR", status: "paid", issuedAt: at("2026-08-05T00:00:00Z"), paidAt: at("2026-08-05T00:00:00Z") },
    { _id: "i3" as never, companyId: "owner", number: "YO-3", amount: 5_000_000, tax: 0, currency: "INR", status: "paid", issuedAt: at("2026-08-05T00:00:00Z"), paidAt: at("2026-08-05T00:00:00Z") },
    { _id: "i4" as never, companyId: "A", number: "YO-4", amount: 1_180, tax: 180, currency: "INR", status: "issued", issuedAt: at("2026-08-20T00:00:00Z"), paidAt: null },
    { _id: "i5" as never, companyId: "A", number: "YO-5", amount: 888, tax: 0, currency: "USD", status: "paid", issuedAt: at("2026-08-05T00:00:00Z"), paidAt: at("2026-08-05T00:00:00Z") },
    { _id: "i6" as never, companyId: "J", number: "YO-6", amount: 100_000, tax: 15_254, currency: "INR", status: "paid", createdAt: at("2026-08-31T20:00:00Z"), paidAt: at("2026-08-31T20:00:00Z") }, // Sep 1 IST, no issuedAt
    { _id: "i7" as never, companyId: "A", number: "YO-7", amount: 50_000, tax: 0, currency: "INR", status: "void", issuedAt: at("2026-08-10T00:00:00Z"), paidAt: null },
  ]);

  const d = await getRevenueDashboard({ now: NOW });
  const LIVE = GROWTH_M + BUSINESS_Y + STARTER_M /* D */ + STARTER_M /* E */ + STARTER_M; /* J */
  eq(d.mrr, LIVE, "MRR: monthly + yearly/12, active + past_due + grace, owner excluded");
  eq(d.arr, LIVE * 12, "ARR = 12 × MRR");
  eq(d.paying, 5, "paying companies");
  eq(d.arpa, Math.round(LIVE / 5), "ARPA");
  eq(d.totalCompanies, 10, "owner not counted");
  eq(d.counts, { trialing: 2, active: 3, past_due: 1, grace: 1, suspended: 2, canceled: 1 }, "effective status counts (expired trial/grace → suspended, implicit trial)");
  eq(d.trialsEndingSoon, 1, "one trial ends within 7 days (F; H has ~28 days)");
  eq(
    d.planMix.map((p) => [p.id, p.companies, p.mrr]),
    [
      ["starter", 3, STARTER_M * 3],
      ["growth", 1, GROWTH_M],
      ["business", 1, BUSINESS_Y],
    ],
    "plan mix in catalogue order",
  );
  close(d.planMix.reduce((a, p) => a + p.share, 0), 1, "plan shares sum to 1");
  eq(
    d.cycleMix.map((c) => [c.id, c.companies, c.mrr]),
    [
      ["monthly", 4, GROWTH_M + STARTER_M * 3],
      ["yearly", 1, BUSINESS_Y],
    ],
    "cycle mix: yearly normalised monthly",
  );

  const m = Object.fromEntries(d.months.map((r) => [r.key, r]));
  eq(d.months.length, 12, "12-month series");
  eq([m["2026-03"].new, m["2026-04"].new, m["2026-05"].new, m["2026-06"].new], [GROWTH_M, STARTER_M, GROWTH_M, GROWTH_M], "new MRR by month");
  eq([m["2026-07"].new, m["2026-07"].contraction, m["2026-07"].net], [STARTER_M, GROWTH_M - STARTER_M, STARTER_M - (GROWTH_M - STARTER_M)], "July: new J, contraction E");
  eq([m["2026-08"].expansion, m["2026-08"].churn, m["2026-08"].net], [BUSINESS_Y - GROWTH_M, STARTER_M, BUSINESS_Y - GROWTH_M - STARTER_M], "August: expansion B, churn C");
  eq([m["2026-09"].new, m["2026-09"].expansion, m["2026-09"].contraction, m["2026-09"].churn], [0, 0, 0, 0], "September: past_due/grace are not movements");
  const augStart = GROWTH_M /* A */ + GROWTH_M /* B */ + STARTER_M /* C */ + STARTER_M /* E */ + STARTER_M /* D untracked */ + STARTER_M; /* J */
  eq([m["2026-08"].startMrr, m["2026-08"].payingAtStart, m["2026-08"].churnedLogos], [augStart, 6, 1], "August opening");
  eq(m["2026-08"].logoChurnRate, 1 / 6, "logo churn");
  eq(m["2026-08"].revenueChurnRate, STARTER_M / augStart, "revenue churn");
  eq(m["2026-08"].mrr, LIVE, "August closing MRR = today's (no September movements)");
  eq(m["2026-09"].mrr, LIVE, "current month = live MRR");
  eq([m["2025-10"].mrr, m["2025-10"].logoChurnRate], [0, null], "before any revenue");
  eq(m["2026-06"].mrr, GROWTH_M * 3 + STARTER_M, "June closing: A, B, C, E");
  eq([m["2026-05"].trialsStarted, m["2026-07"].trialsStarted, m["2026-08"].trialsStarted, m["2026-09"].trialsStarted], [1, 1, 1, 1], "trials started per month");
  eq([m["2026-08"].collected, m["2026-08"].invoicesPaid, m["2026-08"].collectedTax], [353_882 + 9_438_820, 2, 53_982 + 1_439_820], "collected: paid INR only, owner excluded");
  eq([m["2026-08"].billed, m["2026-08"].invoicesIssued, m["2026-08"].billedTax], [353_882 + 9_438_820 + 1_180, 3, 53_982 + 1_439_820 + 180], "billed: issued (incl. unpaid), void/owner/USD excluded");
  eq([m["2026-09"].collected, m["2026-09"].invoicesPaid, m["2026-09"].billed], [100_000, 1, 100_000], "IST month bucketing; createdAt when no issuedAt");
  eq(d.history, { hasEvents: true, untrackedPaying: 1 }, "D has no history");

  // Range summary (12 months).
  const s = d.summary;
  eq([s.new, s.expansion, s.contraction, s.churn], [GROWTH_M * 3 + STARTER_M * 2, BUSINESS_Y - GROWTH_M, GROWTH_M - STARTER_M, STARTER_M], "12m: net new MRR components");
  eq(s.net, s.new + s.expansion - s.contraction - s.churn, "12m: net = new + expansion − contraction − churn");
  eq([s.startMrr, s.endMrr, s.payingAtStart, s.logoChurnRate, s.revenueChurnRate], [0, LIVE, 0, null, null], "12m: nothing paying at the start → no churn rate");
  eq([s.billed, s.collected, s.collectedTax, s.invoicesIssued, s.invoicesPaid], [353_882 + 9_438_820 + 1_180 + 100_000, 353_882 + 9_438_820 + 100_000, 53_982 + 1_439_820 + 15_254, 4, 3], "12m: billed vs collected, GST");
  eq(s.billedTaxable, 299_900 + 7_999_000 + 1_000 + (100_000 - 15_254), "12m: taxable (amount − tax when not stored)");
  close(s.collectionRate, s.collected / s.billed, "collection rate");
  eq(
    [d.trialConversion.source, d.trialConversion.started, d.trialConversion.converted, d.trialConversion.open],
    ["events", 4, 2, 1],
    "12m trial conversion: A, J converted; F running; G lapsed",
  );
  close(d.trialConversion.rate, 2 / 3, "12m conversion rate");

  // Custom range: August only (a closed, past month).
  const aug = await getRevenueDashboard({ now: NOW, range: "custom", from: "2026-08", to: "2026-08" });
  eq([aug.range.preset, aug.range.label, aug.months.length, aug.range.includesCurrent], ["custom", "Aug 2026", 1, false], "custom single month");
  eq([aug.summary.startMrr, aug.summary.endMrr, aug.summary.payingAtStart, aug.summary.payingAtEnd, aug.summary.churnedLogos], [augStart, LIVE, 6, 5, 1], "Aug: opening/closing");
  eq(aug.summary.startMrr + aug.summary.net, aug.summary.endMrr, "Aug: start + net new = end");
  close(aug.summary.logoChurnRate, 1 / 6, "Aug: logo churn");
  close(aug.summary.revenueChurnRate, STARTER_M / augStart, "Aug: gross revenue churn");
  close(aug.summary.netRevenueChurnRate, (STARTER_M - (BUSINESS_Y - GROWTH_M)) / augStart, "Aug: net revenue churn (after expansion)");
  eq([aug.trialConversion.started, aug.trialConversion.converted, aug.trialConversion.open, aug.trialConversion.rate], [1, 0, 0, 0], "Aug: G's trial lapsed");
  const q3 = await getRevenueDashboard({ now: NOW, range: "custom", from: "2026-07", to: "2026-09" });
  eq([q3.trialConversion.started, q3.trialConversion.converted, q3.trialConversion.open, q3.trialConversion.rate], [3, 1, 1, 0.5], "Jul–Sep: J converted, F open, G lapsed");
  eq(q3.summary.startMrr + q3.summary.net + STARTER_M /* D untracked, joined in July */, q3.summary.endMrr, "Jul–Sep: bridge (untracked D counts from sign-up)");

  eq(
    d.atRisk.map((r) => [r.companyId, r.status, r.mrr]),
    [
      ["E", "grace", STARTER_M],
      ["D", "past_due", STARTER_M],
      ["F", "trialing", GROWTH_M],
    ],
    "at risk: grace, past due, trial ending in 7 days (not H)",
  );
  eq(d.atRisk[0].deadline, later(2).toISOString(), "grace deadline");

  // Dashboard snapshot agrees with the revenue page.
  const snap = await getRevenueSnapshot(NOW);
  eq([snap.mrr, snap.arr, snap.paying, snap.arpa], [d.mrr, d.arr, d.paying, d.arpa], "snapshot = dashboard headline");
  eq(snap.counts, d.counts, "snapshot counts");
  eq(snap.trialsEndingSoon.map((t) => [t.id, t.daysLeft]), [["F", 5]], "snapshot trials ending");
  const overview = await getSubscriptionSnapshot(NOW);
  eq([overview.mrr, overview.trialsEndingCount, overview.counts.past_due, overview.counts.grace], [LIVE, 1, 1, 1], "Platform dashboard snapshot");
  const perCompany = await listCompanyRevenue(NOW);
  eq([perCompany.length, perCompany[0].companyId, perCompany.reduce((a, r) => a + r.mrr, 0)], [10, "B", LIVE], "per-company export rows");

  // ── recordSubscriptionEvent ──
  eq(await recordSubscriptionEvent({ companyId: "owner", type: "activated", planId: "growth" }), null, "owner: no-op");
  eq(await recordSubscriptionEvent({ companyId: "nope", type: "activated", planId: "growth" }), null, "unknown company: no-op");
  eq((await recordSubscriptionEvent({ companyId: "B", type: "plan_changed", planId: "business", interval: "yearly", at: later(-1) }))?.mrr, BUSINESS_Y, "derived MRR: yearly / 12");
  eq((await recordSubscriptionEvent({ companyId: "F", type: "plan_changed", planId: "business", at: later(-1) }))?.mrr, 0, "plan change during a trial pays nothing");
  eq((await recordSubscriptionEvent({ companyId: "C", type: "canceled", planId: "starter", at: later(-1) }))?.mrr, 0, "canceled = 0");
  eq((await recordSubscriptionEvent({ companyId: "A", type: "past_due", planId: "growth", key: "evt_1", at: later(-1) }))?.mrr, GROWTH_M, "past_due keeps MRR");
  eq(await recordSubscriptionEvent({ companyId: "A", type: "past_due", planId: "growth", key: "evt_1" }), null, "duplicate key ignored");
  eq(await events.countDocuments({ companyId: "A", type: "past_due" }), 1, "one row for the keyed event");

  // ── Backfill ──
  await companies.insertMany([
    { _id: "K" as never, slug: "k", name: "Company K", status: "active", isPlatformOwner: false, createdAt: at("2026-02-01T00:00:00Z"), updatedAt: NOW, subscription: sub("growth", "active", "yearly", { currentPeriodStart: at("2026-03-03T00:00:00Z") }) },
    { _id: "L" as never, slug: "l", name: "Company L", status: "active", isPlatformOwner: false, createdAt: later(-3), updatedAt: NOW, subscription: sub("starter", "trialing", "monthly", { trialEndsAt: later(27) }) },
    { _id: "M" as never, slug: "m", name: "Company M", status: "active", isPlatformOwner: false, createdAt: at("2026-01-01T00:00:00Z"), updatedAt: NOW, subscription: sub("starter", "canceled", "monthly", { currentPeriodStart: at("2026-04-01T00:00:00Z"), updatedAt: at("2026-06-10T00:00:00Z") }) },
    { _id: "N" as never, slug: "n", name: "Company N", status: "active", isPlatformOwner: false, createdAt: at("2026-01-01T00:00:00Z"), updatedAt: NOW, subscription: sub("starter", "suspended", "monthly", { currentPeriodStart: null }) },
  ]);
  const before = await events.countDocuments();
  const dry = await backfillSubscriptionEvents({ now: NOW });
  const plannedBy = (id: string) => dry.planned.filter((e) => e.companyId === id).map((e) => [e.type, e.mrr]);
  // Without history: D (past_due), I (grace, expired), K, L, M, N. H has no stored subscription; the rest have events.
  eq([dry.apply, dry.companies, dry.skippedNoSubscription, dry.written], [false, 6, 1, 0], "dry run: 6 companies, H skipped, nothing written");
  eq(await events.countDocuments(), before, "dry run writes nothing");
  eq(plannedBy("K"), [["trial_started", 0], ["activated", GROWTH_Y]], "K: trial + yearly activation (yearly / 12)");
  eq(dry.planned.find((e) => e.companyId === "K" && e.type === "activated")?.at.toISOString(), "2026-03-03T00:00:00.000Z", "K: activated at period start");
  eq(plannedBy("L"), [["trial_started", 0]], "L: trial only");
  eq(plannedBy("M"), [["trial_started", 0], ["activated", STARTER_M], ["canceled", 0]], "M: paid then canceled");
  eq(plannedBy("N"), [["trial_started", 0]], "N: never paid → trial only");
  eq(plannedBy("I"), [["trial_started", 0], ["activated", GROWTH_M], ["suspended", 0]], "I: expired grace ends suspended");
  eq(plannedBy("D"), [["trial_started", 0], ["activated", STARTER_M]], "D: past due still pays");

  const applied = await backfillSubscriptionEvents({ now: NOW, apply: true });
  eq([applied.written, applied.planned.length], [dry.planned.length, dry.planned.length], "apply writes every planned event");
  eq(await events.countDocuments(), before + dry.planned.length, "rows added");
  const again = await backfillSubscriptionEvents({ now: NOW, apply: true });
  eq([again.companies, again.written, again.skippedWithHistory], [0, 0, 13], "re-run: idempotent (every company now has history)");
  eq(await events.countDocuments(), before + dry.planned.length, "re-run adds nothing");
  // Deterministic ids: a racing second writer can't duplicate.
  eq(await recordSubscriptionEvent({ companyId: "K", type: "activated", planId: "growth", key: "backfill:activated" }), null, "backfill ids are idempotency keys");

  const afterBackfill = await getRevenueDashboard({ now: NOW });
  const LIVE2 = LIVE + GROWTH_Y; /* K */
  eq([afterBackfill.mrr, afterBackfill.history.untrackedPaying], [LIVE2, 0], "after backfill: K counted, nothing untracked");
  eq(afterBackfill.months.find((r) => r.key === "2026-09")?.mrr, LIVE2, "after backfill: current month = live");
  const a2 = Object.fromEntries(afterBackfill.months.map((r) => [r.key, r]));
  eq(a2["2026-03"].new, GROWTH_M + GROWTH_Y, "after backfill: K is new MRR in March");
  eq(a2["2026-06"].churn, STARTER_M, "after backfill: M churned in June");

  console.log(`revenue metrics: all ${checks} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    if (/test/.test(c.db().databaseName)) await c.db().dropDatabase();
    await c.close();
  });
