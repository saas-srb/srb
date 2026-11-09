import assert from "node:assert/strict";
import { DAY_MS, fyStart, istDayStart, resolveRange, weekStart } from "../src/lib/products/playbook-ai/dashboard/ranges";
import { buildDashboard, buckets, scopeInput } from "../src/lib/products/playbook-ai/dashboard/compute";
import { dashboardCsv } from "../src/lib/products/playbook-ai/dashboard/csv";
import { applyPbFilters, countPbFilters, EMPTY_PB_FILTERS, parsePbFilters, pbFiltersKey, pbFilterOptions } from "../src/lib/products/playbook-ai/dashboard/filters";
import type { DashboardInput, DocRow, SendRow } from "../src/lib/products/playbook-ai/dashboard/types";

// Pure: no database, no clock. Run with: npx tsx scripts/test-pb-dashboard.ts
let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = <T,>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); n++; };

// "Now" is 9 Nov 2026, 14:00 IST.
const NOW = Date.UTC(2026, 10, 9, 8, 30);
const day = (daysAgo: number, hourIst = 12): number => istDayStart(NOW) - daysAgo * DAY_MS + hourIst * 3_600_000;

// ---- ranges (IST) ----
const r30 = resolveRange("30", NOW);
eq(r30.days, 30, "last 30 days is 30 days");
eq(r30.from, istDayStart(NOW) - 29 * DAY_MS, "it starts at 00:00 IST, 29 days before today");
eq(r30.prevTo, r30.from, "the previous period ends where this one starts");
eq(r30.prevTo - r30.prevFrom, r30.to - r30.from, "and is as long");
const fy = resolveRange("fy", NOW);
eq(fy.from, Date.UTC(2026, 3, 1) - 19_800_000, "this FY starts 1 April 00:00 IST");
eq(fyStart(Date.UTC(2026, 1, 15)), Date.UTC(2025, 3, 1) - 19_800_000, "February belongs to the FY that started the April before");
eq(fyStart(Date.UTC(2026, 2, 31, 20)), Date.UTC(2026, 3, 1) - 19_800_000, "31 March 20:00 UTC is already 1 April IST: the new FY");
ok(/FY 2026-27/.test(fy.label), "the FY label is Indian style");
const c = resolveRange("custom", NOW, { from: "2026-10-01", to: "2026-10-31" });
eq([c.key, c.days], ["custom", 31], "a custom range is whole IST days");
eq(resolveRange("custom", NOW, { from: "2026-10-31", to: "2026-10-01" }).key, "30", "a backwards custom range falls back to 30 days");
eq(resolveRange("custom", NOW, { from: "2024-01-01", to: "2026-10-01" }).key, "30", "more than 366 days falls back");
eq(resolveRange("nonsense", NOW).key, "30", "an unknown key falls back");
eq(new Date(weekStart(NOW) + 19_800_000).getUTCDay(), 1, "weeks start on Monday (IST)");

// ---- buckets ----
const bk30 = buckets(r30);
eq([bk30.granularity, bk30.starts.length], ["day", 30], "30 days are daily buckets");
eq(buckets(resolveRange("90", NOW)).granularity, "week", "90 days are weekly buckets");

