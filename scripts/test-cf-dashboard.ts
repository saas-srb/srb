import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAY_MS, istDayStart, resolveRange } from "../src/lib/products/playbook-ai/dashboard/ranges";
import { buildCfDashboard, scopeCfInput } from "../src/lib/products/contractflow-ai/dashboard/compute";
import { applyCfFilters, cfFiltersKey, countCfFilters, EMPTY_CF_FILTERS, parseCfFilters } from "../src/lib/products/contractflow-ai/dashboard/filters";
import type { CfDashboardInput, CfDocRow, CfRequestRow, CfSignerRow } from "../src/lib/products/contractflow-ai/dashboard/types";

// Pure: no database, no clock. Run with: npx tsx scripts/test-cf-dashboard.ts
let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = <T,>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); n++; };

const NOW = Date.UTC(2026, 10, 9, 8, 30);
const day = (d: number, h = 12) => istDayStart(NOW) - d * DAY_MS + h * 3_600_000;
const R = resolveRange("30", NOW);

const doc = (id: string, o: Partial<CfDocRow> = {}): CfDocRow => ({ id, title: id, kind: "document", status: "sent", createdAt: day(20), updatedAt: day(20), createdBy: "u1", partyType: "client", partyName: "Northwind Demo", typeLabel: "Master services agreement", renewalAt: null, stampPending: false, ...o });
const req = (id: string, cloneId: string, o: Partial<CfRequestRow> = {}): CfRequestRow => ({ id, cloneId, status: "sent", createdAt: day(10), expiresAt: day(-5), voidedAt: null, createdBy: "u1", ...o });
const sig = (id: string, requestId: string, cloneId: string, o: Partial<CfSignerRow> = {}): CfSignerRow => ({ id, requestId, cloneId, name: "Asha", role: "counterparty", partyType: "client", status: "sent", sentAt: day(10), viewedAt: null, otpVerifiedAt: null, signedAt: null, declineReason: null, lockedUntil: null, signatureKind: null, ...o });
const input: CfDashboardInput = {
  docs: [
    doc("a", { status: "signed", createdAt: day(12), renewalAt: NOW + 10 * DAY_MS, stampPending: true }),
    doc("b", { status: "sent", createdAt: day(9), partyType: "employee", partyName: "Ravi Menon", typeLabel: "Offer letter" }),
    doc("c", { status: "sent", createdAt: day(5) }),
    doc("d", { status: "clone_draft", createdAt: day(2) }),
    doc("e", { status: "declined", createdAt: day(8), createdBy: "u2" }),
    doc("f", { status: "signed", createdAt: day(45) }),
  ],
  requests: [
    req("ra", "a", { status: "completed", createdAt: day(11) }),
    req("rb", "b", { status: "sent", createdAt: day(9), expiresAt: NOW + 3 * DAY_MS }),
    req("rc", "c", { status: "in_progress", createdAt: day(4), expiresAt: NOW + 20 * DAY_MS }),
    req("re", "e", { status: "declined", createdAt: day(7), createdBy: "u2" }),
    req("rf", "f", { status: "completed", createdAt: day(40) }),
  ],
  signers: [
    sig("sa", "ra", "a", { status: "signed", viewedAt: day(11), otpVerifiedAt: day(11), signedAt: day(9), signatureKind: "drawn" }),
    sig("sb", "rb", "b", { status: "viewed", viewedAt: day(6), partyType: "employee", name: "Ravi" }),
    sig("sc", "rc", "c", { status: "otp_verified", viewedAt: day(3), otpVerifiedAt: day(3), lockedUntil: NOW + 600_000 }),
    sig("se", "re", "e", { status: "declined", declineReason: "Terms not accepted", sentAt: day(7), viewedAt: day(6) }),
    sig("sf", "rf", "f", { status: "signed", viewedAt: day(40), otpVerifiedAt: day(40), signedAt: day(38), signatureKind: "typed" }),
  ],
  events: [
    { type: "otp_sent", at: day(11), requestId: "ra", channel: "email", resent: false }, { type: "otp_sent", at: day(3), requestId: "rc", channel: "sms", resent: false },
    { type: "otp_failed", at: day(3), requestId: "rc", channel: null, resent: false }, { type: "otp_verified", at: day(11), requestId: "ra", channel: null, resent: false }, { type: "otp_verified", at: day(3), requestId: "rc", channel: null, resent: false }, { type: "otp_verified", at: day(40), requestId: "rf", channel: null, resent: false },
    { type: "link_issued", at: day(5), requestId: "rb", channel: null, resent: true }, { type: "link_issued", at: day(9), requestId: "rb", channel: null, resent: false },
  ],
  activity: [{ at: day(1), actorId: "u1", actor: "Priya", action: "request_created", summary: "sent a document for signature", documentId: "c" }],
  names: { u1: "Priya", u2: "Ravi" },
};
const all = buildCfDashboard(input, R, { all: true, userId: "u1" }, NOW);
const tile = (k: string) => all.tiles.find((t) => t.key === k)!;

