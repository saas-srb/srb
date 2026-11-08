import "server-only";
import { getDb } from "@/lib/mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { SEAT_FILTER, countSeatsUsed, storageUsedBytes } from "@/lib/platform/billing/enforce";
import { getUsage, USAGE_EVENTS_COLLECTION, usagePeriod } from "@/lib/platform/billing/usage";
import { AI_USAGE_COLLECTION } from "@/lib/platform/billing/ai-usage-log";
import { meterLevel } from "@/lib/platform/billing/usage-report";
import { roleLabelsForRoles } from "@/lib/products/commandos/role-catalog";
import { METRICS, storageSourceLabel, UNATTRIBUTED_KEY, UNATTRIBUTED_LABEL, type ActorShareRow, type DomainRow, type PeopleUsage, type PeopleUsageRow, type PersonDetail, type MetricDetail, type MetricOverview, type ModelRow, type MonthRow, type PersonRow, type SeriesPoint, type SourceRow, type UsageEventRow, type UsageMetricKey, type UsageOverview } from "@/lib/platform/billing/usage-history-shared";

/**
 * What the Usage & limits page shows: every meter's position against the plan, and for each one a full history — by day, by source,
 * by model (AI), month by month, and the individual events. Runs inside the company's context. The monthly totals (`billing_usage`)
 * and the per-call AI log are the same numbers enforcement uses; `usage_events` is the itemised history of the other meters.
 */

const MB = 1024 * 1024;
const DAY = 86_400_000;
const MAX_EVENTS = 300;

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const periodStart = (p: string) => new Date(`${p}-01T00:00:00.000Z`);
const nextPeriodStart = (p: string) => { const d = periodStart(p); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); };
const monthLabel = (p: string) => periodStart(p).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = (p: string) => periodStart(p).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const dateLabel = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The last 12 periods, newest first. */
export function recentPeriods(now = new Date()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push({ key, label: monthLabel(key) });
  }
  return out;
}

/** The meter's value in the unit people read (voice seconds → minutes, storage bytes → MB). */
const display = (key: UsageMetricKey, raw: number) => (key === "voice" ? round(raw / 60, 2) : key === "storage" ? round(raw / MB, 2) : raw);

const MONTHLY_METRIC: Partial<Record<UsageMetricKey, "ai_tokens" | "emails" | "voice_seconds">> = { ai: "ai_tokens", emails: "emails", voice: "voice_seconds" };

async function firstUsageEvent(): Promise<Date | null> {
  const doc = await (await getDb()).collection(USAGE_EVENTS_COLLECTION).find({}, { projection: { at: 1 } }).sort({ at: 1 }).limit(1).next();
  return (doc?.at as Date | undefined) ?? null;
}

// ── overview ────────────────────────────────────────────────────────────────

export async function getUsageOverview(now = new Date()): Promise<UsageOverview> {
  const companyId = await currentCompanyId();
  const period = usagePeriod(now);
  const start = periodStart(period);
  const end = nextPeriodStart(period);
  const daysTotal = Math.round((end.getTime() - start.getTime()) / DAY);
  const elapsedDays = (now.getTime() - start.getTime()) / DAY; // fractional
  const [e, seats, storageBytes, ai, emails, voiceSec, domains, since] = await Promise.all([
    getEntitlements(),
    countSeatsUsed().catch(() => 0),
    storageUsedBytes().catch(() => 0),
    getUsage("ai_tokens").catch(() => 0),
    getUsage("emails").catch(() => 0),
    getUsage("voice_seconds").catch(() => 0),
    (await getPlatformDb()).collection("company_domains").countDocuments({ companyId, kind: "custom" }).catch(() => 0),
    firstUsageEvent().catch(() => null),
  ]);
  const used: Record<UsageMetricKey, number> = { ai, storage: round(storageBytes / MB, 2), emails, voice: round(voiceSec / 60, 2), seats, domains };
  const metrics: MetricOverview[] = (Object.keys(METRICS) as UsageMetricKey[]).map((key) => {
    const m = METRICS[key];
    const limit = e.limits[m.limitKey] ?? null;
    const u = used[key];
    const percent = limit === null ? 0 : limit === 0 ? (u > 0 ? 100 : 0) : Math.min(100, Math.round((u / limit) * 100));
    let projected: number | null = null;
    if (m.kind === "monthly" && u > 0 && elapsedDays >= 1.5) projected = round((u / elapsedDays) * daysTotal, key === "ai" || key === "emails" ? 0 : 1);
    const projectedPercent = projected !== null && limit ? Math.round((projected / limit) * 100) : null;
    return {
      key, label: m.label, unit: m.unit, used: u, limit, remaining: limit === null ? null : Math.max(0, round(limit - u, 2)), percent,
      // A one-person plan holding its one person is simply how the plan works, not a warning.
      level: key === "seats" && limit === 1 && u <= 1 ? "ok" : meterLevel(u, limit), comingSoon: false,
      projected, projectedPercent, willRunOut: projected !== null && limit !== null && limit > 0 && projected > limit && u < limit,
    };
  });
  return {
    plan: { name: e.planName, status: e.status, trialDaysLeft: e.trialDaysLeft, unlimited: e.status === "internal" },
    period: { key: period, label: monthLabel(period), startsOn: dateLabel(start), resetsOn: dateLabel(end), dayOfPeriod: Math.min(daysTotal, Math.floor(elapsedDays) + 1), daysTotal, daysLeft: Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY)) },
    metrics,
    historySince: since ? dateLabel(since) : null,
  };
}