// ---- fixture ----
const doc = (id: string, o: Partial<DocRow>): DocRow => ({ id, title: id, kind: "document", status: "draft", createdAt: day(5), updatedAt: day(5), createdBy: "u1", department: "HR", category: "HR", templateId: null, templateName: null, versionSeq: 0, legalPending: false, reviewedAt: null, ...o });
const send = (id: string, o: Partial<SendRow>): SendRow => ({ id, documentId: id, cloneId: `c-${id}`, title: id, sentAt: day(10), viewedAt: null, signedAt: null, status: "sent", sentBy: "u1", partyName: "Asha", partyType: "employee", ...o });
const input: DashboardInput = {
  docs: [
    doc("a", { kind: "sop", status: "issued", createdAt: day(3), department: "HR", category: "Human Resources", templateId: "sop.hr.recruitment", templateName: "Recruitment", versionSeq: 2, reviewedAt: day(400) }),
    doc("b", { kind: "sop", status: "draft", createdAt: day(40), updatedAt: day(20) }),
    doc("c", { kind: "kpi", createdAt: day(2), department: "Sales", templateId: "kpi.sales", templateName: "Sales KPI", versionSeq: 1 }),
    doc("d", { createdAt: day(1), legalPending: true, department: "Legal", category: "Contracts" }),
    doc("e", { createdAt: day(35), createdBy: "u2", status: "archived" }),
    doc("f", { createdAt: day(33), createdBy: "u2", updatedAt: day(33) }),
  ],
  sends: [
    send("s1", { documentId: "a", sentAt: day(10), viewedAt: day(9), signedAt: day(8), status: "signed" }),
    send("s2", { documentId: "c", sentAt: day(6), viewedAt: day(5), status: "viewed", sentBy: "u2" }),
    send("s3", { documentId: "d", sentAt: day(12), status: "sent" }),
    send("s4", { documentId: "f", sentAt: day(40), signedAt: day(38), viewedAt: day(39), status: "signed" }),
    send("s5", { documentId: "b", sentAt: day(2), status: "sent", partyType: "client", partyName: "Northwind" }),
  ],
  ai: [{ at: day(2), userId: "u1", documentId: "a", inputTokens: 1000, outputTokens: 400, status: "proposed" }, { at: day(3), userId: "u2", documentId: "f", inputTokens: 10, outputTokens: 5, status: "failed" }],
  exports: [{ at: day(2), format: "pdf", actorId: "u1" }, { at: day(2), format: "docx", actorId: "u1" }, { at: day(1), format: "pdf", actorId: "u2" }],
  activity: [{ at: day(1), actorId: "u1", actor: "Priya", action: "create", summary: "Created", documentId: "a" }, { at: day(2), actorId: "u2", actor: "Ravi", action: "edit", summary: "Edited", documentId: "f" }],
  names: { u1: "Priya", u2: "Ravi" },
};
const all = buildDashboard(input, r30, { all: true, userId: "u1" }, NOW);
const tile = (k: string) => all.tiles.find((t) => t.key === k)!;

// ---- tiles, deltas ----
eq(tile("sops").value, 2, "SOP total counts non-archived SOPs");
eq(tile("documents").value, 2, "documents exclude the archived one");
eq([tile("sops").prev, tile("sops").deltaPct], [1, 100], "the SOP total grew by one in the period: 1 to 2 is +100 percent");
eq(tile("sent").value, 4, "four were sent in the last 30 days");
eq([tile("sent").prev, tile("sent").deltaPct], [1, 300], "one was sent in the previous period: +300 percent");
eq(tile("signed").value, 1, "one was signed in the period");
eq(tile("turnaround").value, 2, "average time to sign is 2 days");
eq([tile("completion").value, tile("completion").prev], [25, 100], "completion: 1 signed of 4 sent; the previous period 1 of 1");
eq(buildDashboard({ ...input, sends: [] }, r30, { all: true, userId: "u1" }, NOW).tiles.find((t) => t.key === "turnaround")!.value, null, "no signatures: no average, not zero");
ok(buildDashboard({ ...input, sends: [send("x", { sentAt: day(1) })] }, r30, { all: true, userId: "u1" }, NOW).tiles.find((t) => t.key === "sent")!.deltaPct === null, "nothing before: no percentage (no divide by zero)");

// ---- funnel ----
eq(all.funnel.map((f) => f.value), [3, 3, 2, 1], "created 3; all three were sent, two viewed, one signed");
eq(all.funnel.map((f) => f.dropPct), [null, 0, 33.3, 50], "the drop between steps");
eq(all.funnel[3].pctOfFirst, 33.3, "signed is a third of created");
ok(all.funnel.every((f, i) => i === 0 || f.value <= all.funnel[i - 1].value), "a step never exceeds the one before");