// ---- tiles and deltas ----
eq(tile("documents").value, 6, "six documents");
eq([tile("signed").value, tile("signed").prev], [1, 1], "one completed in this period, one in the one before");
eq(tile("out").value, 2, "two requests are open now");
eq(tile("completion").value, 25, "completion: 1 of the 4 sent in the period");
eq(tile("turnaround").value, 2, "average time to sign is 2 days (sent day 11, signed day 9)");
eq(tile("lost").value, 1, "one rejected in the period");
eq(tile("otp").value, 33.3, "one wrong code in three attempts");
eq(tile("reminders").value, 1, "one reminder (a link sent again)");
eq(tile("viewed").value, 4, "four requests were opened in the period");
eq(buildCfDashboard({ ...input, requests: [], signers: [] }, R, { all: true, userId: "u1" }, NOW).tiles.find((t) => t.key === "turnaround")!.value, null, "no signatures: no average");

// ---- funnel (cohort of documents created in the period) ----
eq(all.funnel.map((f) => f.value), [5, 4, 4, 2, 1], "created 5, sent 4, viewed 4, OTP 2, signed 1");
ok(all.funnel.every((f, i) => i === 0 || f.value <= all.funnel[i - 1].value), "a step never exceeds the one before");
eq(all.funnel[3].dropPct, 50, "drop from viewed to identity confirmed");

// ---- series, breakdowns ----
eq([all.over.sent, all.over.signed], [4, 1], "sent and signed counts");
eq(all.over.points.reduce((s, p) => s + p.sent, 0), 4, "the series adds up");
eq(all.byRecipient.map((x) => [x.label, x.value]).sort(), [["Client", 3], ["Employee", 1]], "by recipient type");
eq(all.byChannel.map((x) => [x.label, x.value]).sort(), [["Email", 1], ["SMS", 1]], "by code channel");
eq(all.byMethod.map((x) => [x.label, x.value]), [["Drawn", 1]], "signature method");
eq(all.outcomes.reasons.map((x) => x.label), ["Terms not accepted"], "rejection reasons");
eq(all.turnaround.buckets.map((x) => x.value), [0, 0, 1, 0, 0, 0], "turnaround histogram");

// ---- attention ----
eq(all.attention.awaitingSignature.map((x) => x.id), ["rb"], "only a request open for more than 7 days");
ok(all.attention.awaitingSignature[0].href.endsWith("/send"), "the reminder goes through the send-again page");
eq(all.attention.expiringSoon.map((x) => x.id), ["rb"], "expiring within 7 days");
eq(all.attention.viewedNotSigned.map((x) => x.id), ["sb", "sc"], "viewed 3+ days ago and not signed, oldest first (open requests only)");
eq(all.attention.otpLockouts.map((x) => x.id), ["sc"], "a locked signer");
eq(all.attention.employeesUnsigned.map((x) => x.id), ["rb"], "an employee letter not signed");
eq(all.attention.renewalsSoon.map((x) => x.id), ["a"], "a signed document renewing within 30 days");
eq(all.attention.recentlyClosed.map((x) => x.id), ["re"], "a rejected request in the last 14 days");
eq(all.attention.stampPending.map((x) => x.id), ["a"], "a document that needs stamp duty");
ok(all.attention.otpLockouts[0].href.startsWith("/contractflow-ai/clones/"), "rows link to the document");

