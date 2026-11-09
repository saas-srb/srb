/**
 * The dashboard aggregation: pure functions over already-fetched rows, so every figure can be unit-tested. Nothing here reads a database or
 * the clock (`now` is passed in) and nothing is invented: an empty input gives zeros, empty lists and `empty: true`.
 */
import { DAY_MS, IST_OFFSET_MS, istDayStart, weekStart } from "@/lib/products/playbook-ai/dashboard/ranges";
import { applyPbFilters, countPbFilters, EMPTY_PB_FILTERS, pbFilterOptions, type PbFilterOptions, type PbFilters } from "@/lib/products/playbook-ai/dashboard/filters";
import type {
  ActivityRow, AiRunRow, AttentionItem, AttentionLists, CountItem, DashboardData, DashboardInput, DateRange, DocRow, ExportRow, FunnelStep, HistBucket, LeaderRow,
  Scope, SendRow, SeriesPoint, Tile, TrendPoint,
} from "@/lib/products/playbook-ai/dashboard/types";

export const STALE_DRAFT_DAYS = 14;
export const SIGNATURE_SLA_DAYS = 7;
export const SOP_REVIEW_DAYS = 365;
const OPEN_SEND = new Set(["sent", "viewed", "partially_signed"]);

const inRange = (t: number, a: number, b: number): boolean => t >= a && t < b;
const pctChange = (cur: number | null, prev: number | null): number | null => (cur === null || prev === null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10);
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const round1 = (x: number | null): number | null => (x === null ? null : Math.round(x * 10) / 10);
const median = (xs: number[]): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const days = (ms: number): number => ms / DAY_MS;

/** Only what the person may see: managers see everything, everyone else only what they created, sent or asked of the AI. Pure. */
export function scopeInput(input: DashboardInput, scope: Scope): DashboardInput {
  if (scope.all) return input;
  const me = scope.userId;
  return {
    docs: input.docs.filter((d) => d.createdBy === me),
    sends: input.sends.filter((s) => s.sentBy === me),
    ai: input.ai.filter((a) => a.userId === me),
    exports: input.exports.filter((e) => e.actorId === me),
    activity: input.activity.filter((a) => a.actorId === me),
    names: input.names,
  };
}

/** Buckets for a range: days up to 45 days, otherwise IST weeks (Monday). */
export function buckets(range: DateRange): { granularity: "day" | "week"; starts: number[]; of: (t: number) => number } {
  const granularity = range.days <= 45 ? "day" : "week";
  const of = granularity === "day" ? istDayStart : weekStart;
  const step = granularity === "day" ? DAY_MS : 7 * DAY_MS;
  const starts: number[] = [];
  for (let s = of(range.from); s < range.to; s += step) starts.push(s);
  return { granularity, starts, of };
}

const fmtDay = (ms: number): string => new Date(ms + IST_OFFSET_MS).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

const ago = (now: number, t: number): number => Math.max(Math.floor(days(now - t)), 0);

function topN(map: Map<string, number>, n: number, label: (k: string) => string = (k) => k): CountItem[] {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k, v]) => ({ key: k, label: label(k), value: v }));
}

const docHref = (d: { id: string }) => `/playbook-ai/documents/${encodeURIComponent(d.id)}`;