// ---- series, categories, source, histogram ----
eq(all.created.total, 3, "three were created in the period");
eq(all.created.points.reduce((s, p) => s + p.sop + p.document + p.kpi, 0), 3, "the daily series adds up");
eq(all.created.points.find((p) => p.start === istDayStart(day(3)))!.sop, 1, "a SOP is on the day it was created (IST)");
eq(all.byDepartment[0].value, 1, "departments are counted");
eq(all.source, { fromLibrary: 2, scratch: 1 }, "library vs scratch");
eq(all.topTemplates.map((t) => t.label).sort(), ["Recruitment", "Sales KPI"], "top templates use names");
eq(all.turnaround.buckets.map((x) => x.value), [0, 0, 1, 0, 0, 0], "a 2-day turnaround lands in the 2 to 4 day bucket");
eq(all.versions.map((x) => x.value), [3, 1, 1, 0, 0, 0], "versions per document");
eq(all.exports, { pdf: 2, docx: 1, other: 0, total: 3 }, "exports by format");
eq([all.ai.runs, all.ai.proposed, all.ai.failed, all.ai.inputTokens], [2, 1, 1, 1010], "AI runs and tokens");

// ---- attention ----
eq(all.attention.staleDrafts.map((x) => x.id), ["f", "b"], "drafts untouched for 14+ days, oldest first");
eq(all.attention.awaitingSignature.map((x) => x.id), ["s3"], "only a send past the 7-day SLA and still open");
eq(all.attention.legalPending.map((x) => x.id), ["d"], "legal review pending");
eq(all.attention.sopsDueReview.map((x) => x.id), ["a"], "an issued SOP reviewed more than 12 months ago");
eq(all.attention.employeesUnsigned.map((x) => x.id), ["s3", "s2"], "employees with unsigned letters (not the signed one, not the client)");
ok(all.attention.staleDrafts[0].href.startsWith("/playbook-ai/documents/"), "rows link to the item");
ok(all.attention.awaitingSignature[0].href.startsWith("/contractflow-ai/clones/"), "signature rows link to the ContractFlow copy");

// ---- permissions ----
const mine = buildDashboard(input, r30, { all: false, userId: "u1" }, NOW);
eq(mine.scope, "mine", "a non-manager gets the personal view");
ok(mine.leaderboard.every((l) => l.userId === "u1"), "and only their own row");
eq(scopeInput(input, { all: false, userId: "u2" }).docs.map((d) => d.id), ["e", "f"], "scoping keeps only what they created");
eq(scopeInput(input, { all: false, userId: "u2" }).sends.map((s) => s.id), ["s2"], "and only what they sent");
ok(mine.attention.staleDrafts.every((x) => x.id !== "f"), "another person's draft is never listed");
eq(all.leaderboard.map((l) => l.name), ["Priya", "Ravi"], "a manager sees the whole team, busiest first");
eq(all.leaderboard[0].created + all.leaderboard[0].sent >= all.leaderboard[1].created + all.leaderboard[1].sent, true, "sorted by created plus sent");

// ---- empty and CSV ----
const empty = buildDashboard({ docs: [], sends: [], ai: [], exports: [], activity: [], names: {} }, r30, { all: true, userId: "u1" }, NOW);
ok(empty.empty && empty.funnel.every((f) => f.value === 0) && empty.attention.staleDrafts.length === 0, "empty input: zeros, empty lists, the empty flag");
ok(empty.turnaround.avgDays === null && empty.ai.sharePct === null, "no averages from nothing");
const csv = dashboardCsv(all);
ok(csv.startsWith("Playbook dashboard,Last 30 days,Whole company\r\n") && csv.includes("Sent for signature,4,1,300"), "the CSV carries the figures");
ok(!/\n=/.test(dashboardCsv({ ...all, byCategory: [{ key: "x", label: "=SUM(A1)", value: 1 }] })), "a CSV cell never starts a formula");
ok(dashboardCsv({ ...all, byCategory: [{ key: "x", label: 'a "b", c', value: 1 }] }).includes('"a ""b"", c"'), "quotes and commas are escaped");
// ---- ranges: today and this month (IST) ----
const today = resolveRange("today", NOW);
eq([today.key, today.from, today.days], ["today", istDayStart(NOW), 1], "today starts at 00:00 IST");
const month = resolveRange("month", NOW);
eq(month.from, Date.UTC(2026, 10, 1) - 19_800_000, "this month starts on the 1st, 00:00 IST");