// ── detail ──────────────────────────────────────────────────────────────────

function daysOf(period: string, now: Date): string[] {
  const start = periodStart(period);
  const end = nextPeriodStart(period);
  const last = new Date(Math.min(end.getTime() - DAY, now.getTime()));
  const out: string[] = [];
  for (let t = start.getTime(); t <= last.getTime(); t += DAY) out.push(dayKey(new Date(t)));
  return out;
}

const emptyDetail = (key: UsageMetricKey, period: string, now: Date, limit: number | null): MetricDetail => ({
  key, period, periodLabel: monthLabel(period), periods: recentPeriods(now), isCurrentPeriod: period === usagePeriod(now), unit: METRICS[key].unit, limit, total: 0, calls: 0, peak: null, averagePerDay: 0,
  daily: [], cumulative: [], bySource: [], byModel: [], byPerson: [], inputTokens: 0, outputTokens: 0, months: [], events: [], eventsTruncated: false, people: [], domains: [], historyNote: null,
});

function finishSeries(d: MetricDetail, byDay: Map<string, number>, now: Date, cumulativeFrom = 0) {
  const days = daysOf(d.period, now);
  let run = cumulativeFrom;
  for (const k of days) {
    const v = round(byDay.get(k) ?? 0, 2);
    run = round(run + v, 2);
    d.daily.push({ date: k, label: dayLabel(k), value: v });
    d.cumulative.push({ date: k, label: dayLabel(k), value: run });
  }
  const peak = d.daily.reduce<SeriesPoint | null>((b, p) => (p.value > (b?.value ?? 0) ? p : b), null);
  d.peak = peak && peak.value > 0 ? { date: peak.label, value: peak.value } : null;
  d.averagePerDay = days.length ? round(d.daily.reduce((s, p) => s + p.value, 0) / days.length, 2) : 0;
}

/**
 * Use that happened before itemised records began is inside the month's total but not in any list. The running-total line starts from it,
 * so the line always ends at the real total (the one enforcement uses) instead of at a smaller, itemised-only number.
 */
function applyBaseline(d: MetricDetail): void {
  const itemised = d.daily.reduce((s, p) => s + p.value, 0);
  const gap = round(d.total - itemised, 2);
  if (gap > 0.005) d.cumulative = d.cumulative.map((p) => ({ ...p, value: round(p.value + gap, 2) }));
}

/** Groups per-person rows (events without a recorded person fall into one "not recorded" row) and adds each one's share. */
function personShares(rows: { key: string | null; label: string | null; kind: string | null; value: number; count: number }[]): ActorShareRow[] {
  const merged = new Map<string, ActorShareRow>();
  for (const r of rows) {
    const key = r.key || UNATTRIBUTED_KEY;
    const cur = merged.get(key) ?? { key, label: r.key ? r.label || key : UNATTRIBUTED_LABEL, kind: r.kind || "unknown", value: 0, share: 0, count: 0 };
    cur.value += r.value;
    cur.count += r.count;
    merged.set(key, cur);
  }
  const total = [...merged.values()].reduce((s, r) => s + Math.max(0, r.value), 0);
  return [...merged.values()].filter((r) => r.value > 0).map((r) => ({ ...r, value: round(r.value, 2), share: total ? Math.round((r.value / total) * 1000) / 10 : 0 })).sort((a, b) => b.value - a.value);
}

function sharesOf(rows: { source: string; value: number; count: number }[]): SourceRow[] {
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  return rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value).map((r) => ({ ...r, value: round(r.value, 2), share: total ? Math.round((r.value / total) * 1000) / 10 : 0 }));
}