export function buildAttention(input: DashboardInput, now: number): AttentionLists {
  const cap = <T,>(xs: T[]): T[] => xs.slice(0, 8);
  const item = (id: string, title: string, detail: string, href: string): AttentionItem => ({ id, title, detail, href });
  const staleDrafts = cap(input.docs.filter((d) => d.status === "draft" && now - d.updatedAt >= STALE_DRAFT_DAYS * DAY_MS).sort((a, b) => a.updatedAt - b.updatedAt).map((d) => item(d.id, d.title, `Not touched for ${ago(now, d.updatedAt)} days`, docHref(d))));
  const open = input.sends.filter((s) => OPEN_SEND.has(s.status) || s.status === "expired");
  const awaitingSignature = cap(open.filter((s) => s.status === "expired" || now - s.sentAt >= SIGNATURE_SLA_DAYS * DAY_MS).sort((a, b) => a.sentAt - b.sentAt).map((s) => item(s.id, s.title, s.status === "expired" ? `Link expired; sent ${ago(now, s.sentAt)} days ago to ${s.partyName}` : `Sent ${ago(now, s.sentAt)} days ago to ${s.partyName}, not signed`, `/contractflow-ai/clones/${encodeURIComponent(s.cloneId)}`)));
  const legalPending = cap(input.docs.filter((d) => d.legalPending && d.status !== "archived").sort((a, b) => a.updatedAt - b.updatedAt).map((d) => item(d.id, d.title, "Lawyer-review confirmation not yet recorded", docHref(d))));
  const sopsDueReview = cap(input.docs.filter((d) => d.kind === "sop" && (d.status === "issued" || d.status === "approved") && now - (d.reviewedAt ?? d.createdAt) >= SOP_REVIEW_DAYS * DAY_MS).sort((a, b) => (a.reviewedAt ?? a.createdAt) - (b.reviewedAt ?? b.createdAt)).map((d) => item(d.id, d.title, `Last reviewed ${ago(now, d.reviewedAt ?? d.createdAt)} days ago`, docHref(d))));
  const employeesUnsigned = cap(open.filter((s) => s.partyType === "employee" && s.status !== "expired").sort((a, b) => a.sentAt - b.sentAt).map((s) => item(s.id, `${s.partyName}: ${s.title}`, `Sent ${ago(now, s.sentAt)} days ago, ${s.status === "partially_signed" ? "partly signed" : s.status === "viewed" ? "viewed, not signed" : "not opened yet"}`, `/contractflow-ai/clones/${encodeURIComponent(s.cloneId)}`)));
  return { staleDrafts, awaitingSignature, legalPending, sopsDueReview, employeesUnsigned };
}