// ---- filters ----
const F = (o: Partial<typeof EMPTY_PB_FILTERS>) => ({ ...EMPTY_PB_FILTERS, ...o });
const by = (f: Partial<typeof EMPTY_PB_FILTERS>) => buildDashboard(input, r30, { all: true, userId: "u1" }, NOW, F(f));
const ids = (f: Partial<typeof EMPTY_PB_FILTERS>) => applyPbFilters(input, F(f)).docs.map((d) => d.id).sort();
eq(ids({}), ["a", "b", "c", "d", "e", "f"], "no filter keeps everything");
eq(ids({ type: "sop" }), ["a", "b"], "by type");
eq(ids({ source: "library" }), ["a", "c"], "library or template");
eq(ids({ source: "scratch" }), ["b", "d", "e", "f"], "from scratch");
eq(ids({ department: "Sales" }), ["c"], "by department");
eq(ids({ category: "Contracts" }), ["d"], "by category");
eq(ids({ creator: "u2" }), ["e", "f"], "by creator");
eq(ids({ status: "draft" }), ["b", "c", "d", "f"], "by document status");
eq(ids({ status: "issued" }), ["a"], "issued");
eq(ids({ status: "sent" }), ["a", "b", "c", "d", "e", "f"].filter((id) => input.sends.some((x) => x.documentId === id)), "sent: documents that have a send");
eq(ids({ status: "signed" }), ["a", "f"], "signed: documents with a signed send");
eq(ids({ q: "recruit" }), [], "search matches title text only (no match here)");
eq(ids({ q: "c" }).includes("c"), true, "search on the title");
eq(ids({ q: "ravi" }), ["e", "f"], "search on the author's name");
eq(ids({ type: "document", creator: "u1", status: "draft" }), ["d"], "filters combine (AND)");
eq(ids({ type: "kpi", source: "scratch" }), [], "a combination with no match");
const sopOnly = by({ type: "sop" });
eq(sopOnly.tiles.find((t) => t.key === "documents")!.value, 0, "the tiles follow the filter (no documents when only SOPs are kept)");
eq(sopOnly.created.total, 1, "so does the created series");
eq(sopOnly.tiles.find((t) => t.key === "sent")!.value, 2, "and the signature figures (only the sends of the kept documents)");
ok(sopOnly.attention.staleDrafts.every((x) => x.id === "b"), "and the attention lists");
ok(by({ creator: "u2" }).exports.total === 1 && by({}).exports.total === 3, "exports are narrowed by creator only");
const none = by({ q: "zzzz-nothing" });
ok(none.noMatch && !none.empty && none.filterCount === 1, "filters that match nothing: a no-match state, not the empty-company state");
ok(!by({}).noMatch && by({}).filterCount === 0, "no filters: neither");
eq(by({ type: "sop" }).options.creators.map((c) => c.id), ["u1", "u2"], "the select choices come from the whole scope, not from the filtered rows");
eq(buildDashboard(input, r30, { all: false, userId: "u2" }, NOW).options.creators.map((c) => c.id), ["u2"], "a non-manager's choices never include other people");
ok(buildDashboard(input, r30, { all: false, userId: "u2" }, NOW, F({ creator: "u1" })).noMatch, "a creator filter cannot widen a personal view");
eq(parsePbFilters({ type: "nonsense", status: "x", source: "library", q: "  hi\u0000 ", category: "A" }), F({ source: "library", q: "hi", category: "A" }), "the URL is sanitised (unknown values dropped, control characters removed)");
eq(countPbFilters(F({ type: "sop", q: "x" })), 2, "the active-filter count");
ok(pbFiltersKey(F({ type: "sop" })) !== pbFiltersKey(F({ type: "kpi" })), "the cache key tells filters apart");
ok(pbFilterOptions(input).departments.includes("HR") && pbFilterOptions(input).categories.length > 0, "options list departments and categories");
console.log(`dashboard: ${n} checks passed`);