async function aiDetail(d: MetricDetail, start: Date, end: Date, now: Date, companyId: string, cap: number) {
  const col = (await getPlatformDb()).collection(AI_USAGE_COLLECTION);
  const match = { companyId, at: { $gte: start, $lt: end } };
  const [dailyRows, sourceRows, modelRows, totals, latest, personRows] = await Promise.all([
    col.aggregate<{ _id: string; t: number }>([{ $match: match }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, t: { $sum: "$totalTokens" } } }]).toArray(),
    col.aggregate<{ _id: string; t: number; n: number }>([{ $match: match }, { $group: { _id: "$feature", t: { $sum: "$totalTokens" }, n: { $sum: 1 } } }]).toArray(),
    col.aggregate<{ _id: string; t: number; n: number; i: number; o: number }>([{ $match: match }, { $group: { _id: "$model", t: { $sum: "$totalTokens" }, n: { $sum: 1 }, i: { $sum: "$inputTokens" }, o: { $sum: "$outputTokens" } } }]).toArray(),
    col.aggregate<{ _id: null; t: number; n: number; i: number; o: number }>([{ $match: match }, { $group: { _id: null, t: { $sum: "$totalTokens" }, n: { $sum: 1 }, i: { $sum: "$inputTokens" }, o: { $sum: "$outputTokens" } } }]).toArray(),
    col.find(match, { projection: { _id: 0 } }).sort({ at: -1 }).limit(cap + 1).toArray(),
    col.aggregate<{ _id: { k: string | null; l: string | null; kind: string | null }; t: number; n: number }>([{ $match: match }, { $group: { _id: { k: "$actorKey", l: "$actorLabel", kind: "$actorKind" }, t: { $sum: "$totalTokens" }, n: { $sum: 1 } } }]).toArray(),
  ]);
  d.byPerson = personShares(personRows.map((r) => ({ key: r._id.k, label: r._id.l, kind: r._id.kind, value: r.t, count: r.n })));
  d.calls = totals[0]?.n ?? 0;
  d.inputTokens = totals[0]?.i ?? 0;
  d.outputTokens = totals[0]?.o ?? 0;
  finishSeries(d, new Map(dailyRows.map((r) => [r._id, r.t])), now);
  applyBaseline(d);
  d.bySource = sharesOf(sourceRows.map((r) => ({ source: r._id || "AI", value: r.t, count: r.n })));
  d.byModel = modelRows.map<ModelRow>((r) => ({ model: r._id || "unknown", value: r.t, calls: r.n, inputTokens: r.i, outputTokens: r.o })).sort((a, b) => b.value - a.value);
  d.eventsTruncated = latest.length > cap;
  d.events = latest.slice(0, cap).map<UsageEventRow>((r) => ({
    at: new Date(r.at as Date).toISOString(), source: String(r.feature || "AI"), detail: [String(r.endpoint ?? "").replace(" (estimated)", ""), String(r.model ?? "")].filter(Boolean).join(" · "),
    value: Number(r.totalTokens) || 0, model: String(r.model ?? ""), inputTokens: Number(r.inputTokens) || 0, outputTokens: Number(r.outputTokens) || 0, estimated: String(r.endpoint ?? "").includes("(estimated)"), by: String(r.actorLabel ?? UNATTRIBUTED_LABEL), byKey: String(r.actorKey ?? UNATTRIBUTED_KEY),
  }));
  const itemised = totals[0]?.t ?? 0;
  if (d.total > itemised) d.historyNote = `${(d.total - itemised).toLocaleString("en-IN")} of this month's tokens were used before call-by-call records began, so they appear in the total but not in the lists below.`;
}