// ---- permissions ----
const mine = buildCfDashboard(input, R, { all: false, userId: "u2" }, NOW);
eq(mine.scope, "mine", "a non-manager gets the personal view");
eq(scopeCfInput(input, { all: false, userId: "u2" }).docs.map((d) => d.id), ["e"], "only the documents they created");
eq(scopeCfInput(input, { all: false, userId: "u2" }).requests.map((r) => r.id), ["re"], "and their requests");
ok(mine.leaderboard.every((l) => l.userId === "u2"), "only their own row");
eq(all.leaderboard.map((l) => l.name), ["Priya", "Ravi"], "a manager sees the team, busiest first");

// ---- empty, nav, home ----
const empty = buildCfDashboard({ docs: [], requests: [], signers: [], events: [], activity: [], names: {} }, R, { all: true, userId: "u1" }, NOW);
ok(empty.empty && empty.funnel.every((f) => f.value === 0) && empty.attention.awaitingSignature.length === 0, "empty input: zeros, empty lists");
const nav = readFileSync("src/components/products/contractflow-ai/LpmsSidebar.tsx", "utf8");
ok(readFileSync("src/lib/products/contractflow-ai/nav.ts", "utf8").includes("/contractflow-ai/dashboard"), "the sidebar definition has the Dashboard page");
ok(/redirect\("\/contractflow-ai\/dashboard"\)/.test(readFileSync("src/app/(products)/contractflow-ai/(protected)/page.tsx", "utf8")), "/contractflow-ai lands on the dashboard");
// ---- filters ----
const F = (o: Partial<typeof EMPTY_CF_FILTERS>) => ({ ...EMPTY_CF_FILTERS, ...o });
const ids = (f: Partial<typeof EMPTY_CF_FILTERS>) => applyCfFilters(input, F(f)).docs.map((d) => d.id).sort();
eq(ids({}), ["a", "b", "c", "d", "e", "f"], "no filter keeps everything");
eq(ids({ recipient: "employee" }), ["b"], "by recipient type");
eq(ids({ status: "signed" }), ["a", "f"], "by status: signed");
eq(ids({ status: "draft" }), ["d"], "by status: draft");
eq(ids({ status: "rejected" }), ["e"], "by status: rejected");
eq(ids({ status: "sent" }), ["b", "c"], "by status: sent");
eq(ids({ sender: "u2" }), ["e"], "by sender (the request's creator)");
eq(ids({ channel: "sms" }), ["c"], "by code channel");
eq(ids({ channel: "email" }), ["a"], "by code channel: email");
eq(ids({ q: "northwind" }), ["a", "c", "d", "e", "f"], "search on the recipient's name");
eq(ids({ q: "ravi" }), ["b"], "search on a signer's name");
eq(ids({ type: "sop" }), [], "no SOP-type documents here");
eq(ids({ recipient: "client", status: "signed" }), ["a", "f"], "filters combine (AND)");
const filtered = buildCfDashboard(input, R, { all: true, userId: "u1" }, NOW, F({ recipient: "employee" }));
eq(filtered.tiles.find((t) => t.key === "documents")!.value, 1, "the tiles follow the filter");
eq(filtered.attention.employeesUnsigned.map((x) => x.id), ["rb"], "and the attention lists");
ok(filtered.attention.otpLockouts.length === 0 && filtered.attention.renewalsSoon.length === 0, "other people's rows are gone from the lists");
const noMatch = buildCfDashboard(input, R, { all: true, userId: "u1" }, NOW, F({ q: "zzzz" }));
ok(noMatch.noMatch && !noMatch.empty, "no match is not the empty state");
ok(!buildCfDashboard(input, R, { all: true, userId: "u1" }, NOW).noMatch, "no filters: no no-match state");
eq(buildCfDashboard(input, R, { all: false, userId: "u2" }, NOW).options.senders.map((s) => s.id), ["u2"], "a non-manager's sender choices are only themselves");
eq(parseCfFilters({ type: "bad", status: "signed", channel: "fax", recipient: "client", q: " x " }), F({ status: "signed", recipient: "client", q: "x" }), "the URL is sanitised");
eq(countCfFilters(F({ q: "a", status: "signed" })), 2, "the active-filter count");
ok(cfFiltersKey(F({ status: "signed" })) !== cfFiltersKey(F({ status: "sent" })), "the cache key tells filters apart");
console.log(`contractflow dashboard: ${n} checks passed`);