export function buildDashboard(raw: DashboardInput, range: DateRange, scope: Scope, now: number, filters: PbFilters = EMPTY_PB_FILTERS): DashboardData {
  const scoped = scopeInput(raw, scope);
  const options = pbFilterOptions(scoped);
  const input = applyPbFilters(scoped, filters);
  const { docs, sends, ai, exports: exp } = input;
  const live = docs.filter((d) => d.status !== "archived");
  const createdIn = (a: number, b: number): DocRow[] => docs.filter((d) => inRange(d.createdAt, a, b));
  const cur = createdIn(range.from, range.to), prev = createdIn(range.prevFrom, range.prevTo);

  // ---- send and signing figures for a window ----
  const sentIn = (a: number, b: number): SendRow[] => sends.filter((s) => inRange(s.sentAt, a, b));
  const signedIn = (a: number, b: number): SendRow[] => sends.filter((s) => s.signedAt !== null && inRange(s.signedAt, a, b));
  const turnaround = (rows: SendRow[]): number[] => rows.flatMap((s) => (s.signedAt !== null && s.signedAt >= s.sentAt ? [days(s.signedAt - s.sentAt)] : []));
  const completion = (a: number, b: number): number | null => { const c = sentIn(a, b); return c.length ? Math.round((c.filter((s) => s.signedAt !== null).length / c.length) * 1000) / 10 : null; };
  const sCur = sentIn(range.from, range.to), sPrev = sentIn(range.prevFrom, range.prevTo);
  const gCur = signedIn(range.from, range.to), gPrev = signedIn(range.prevFrom, range.prevTo);
  const tCur = turnaround(gCur), tPrev = turnaround(gPrev);

  const count = (k: DocRow["kind"]) => live.filter((d) => d.kind === k);
  const total = (k: DocRow["kind"]) => count(k).length;
  const growth = (k: DocRow["kind"]) => { const t = total(k); const added = cur.filter((d) => d.kind === k && d.status !== "archived").length; return { value: t, prev: t - added }; };
  const active = (k: DocRow["kind"]) => count(k).filter((d) => d.status === "issued" || d.status === "approved").length;
  const sopG = growth("sop"), docG = growth("document"), kpiG = growth("kpi");
  const drafts = live.filter((d) => d.status === "draft").length;

  const tile = (t: Omit<Tile, "deltaPct">): Tile => ({ ...t, deltaPct: pctChange(t.value, t.prev) });
  const tiles: Tile[] = [
    tile({ key: "sops", label: "SOPs", value: sopG.value, format: "int", prev: sopG.prev, note: `${active("sop")} active`, good: "up", href: "/playbook-ai/sops" }),
    tile({ key: "documents", label: "Documents", value: docG.value, format: "int", prev: docG.prev, note: `${active("document")} issued or approved`, good: "up", href: "/playbook-ai/documents" }),
    tile({ key: "kpis", label: "KPI sheets", value: kpiG.value, format: "int", prev: kpiG.prev, note: `${active("kpi")} issued or approved`, good: "up", href: "/playbook-ai/kpis" }),
    tile({ key: "drafts", label: "Drafts", value: drafts, format: "int", prev: null, note: "Not yet issued", good: "neutral", href: "/playbook-ai/documents" }),
    tile({ key: "sent", label: "Sent for signature", value: sCur.length, format: "int", prev: sPrev.length, note: "In this period", good: "up", href: "/contractflow-ai/documents" }),
    tile({ key: "signed", label: "Signed", value: gCur.length, format: "int", prev: gPrev.length, note: "Completed in this period", good: "up", href: "/contractflow-ai/documents?tab=signed" }),
    tile({ key: "turnaround", label: "Average time to sign", value: round1(avg(tCur)), format: "days", prev: round1(avg(tPrev)), note: tCur.length ? `${tCur.length} signed` : "Nothing signed yet", good: "down", href: "/contractflow-ai/documents?tab=signed" }),
    tile({ key: "completion", label: "Completion rate", value: completion(range.from, range.to), format: "pct", prev: completion(range.prevFrom, range.prevTo), note: "Of those sent in this period", good: "up", href: "/contractflow-ai/documents" }),
  ];

  // ---- created over time ----
  const b = buckets(range);
  const points = new Map<number, SeriesPoint>(b.starts.map((s) => [s, { label: b.granularity === "day" ? fmtDay(s) : `Week of ${fmtDay(s)}`, start: s, sop: 0, document: 0, kpi: 0 }]));
  for (const d of cur) { const p = points.get(b.of(d.createdAt)); if (p) p[d.kind] += 1; }
  const series = [...points.values()];

  // ---- funnel: the documents created in the period, and how far each got (a cohort, so a step can never exceed the one before) ----
  const sendsByDoc = new Map<string, SendRow[]>();
  for (const x of sends) sendsByDoc.set(x.documentId, [...(sendsByDoc.get(x.documentId) ?? []), x]);
  const cohort = cur.filter((d) => d.status !== "archived");
  const sentDocs = cohort.filter((d) => (sendsByDoc.get(d.id) ?? []).length > 0);
  const viewedDocs = sentDocs.filter((d) => (sendsByDoc.get(d.id) ?? []).some((x) => x.viewedAt !== null || x.signedAt !== null));
  const signedDocs = sentDocs.filter((d) => (sendsByDoc.get(d.id) ?? []).some((x) => x.signedAt !== null));
  const raw4: [string, string, number][] = [["draft", "Created", cohort.length], ["sent", "Sent for signature", sentDocs.length], ["viewed", "Viewed by a signer", viewedDocs.length], ["signed", "Signed", signedDocs.length]];
  const funnel: FunnelStep[] = raw4.map(([key, label, value], i) => ({
    key, label, value,
    pctOfFirst: raw4[0][2] > 0 ? Math.round((value / raw4[0][2]) * 1000) / 10 : null,
    dropPct: i === 0 || raw4[i - 1][2] === 0 ? null : Math.round((1 - value / raw4[i - 1][2]) * 1000) / 10,
  }));

  // ---- categories, departments, templates ----
  const cat = new Map<string, number>(), dep = new Map<string, number>(), tpl = new Map<string, number>(), tplName = new Map<string, string>();
  for (const d of cur) {
    cat.set(d.category, (cat.get(d.category) ?? 0) + 1);
    dep.set(d.department || "No department", (dep.get(d.department || "No department") ?? 0) + 1);
    if (d.templateId) { tpl.set(d.templateId, (tpl.get(d.templateId) ?? 0) + 1); tplName.set(d.templateId, d.templateName ?? d.templateId); }
  }
  const fromLibrary = cur.filter((d) => d.templateId).length;

  // ---- turnaround histogram and weekly trend ----
  const edges: [string, number, number][] = [["< 1 d", 0, 1], ["1-2 d", 1, 2], ["2-4 d", 2, 4], ["4-7 d", 4, 7], ["7-14 d", 7, 14], ["14+ d", 14, Infinity]];
  const hist: HistBucket[] = edges.map(([label, lo, hi]) => ({ label, value: tCur.filter((x) => x >= lo && x < hi).length }));
  const trendBy = new Map<number, number[]>();
  for (const s of gCur) if (s.signedAt !== null && s.signedAt >= s.sentAt) { const k = b.of(s.signedAt); trendBy.set(k, [...(trendBy.get(k) ?? []), days(s.signedAt - s.sentAt)]); }
  const trend: TrendPoint[] = b.starts.map((s) => ({ label: b.granularity === "day" ? fmtDay(s) : `Week of ${fmtDay(s)}`, value: round1(avg(trendBy.get(s) ?? [])) }));

  // ---- AI use ----
  const runs = ai.filter((r) => inRange(r.at, range.from, range.to));
  const docsActive = new Set(docs.filter((d) => inRange(d.updatedAt, range.from, range.to)).map((d) => d.id));
  const aiDocs = new Set(runs.map((r) => r.documentId).filter((id) => docsActive.has(id)));
  const aiBy = new Map<number, number>();
  for (const r of runs) aiBy.set(b.of(r.at), (aiBy.get(b.of(r.at)) ?? 0) + 1);

  // ---- versions per document (all items in scope) ----
  const vEdges: [string, (n: number) => boolean][] = [["None", (n) => n === 0], ["1", (n) => n === 1], ["2", (n) => n === 2], ["3", (n) => n === 3], ["4-5", (n) => n >= 4 && n <= 5], ["6+", (n) => n >= 6]];
  const versions: HistBucket[] = vEdges.map(([label, f]) => ({ label, value: live.filter((d) => f(d.versionSeq)).length }));

  // ---- exports ----
  const e = exp.filter((x) => inRange(x.at, range.from, range.to));
  const exports = { pdf: e.filter((x) => x.format === "pdf").length, docx: e.filter((x) => x.format === "docx").length, other: e.filter((x) => x.format === "other").length, total: e.length };

  // ---- leaderboard ----
  const lb = new Map<string, LeaderRow>();
  const row = (id: string): LeaderRow => { let r = lb.get(id); if (!r) { r = { userId: id, name: input.names[id] ?? "Someone", created: 0, sent: 0, signed: 0 }; lb.set(id, r); } return r; };
  for (const d of cur) if (d.createdBy) row(d.createdBy).created += 1;
  for (const s of sCur) if (s.sentBy) { row(s.sentBy).sent += 1; if (s.signedAt !== null) row(s.sentBy).signed += 1; }
  const leaderboard = [...lb.values()].sort((a, c) => c.created + c.sent - (a.created + a.sent) || a.name.localeCompare(c.name)).slice(0, 8);

  const activity: ActivityRow[] = [...input.activity].sort((a, c) => c.at - a.at).slice(0, 12);

  return {
    range, scope: scope.all ? "all" : "mine", generatedAt: now, tiles,
    created: { granularity: b.granularity, points: series, total: cur.length },
    funnel,
    byCategory: topN(cat, 10), byDepartment: topN(dep, 10),
    turnaround: { buckets: hist, trend, count: tCur.length, avgDays: round1(avg(tCur)), medianDays: round1(median(tCur)) },
    ai: { runs: runs.length, proposed: runs.filter((r) => r.status === "proposed").length, failed: runs.filter((r) => r.status === "failed").length, inputTokens: runs.reduce((s, r) => s + r.inputTokens, 0), outputTokens: runs.reduce((s, r) => s + r.outputTokens, 0), docsWithAi: aiDocs.size, docsActive: docsActive.size, sharePct: docsActive.size ? Math.round((aiDocs.size / docsActive.size) * 1000) / 10 : null, series: b.starts.map((s) => ({ label: b.granularity === "day" ? fmtDay(s) : `Week of ${fmtDay(s)}`, value: aiBy.get(s) ?? 0 })) },
    source: { fromLibrary, scratch: cur.length - fromLibrary },
    topTemplates: topN(tpl, 8, (k) => tplName.get(k) ?? k),
    versions, exports,
    attention: buildAttention(input, now),
    leaderboard, activity,
    empty: scoped.docs.length === 0 && scoped.sends.length === 0 && scoped.ai.length === 0,
    filters, filterCount: countPbFilters(filters), noMatch: countPbFilters(filters) > 0 && docs.length === 0 && sends.length === 0 && ai.length === 0, options,
  };
}

export type { AiRunRow, ExportRow };