async function eventsDetail(d: MetricDetail, metric: "emails" | "voice_seconds" | "storage_bytes", start: Date, end: Date, now: Date, key: UsageMetricKey, cap: number) {
  const col = (await getDb()).collection(USAGE_EVENTS_COLLECTION);
  const match = { metric, at: { $gte: start, $lt: end } };
  const conv = (raw: number) => display(key, raw);
  const [dailyRows, sourceRows, latest, count, personRows] = await Promise.all([
    col.aggregate<{ _id: string; v: number }>([{ $match: match }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, v: { $sum: "$amount" } } }]).toArray(),
    col.aggregate<{ _id: string; v: number; n: number }>([{ $match: { ...match, amount: { $gt: 0 } } }, { $group: { _id: "$source", v: { $sum: "$amount" }, n: { $sum: 1 } } }]).toArray(),
    col.find(match, { projection: { _id: 0 } }).sort({ at: -1 }).limit(cap + 1).toArray(),
    col.countDocuments(match),
    col.aggregate<{ _id: { k: string | null; l: string | null; kind: string | null }; v: number; n: number }>([{ $match: { ...match, amount: { $gt: 0 } } }, { $group: { _id: { k: "$actorKey", l: "$actorLabel", kind: "$actorKind" }, v: { $sum: "$amount" }, n: { $sum: 1 } } }]).toArray(),
  ]);
  d.byPerson = personShares(personRows.map((r) => ({ key: r._id.k, label: r._id.l, kind: r._id.kind, value: conv(r.v), count: r.n })));
  d.calls = count;
  const byDay = new Map(dailyRows.map((r) => [r._id, conv(r.v)]));
  if (key === "storage") {
    // Stock meter: today's total, walked backwards through the recorded changes.
    const nowBytes = await storageUsedBytes();
    const after = await col.aggregate<{ _id: string; v: number }>([{ $match: { metric, at: { $gte: start } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, v: { $sum: "$amount" } } }]).toArray();
    const changeByDay = new Map(after.map((r) => [r._id, r.v]));
    const days = daysOf(d.period, now);
    const totalAfterEnd = after.filter((r) => r._id > (days[days.length - 1] ?? "")).reduce((s, r) => s + r.v, 0);
    let stock = nowBytes - totalAfterEnd; // bytes held at the end of the last day shown
    const stockByDay = new Map<string, number>();
    for (let i = days.length - 1; i >= 0; i--) {
      stockByDay.set(days[i], stock);
      stock -= changeByDay.get(days[i]) ?? 0;
    }
    d.daily = days.map((k) => ({ date: k, label: dayLabel(k), value: byDay.get(k) ?? 0 }));
    d.cumulative = days.map((k) => ({ date: k, label: dayLabel(k), value: round(Math.max(0, stockByDay.get(k) ?? 0) / MB, 2) }));
    d.total = round(Math.max(0, stockByDay.get(days[days.length - 1] ?? "") ?? nowBytes) / MB, 2);
    const up = d.daily.reduce((b, p) => (p.value > (b?.value ?? 0) ? p : b), null as SeriesPoint | null);
    d.peak = up && up.value > 0 ? { date: up.label, value: up.value } : null;
    d.averagePerDay = days.length ? round(d.daily.reduce((s, p) => s + p.value, 0) / days.length, 2) : 0;
    d.bySource = sharesOf(sourceRows.map((r) => ({ source: storageSourceLabel(r._id), value: conv(r.v), count: r.n })));
  } else {
    finishSeries(d, byDay, now);
    applyBaseline(d);
    d.bySource = sharesOf(sourceRows.map((r) => ({ source: r._id, value: conv(r.v), count: r.n })));
  }
  d.eventsTruncated = latest.length > cap;
  d.events = latest.slice(0, cap).map<UsageEventRow>((r) => ({ at: new Date(r.at as Date).toISOString(), source: key === "storage" ? storageSourceLabel(String(r.source)) : String(r.source), detail: String(r.detail ?? ""), value: conv(Number(r.amount) || 0), by: String(r.actorLabel ?? UNATTRIBUTED_LABEL), byKey: String(r.actorKey ?? UNATTRIBUTED_KEY) }));
}

async function monthlyMonths(key: UsageMetricKey, limit: number | null, now: Date): Promise<MonthRow[]> {
  const m = MONTHLY_METRIC[key]!;
  const periods = recentPeriods(now).reverse();
  const totals = await Promise.all(periods.map((p) => getUsage(m, p.key).catch(() => 0)));
  return periods.map((p, i) => ({ period: p.key, label: shortMonth(p.key), value: display(key, totals[i]), limit, current: p.key === usagePeriod(now) }));
}

async function storageMonths(limit: number | null, now: Date): Promise<MonthRow[]> {
  const col = (await getDb()).collection(USAGE_EVENTS_COLLECTION);
  const nowBytes = await storageUsedBytes();
  const periods = recentPeriods(now).reverse();
  const rows = await col.aggregate<{ _id: string; v: number }>([{ $match: { metric: "storage_bytes", at: { $gte: periodStart(periods[0].key) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$at" } }, v: { $sum: "$amount" } } }]).toArray();
  const byMonth = new Map(rows.map((r) => [r._id, r.v]));
  const out: MonthRow[] = [];
  let stock = nowBytes;
  for (let i = periods.length - 1; i >= 0; i--) {
    out.unshift({ period: periods[i].key, label: shortMonth(periods[i].key), value: round(Math.max(0, stock) / MB, 2), limit, current: periods[i].key === usagePeriod(now) });
    stock -= byMonth.get(periods[i].key) ?? 0;
  }
  return out;
}

async function seatsDetail(d: MetricDetail, start: Date, end: Date, now: Date, limit: number | null) {
  const db = await getDb();
  const holders = await db.collection<{ email: string; roles?: string[]; createdAt: Date; lastLoginAt?: Date | null }>("admin_users").find(SEAT_FILTER).sort({ createdAt: 1 }).toArray();
  const pending = await db.collection<{ email: string; roles: string[]; createdAt: Date }>("company_invitations").find({ status: "pending", expiresAt: { $gt: now } }).sort({ createdAt: -1 }).toArray();
  d.people = [
    ...holders.map<PersonRow>((u) => ({ email: u.email, roles: roleLabelsForRoles(u.roles ?? []).join(", "), joined: dateLabel(u.createdAt), lastLogin: u.lastLoginAt ? dateLabel(u.lastLoginAt) : null, status: "active" })),
    ...pending.map<PersonRow>((i) => ({ email: i.email, roles: roleLabelsForRoles(i.roles ?? []).join(", "), joined: dateLabel(i.createdAt), lastLogin: null, status: "pending" })),
  ];
  const periods = recentPeriods(now).reverse();
  d.months = periods.map((p) => ({ period: p.key, label: shortMonth(p.key), value: holders.filter((h) => h.createdAt < nextPeriodStart(p.key)).length, limit, current: p.key === usagePeriod(now) }));
  const joinedByDay = new Map<string, number>();
  for (const h of holders) if (h.createdAt >= start && h.createdAt < end) joinedByDay.set(dayKey(h.createdAt), (joinedByDay.get(dayKey(h.createdAt)) ?? 0) + 1);
  const before = holders.filter((h) => h.createdAt < start).length;
  finishSeries(d, joinedByDay, now, before);
  d.total = holders.filter((h) => h.createdAt < end).length;
  d.calls = d.people.length;
  d.events = holders.filter((h) => h.createdAt >= start && h.createdAt < end).sort((a, b) => +b.createdAt - +a.createdAt).map<UsageEventRow>((h) => ({ at: h.createdAt.toISOString(), source: "Person joined", detail: h.email, value: 1 }));
  d.historyNote = "Shows the people who hold a seat today, by the day they joined. People who left or were deactivated are no longer listed.";
}

async function domainsDetail(d: MetricDetail, start: Date, end: Date, now: Date, limit: number | null, companyId: string) {
  const docs = await (await getPlatformDb()).collection<{ _id: string; status: string; isPrimary: boolean; createdAt: Date; kind?: string }>("company_domains").find({ companyId, kind: "custom" }).sort({ createdAt: 1 }).toArray();
  d.domains = docs.map<DomainRow>((x) => ({ host: x._id, status: x.status === "verified" ? "Verified" : "Waiting for DNS", added: dateLabel(x.createdAt), primary: x.isPrimary }));
  const periods = recentPeriods(now).reverse();
  d.months = periods.map((p) => ({ period: p.key, label: shortMonth(p.key), value: docs.filter((x) => x.createdAt < nextPeriodStart(p.key)).length, limit, current: p.key === usagePeriod(now) }));
  d.total = docs.length;
  d.calls = docs.length;
  d.events = docs.filter((x) => x.createdAt >= start && x.createdAt < end).sort((a, b) => +b.createdAt - +a.createdAt).map<UsageEventRow>((x) => ({ at: x.createdAt.toISOString(), source: "Domain connected", detail: x._id, value: 1 }));
  d.historyNote = "Shows the custom domains connected today, by the day they were added.";
}

export async function getMetricDetail(key: UsageMetricKey, periodIn?: string, now = new Date(), cap = MAX_EVENTS): Promise<MetricDetail> {
  const valid = recentPeriods(now).some((p) => p.key === periodIn);
  const period = valid ? (periodIn as string) : usagePeriod(now);
  const start = periodStart(period);
  const end = nextPeriodStart(period);
  const companyId = await currentCompanyId();
  const e = await getEntitlements();
  const limit = e.limits[METRICS[key].limitKey] ?? null;
  const d = emptyDetail(key, period, now, limit);
  const since = await firstUsageEvent().catch(() => null);
  const monthly = MONTHLY_METRIC[key];

  if (monthly) {
    d.total = display(key, await getUsage(monthly, period));
    d.months = await monthlyMonths(key, limit, now);
    if (key === "ai") await aiDetail(d, start, end, now, companyId, cap);
    else {
      await eventsDetail(d, monthly as "emails" | "voice_seconds", start, end, now, key, cap);
      const itemised = d.events.length > 0 && !d.eventsTruncated ? d.events.reduce((s, r) => s + r.value, 0) : d.bySource.reduce((s, r) => s + r.value, 0);
      if (d.total > itemised + 0.01) d.historyNote = since ? `${round(d.total - itemised, 2).toLocaleString("en-IN")} ${METRICS[key].unit} of this month's use happened before ${dateLabel(since)}, when itemised records began; it counts in the total but isn't listed below.` : `Itemised records begin with the next use; earlier use counts in the total only.`;
    }
  } else if (key === "storage") {
    await eventsDetail(d, "storage_bytes", start, end, now, key, cap);
    d.months = await storageMonths(limit, now);
    d.historyNote = since ? `Itemised changes are recorded from ${dateLabel(since)}. Earlier uploads are inside today's total but aren't itemised.` : "Itemised records begin with the next upload; today's total is exact.";
  } else if (key === "seats") await seatsDetail(d, start, end, now, limit);
  else await domainsDetail(d, start, end, now, limit, companyId);
  return d;
}

/** One CSV row per recorded event of a meter in a period (for the "Download" button). */
export async function usageEventsCsv(key: UsageMetricKey, period?: string): Promise<{ filename: string; csv: string }> {
  const d = await getMetricDetail(key, period, new Date(), 20_000);
  // A cell that starts with = + - @ would run as a formula in a spreadsheet (email subjects are free text): quote it as text.
  const esc = (v: unknown) => { if (typeof v === "number") return String(v); const t = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`; };
  const head = key === "ai" ? ["Time (UTC)", "Person", "Feature", "Model", "Endpoint", "Input tokens", "Output tokens", "Total tokens", "Estimated"] : ["Time (UTC)", "Person", "Source", "Detail", `Amount (${d.unit})`];
  const rows = d.events.map((r) => (key === "ai" ? [r.at, r.by ?? "", r.source, r.model, r.detail, r.inputTokens, r.outputTokens, r.value, r.estimated ? "yes" : ""] : [r.at, r.by ?? "", r.source, r.detail, r.value]));
  return { filename: `usage-${key}-${d.period}.csv`, csv: [head, ...rows].map((r) => r.map(esc).join(",")).join("\n") };
}

// ── per person ──────────────────────────────────────────────────────────────

const actorGroup = { k: "$actorKey", l: "$actorLabel", kind: "$actorKind" } as const;
type ActorId = { k: string | null; l: string | null; kind: string | null };
const keyOf = (id: ActorId) => id.k || UNATTRIBUTED_KEY;

/** Every person's use of every monthly meter in a period, side by side — "who is using what". */
export async function getPeopleUsage(periodIn?: string, now = new Date()): Promise<PeopleUsage> {
  const period = recentPeriods(now).some((p) => p.key === periodIn) ? (periodIn as string) : usagePeriod(now);
  const start = periodStart(period);
  const end = nextPeriodStart(period);
  const companyId = await currentCompanyId();
  const ai = (await getPlatformDb()).collection(AI_USAGE_COLLECTION);
  const ev = (await getDb()).collection(USAGE_EVENTS_COLLECTION);
  const aiMatch = { companyId, at: { $gte: start, $lt: end } };
  const evMatch = { at: { $gte: start, $lt: end }, amount: { $gt: 0 } };
  const [aiRows, featureRows, evRows] = await Promise.all([
    ai.aggregate<{ _id: ActorId; t: number; n: number; last: Date }>([{ $match: aiMatch }, { $group: { _id: actorGroup, t: { $sum: "$totalTokens" }, n: { $sum: 1 }, last: { $max: "$at" } } }]).toArray(),
    ai.aggregate<{ _id: { k: string | null; f: string }; t: number }>([{ $match: aiMatch }, { $group: { _id: { k: "$actorKey", f: "$feature" }, t: { $sum: "$totalTokens" } } }]).toArray(),
    ev.aggregate<{ _id: ActorId & { m: string }; v: number; last: Date }>([{ $match: evMatch }, { $group: { _id: { ...actorGroup, m: "$metric" }, v: { $sum: "$amount" }, last: { $max: "$at" } } }]).toArray(),
  ]);
  const rows = new Map<string, PeopleUsageRow>();
  const row = (id: ActorId): PeopleUsageRow => {
    const key = keyOf(id);
    let r = rows.get(key);
    if (!r) {
      r = { key, label: id.k ? id.l || key : UNATTRIBUTED_LABEL, kind: id.kind || "unknown", ai: 0, aiCalls: 0, topFeature: null, emails: 0, voiceMinutes: 0, storageMb: 0, lastAt: null, aiShare: 0 };
      rows.set(key, r);
    }
    return r;
  };
  const later = (r: PeopleUsageRow, d: Date) => { if (!r.lastAt || d.toISOString() > r.lastAt) r.lastAt = d.toISOString(); };
  for (const a of aiRows) { const r = row(a._id); r.ai += a.t; r.aiCalls += a.n; later(r, a.last); }
  const best = new Map<string, number>();
  for (const f of featureRows) { const r = rows.get(f._id.k || UNATTRIBUTED_KEY); if (r && f.t > (best.get(r.key) ?? 0)) { best.set(r.key, f.t); r.topFeature = f._id.f; } }
  for (const e of evRows) {
    const r = row(e._id);
    if (e._id.m === "emails") r.emails += e.v;
    else if (e._id.m === "voice_seconds") r.voiceMinutes = round(r.voiceMinutes + e.v / 60, 2);
    else if (e._id.m === "storage_bytes") r.storageMb = round(r.storageMb + e.v / MB, 2);
    later(r, e.last);
  }
  const list = [...rows.values()];
  const totals = list.reduce((t, r) => ({ ai: t.ai + r.ai, emails: t.emails + r.emails, voiceMinutes: round(t.voiceMinutes + r.voiceMinutes, 2), storageMb: round(t.storageMb + r.storageMb, 2) }), { ai: 0, emails: 0, voiceMinutes: 0, storageMb: 0 });
  for (const r of list) r.aiShare = totals.ai ? Math.round((r.ai / totals.ai) * 1000) / 10 : 0;
  list.sort((a, b) => b.ai - a.ai || b.emails - a.emails || a.label.localeCompare(b.label));
  return { period, periodLabel: monthLabel(period), rows: list, totals };
}

/** One person's use across every meter: what they used, for what, and when — with their share of the company's total. */
export async function getPersonDetail(actorKey: string, periodIn?: string, now = new Date(), cap = MAX_EVENTS): Promise<PersonDetail | null> {
  const period = recentPeriods(now).some((p) => p.key === periodIn) ? (periodIn as string) : usagePeriod(now);
  const start = periodStart(period);
  const end = nextPeriodStart(period);
  const companyId = await currentCompanyId();
  const aiCol = (await getPlatformDb()).collection(AI_USAGE_COLLECTION);
  const evCol = (await getDb()).collection(USAGE_EVENTS_COLLECTION);
  const unknown = actorKey === UNATTRIBUTED_KEY;
  const who = unknown ? { $or: [{ actorKey: { $exists: false } }, { actorKey: null }] } : { actorKey };
  const aiMatch = { companyId, at: { $gte: start, $lt: end }, ...who };
  const evMatch = { at: { $gte: start, $lt: end }, ...who };
  const [aiTotal, dailyRows, sourceRows, modelRows, aiLatest, evSums, evLatest, monthRows, ident] = await Promise.all([
    aiCol.aggregate<{ _id: null; t: number; n: number }>([{ $match: aiMatch }, { $group: { _id: null, t: { $sum: "$totalTokens" }, n: { $sum: 1 } } }]).toArray(),
    aiCol.aggregate<{ _id: string; t: number }>([{ $match: aiMatch }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, t: { $sum: "$totalTokens" } } }]).toArray(),
    aiCol.aggregate<{ _id: string; t: number; n: number }>([{ $match: aiMatch }, { $group: { _id: "$feature", t: { $sum: "$totalTokens" }, n: { $sum: 1 } } }]).toArray(),
    aiCol.aggregate<{ _id: string; t: number; n: number; i: number; o: number }>([{ $match: aiMatch }, { $group: { _id: "$model", t: { $sum: "$totalTokens" }, n: { $sum: 1 }, i: { $sum: "$inputTokens" }, o: { $sum: "$outputTokens" } } }]).toArray(),
    aiCol.find(aiMatch, { projection: { _id: 0 } }).sort({ at: -1 }).limit(cap).toArray(),
    evCol.aggregate<{ _id: string; v: number }>([{ $match: { ...evMatch, amount: { $gt: 0 } } }, { $group: { _id: "$metric", v: { $sum: "$amount" } } }]).toArray(),
    evCol.find(evMatch, { projection: { _id: 0 } }).sort({ at: -1 }).limit(cap).toArray(),
    aiCol.aggregate<{ _id: string; t: number }>([{ $match: { companyId, at: { $gte: periodStart(recentPeriods(now)[11].key) }, ...who } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$at" } }, t: { $sum: "$totalTokens" } } }]).toArray(),
    aiCol.find({ companyId, ...(unknown ? who : { actorKey }) }, { projection: { actorLabel: 1, actorKind: 1 } }).limit(1).toArray(),
  ]);
  let label = unknown ? UNATTRIBUTED_LABEL : String(ident[0]?.actorLabel ?? "");
  let kind = unknown ? "unknown" : String(ident[0]?.actorKind ?? "");
  if (!label && !unknown) {
    const e = await evCol.findOne({ actorKey }, { projection: { actorLabel: 1, actorKind: 1 } });
    label = String(e?.actorLabel ?? "");
    kind = String(e?.actorKind ?? "");
  }
  if (!label) return null;
  const evBy = new Map(evSums.map((r) => [r._id, r.v]));
  const company = { ai: await getUsage("ai_tokens", period), emails: await getUsage("emails", period), voice: await getUsage("voice_seconds", period) };
  const mk = (key: UsageMetricKey, value: number, total: number) => ({ key, label: METRICS[key].label, unit: METRICS[key].unit, value, companyTotal: total, share: total > 0 ? Math.round((value / total) * 1000) / 10 : 0 });
  const meters = [
    mk("ai", aiTotal[0]?.t ?? 0, company.ai),
    mk("emails", evBy.get("emails") ?? 0, company.emails),
    mk("voice", round((evBy.get("voice_seconds") ?? 0) / 60, 2), round(company.voice / 60, 2)),
    { key: "storage" as const, label: METRICS.storage.label, unit: "MB uploaded", value: round((evBy.get("storage_bytes") ?? 0) / MB, 2), companyTotal: 0, share: 0 },
  ];
  const d: MetricDetail = emptyDetail("ai", period, now, null);
  finishSeries(d, new Map(dailyRows.map((r) => [r._id, r.t])), now);
  const byMonth = new Map(monthRows.map((r) => [r._id, r.t]));
  const months: MonthRow[] = recentPeriods(now).reverse().map((p) => ({ period: p.key, label: shortMonth(p.key), value: byMonth.get(p.key) ?? 0, limit: null, current: p.key === usagePeriod(now) }));
  const events: UsageEventRow[] = [
    ...aiLatest.map<UsageEventRow>((r) => ({ at: new Date(r.at as Date).toISOString(), source: String(r.feature || "AI"), detail: [String(r.endpoint ?? "").replace(" (estimated)", ""), String(r.model ?? "")].filter(Boolean).join(" · "), value: Number(r.totalTokens) || 0, model: String(r.model ?? ""), inputTokens: Number(r.inputTokens) || 0, outputTokens: Number(r.outputTokens) || 0, estimated: String(r.endpoint ?? "").includes("(estimated)") })),
    ...evLatest.map<UsageEventRow>((r) => {
      const m = String(r.metric);
      const key: UsageMetricKey = m === "emails" ? "emails" : m === "voice_seconds" ? "voice" : "storage";
      return { at: new Date(r.at as Date).toISOString(), source: key === "storage" ? storageSourceLabel(String(r.source)) : String(r.source), detail: `${METRICS[key].short}${r.detail ? ` · ${String(r.detail)}` : ""}`, value: display(key, Number(r.amount) || 0) };
    }),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return {
    key: actorKey, label, kind: kind || "unknown", period, periodLabel: monthLabel(period), meters, daily: d.daily, months,
    bySource: sharesOf(sourceRows.map((r) => ({ source: r._id || "AI", value: r.t, count: r.n }))),
    byModel: modelRows.map<ModelRow>((r) => ({ model: r._id || "unknown", value: r.t, calls: r.n, inputTokens: r.i, outputTokens: r.o })).sort((a, b) => b.value - a.value),
    events: events.slice(0, cap), eventsTruncated: events.length > cap,
  };
}

/** The "who is using what" table as CSV. */
export async function peopleUsageCsv(period?: string): Promise<{ filename: string; csv: string }> {
  const u = await getPeopleUsage(period);
  const esc = (v: unknown) => { if (typeof v === "number") return String(v); const t = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`; };
  const head = ["Person", "Type", "AI tokens", "AI requests", "Share of AI tokens (%)", "Mostly used for", "Emails", "Voice minutes", "Uploaded (MB)", "Last activity (UTC)"];
  const rows = u.rows.map((r) => [r.label, r.kind, r.ai, r.aiCalls, r.aiShare, r.topFeature ?? "", r.emails, r.voiceMinutes, r.storageMb, r.lastAt ?? ""]);
  return { filename: `usage-people-${u.period}.csv`, csv: [head, ...rows].map((r) => r.map(esc).join(",")).join("\n") };
}
