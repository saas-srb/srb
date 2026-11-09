/** The ContractFlow dashboard aggregation: pure functions over fetched rows (no database, no clock; `now` is passed in). Nothing is invented. */
import { DAY_MS, IST_OFFSET_MS } from "@/lib/products/playbook-ai/dashboard/ranges";
import { buckets } from "@/lib/products/playbook-ai/dashboard/compute";
import { applyCfFilters, cfFilterOptions, countCfFilters, EMPTY_CF_FILTERS, type CfFilters } from "@/lib/products/contractflow-ai/dashboard/filters";
import type { AttentionItem, CfDashboardData, CfDashboardInput, CfDocRow, CfLeader, CfRequestRow, CfSignerRow, CountItem, DateRange, FunnelStep, HistBucket, Scope, Tile, TrendPoint } from "@/lib/products/contractflow-ai/dashboard/types";

export const SLA_DAYS = 7;
export const EXPIRY_WINDOW_DAYS = 7;
export const VIEWED_STALE_DAYS = 3;
export const RECENT_CLOSED_DAYS = 14;
export const RENEWAL_WINDOW_DAYS = 30;
const OPEN_REQ = new Set(["sent", "in_progress"]);
const PARTY_LABEL: Record<string, string> = { client: "Client", employee: "Employee", vendor: "Vendor", candidate: "Candidate", other: "Other" };

const inRange = (t: number, a: number, b: number): boolean => t >= a && t < b;
const days = (ms: number): number => ms / DAY_MS;
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r1 = (x: number | null): number | null => (x === null ? null : Math.round(x * 10) / 10);
const median = (xs: number[]): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pctChange = (cur: number | null, prev: number | null): number | null => (cur === null || prev === null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10);
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const ago = (now: number, t: number): number => Math.max(Math.floor(days(now - t)), 0);
const fmtDay = (ms: number): string => new Date(ms + IST_OFFSET_MS).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
const top = (m: Map<string, number>, n: number, label: (k: string) => string = (k) => k): CountItem[] => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k, v]) => ({ key: k, label: label(k), value: v }));
const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** Managers (who may sign or manage documents) see everything; everyone else only what they created. Pure. */
export function scopeCfInput(input: CfDashboardInput, scope: Scope): CfDashboardInput {
  if (scope.all) return input;
  const mine = new Set(input.docs.filter((d) => d.createdBy === scope.userId).map((d) => d.id));
  const reqs = input.requests.filter((r) => mine.has(r.cloneId));
  const rid = new Set(reqs.map((r) => r.id));
  return { docs: input.docs.filter((d) => mine.has(d.id)), requests: reqs, signers: input.signers.filter((s) => rid.has(s.requestId)), events: input.events.filter((e) => rid.has(e.requestId)), activity: input.activity.filter((a) => a.actorId === scope.userId), names: input.names };
}

/** When a request was completed: the last signature. */
function completedAt(req: CfRequestRow, signers: CfSignerRow[]): number | null {
  if (req.status !== "completed") return null;
  const t = signers.filter((s) => s.signedAt !== null).map((s) => s.signedAt as number);
  return t.length ? Math.max(...t) : null;
}

export function buildCfDashboard(raw: CfDashboardInput, range: DateRange, scope: Scope, now: number, filters: CfFilters = EMPTY_CF_FILTERS): CfDashboardData {
  const scoped = scopeCfInput(raw, scope);
  const options = cfFilterOptions(scoped);
  const input = applyCfFilters(scoped, filters);
  const { docs, requests, signers, events } = input;
  const docById = new Map(docs.map((d) => [d.id, d]));
  const signersByReq = new Map<string, CfSignerRow[]>();
  for (const s of signers) signersByReq.set(s.requestId, [...(signersByReq.get(s.requestId) ?? []), s]);
  const done = new Map<string, number | null>(requests.map((r) => [r.id, completedAt(r, signersByReq.get(r.id) ?? [])]));

  const sentIn = (a: number, b: number): CfRequestRow[] => requests.filter((r) => inRange(r.createdAt, a, b));
  const signedIn = (a: number, b: number): CfRequestRow[] => requests.filter((r) => { const t = done.get(r.id); return t !== null && t !== undefined && inRange(t, a, b); });
  const turn = (rs: CfRequestRow[]): number[] => rs.flatMap((r) => { const t = done.get(r.id); return t !== null && t !== undefined && t >= r.createdAt ? [days(t - r.createdAt)] : []; });
  const closedIn = (a: number, b: number, st: string): number => requests.filter((r) => r.status === st && inRange(r.status === "voided" ? r.voidedAt ?? r.createdAt : r.status === "expired" ? r.expiresAt : (signersByReq.get(r.id) ?? []).map((s) => s.signedAt ?? 0).reduce((m, x) => Math.max(m, x), r.createdAt), a, b)).length;
  const completion = (a: number, b: number): number | null => { const c = sentIn(a, b); return pct(c.filter((r) => r.status === "completed").length, c.length); };
  const evIn = (a: number, b: number, type: string) => events.filter((e) => e.type === type && inRange(e.at, a, b)).length;
  const otpFail = (a: number, b: number): number | null => { const f = evIn(a, b, "otp_failed"), ok = evIn(a, b, "otp_verified"); return pct(f, f + ok); };
  const viewedReqs = (a: number, b: number): number => new Set(signers.filter((s) => s.viewedAt !== null && inRange(s.viewedAt, a, b)).map((s) => s.requestId)).size;

  const sCur = sentIn(range.from, range.to), sPrev = sentIn(range.prevFrom, range.prevTo);
  const gCur = signedIn(range.from, range.to), gPrev = signedIn(range.prevFrom, range.prevTo);
  const tCur = turn(gCur), tPrev = turn(gPrev);
  const live = docs;
  const created = (a: number, b: number) => docs.filter((d) => inRange(d.createdAt, a, b)).length;
  const lost = (a: number, b: number) => closedIn(a, b, "declined") + closedIn(a, b, "expired") + closedIn(a, b, "voided");
  const tile = (t: Omit<Tile, "deltaPct">): Tile => ({ ...t, deltaPct: pctChange(t.value, t.prev) });
  const openNow = requests.filter((r) => OPEN_REQ.has(r.status)).length;
  const tiles: Tile[] = [
    tile({ key: "documents", label: "Documents", value: live.length, format: "int", prev: live.length - created(range.from, range.to), note: "in ContractFlow", good: "up", href: "/contractflow-ai/documents" }),
    tile({ key: "drafts", label: "Drafts", value: live.filter((d) => d.status === "clone_draft" || d.status === "ready").length, format: "int", prev: null, note: "Not sent yet", good: "neutral", href: "/contractflow-ai/documents" }),
    tile({ key: "out", label: "Out for signature", value: openNow, format: "int", prev: null, note: "Open right now", good: "neutral", href: "/contractflow-ai/documents" }),
    tile({ key: "viewed", label: "Viewed", value: viewedReqs(range.from, range.to), format: "int", prev: viewedReqs(range.prevFrom, range.prevTo), note: "Opened by a signer", good: "up", href: "/contractflow-ai/documents" }),
    tile({ key: "signed", label: "Signed", value: gCur.length, format: "int", prev: gPrev.length, note: "Completed in this period", good: "up", href: "/contractflow-ai/documents?tab=signed" }),
    tile({ key: "lost", label: "Rejected, expired or voided", value: lost(range.from, range.to), format: "int", prev: lost(range.prevFrom, range.prevTo), note: "Closed without a signature", good: "down", href: "/contractflow-ai/documents" }),
    tile({ key: "turnaround", label: "Average time to sign", value: r1(avg(tCur)), format: "days", prev: r1(avg(tPrev)), note: tCur.length ? `${tCur.length} signed` : "Nothing signed yet", good: "down", href: "/contractflow-ai/documents?tab=signed" }),
    tile({ key: "completion", label: "Completion rate", value: completion(range.from, range.to), format: "pct", prev: completion(range.prevFrom, range.prevTo), note: "Of those sent in this period", good: "up", href: "/contractflow-ai/documents" }),
    tile({ key: "otp", label: "OTP failure rate", value: otpFail(range.from, range.to), format: "pct", prev: otpFail(range.prevFrom, range.prevTo), note: "Wrong codes among all attempts", good: "down", href: "/contractflow-ai/documents" }),
    tile({ key: "reminders", label: "Reminders sent", value: events.filter((e) => e.type === "link_issued" && e.resent && inRange(e.at, range.from, range.to)).length, format: "int", prev: events.filter((e) => e.type === "link_issued" && e.resent && inRange(e.at, range.prevFrom, range.prevTo)).length, note: "Links sent again", good: "neutral", href: "/contractflow-ai/documents" }),
  ];

  // ---- sent and signed over time ----
  const b = buckets(range);
  const label = (s: number) => (b.granularity === "day" ? fmtDay(s) : `Week of ${fmtDay(s)}`);
  const pts = new Map(b.starts.map((s) => [s, { label: label(s), start: s, sent: 0, signed: 0 }]));
  for (const r of sCur) { const p = pts.get(b.of(r.createdAt)); if (p) p.sent += 1; }
  for (const r of gCur) { const t = done.get(r.id); const p = t === null || t === undefined ? undefined : pts.get(b.of(t)); if (p) p.signed += 1; }

  // ---- funnel: documents created in the period, how far each got ----
  const cohort = docs.filter((d) => inRange(d.createdAt, range.from, range.to));
  const reqByDoc = new Map<string, CfRequestRow[]>();
  for (const r of requests) reqByDoc.set(r.cloneId, [...(reqByDoc.get(r.cloneId) ?? []), r]);
  const reached = (d: CfDocRow, f: (s: CfSignerRow) => boolean) => (reqByDoc.get(d.id) ?? []).some((r) => (signersByReq.get(r.id) ?? []).some(f));
  const sentD = cohort.filter((d) => (reqByDoc.get(d.id) ?? []).length > 0);
  const viewedD = sentD.filter((d) => reached(d, (s) => s.viewedAt !== null || s.otpVerifiedAt !== null || s.signedAt !== null));
  const otpD = viewedD.filter((d) => reached(d, (s) => s.otpVerifiedAt !== null || s.signedAt !== null));
  const signedD = sentD.filter((d) => (reqByDoc.get(d.id) ?? []).some((r) => r.status === "completed"));
  const steps: [string, string, number][] = [["draft", "Created", cohort.length], ["sent", "Sent for signature", sentD.length], ["viewed", "Viewed by a signer", viewedD.length], ["otp", "Identity confirmed (OTP)", otpD.length], ["signed", "Signed", signedD.length]];
  const funnel: FunnelStep[] = steps.map(([key, lbl, value], i) => ({ key, label: lbl, value, pctOfFirst: pct(value, steps[0][2]), dropPct: i === 0 || steps[i - 1][2] === 0 ? null : Math.round((1 - value / steps[i - 1][2]) * 1000) / 10 }));

  // ---- turnaround ----
  const edges: [string, number, number][] = [["< 1 d", 0, 1], ["1-2 d", 1, 2], ["2-4 d", 2, 4], ["4-7 d", 4, 7], ["7-14 d", 7, 14], ["14+ d", 14, Infinity]];
  const hist: HistBucket[] = edges.map(([l, lo, hi]) => ({ label: l, value: tCur.filter((x) => x >= lo && x < hi).length }));
  const trendBy = new Map<number, number[]>();
  for (const r of gCur) { const t = done.get(r.id); if (t !== null && t !== undefined && t >= r.createdAt) { const k = b.of(t); trendBy.set(k, [...(trendBy.get(k) ?? []), days(t - r.createdAt)]); } }
  const trend: TrendPoint[] = b.starts.map((s) => ({ label: label(s), value: r1(avg(trendBy.get(s) ?? [])) }));

  // ---- breakdowns ----
  const type = new Map<string, number>(), rec = new Map<string, number>();
  for (const r of sCur) { const d = docById.get(r.cloneId); if (d) { inc(type, d.typeLabel); inc(rec, d.partyType || "other"); } }
  const chan = new Map<string, number>();
  for (const e of events) if (e.type === "otp_sent" && e.channel && inRange(e.at, range.from, range.to)) inc(chan, e.channel);
  const method = new Map<string, number>();
  for (const s of signers) if (s.signedAt !== null && s.signatureKind && inRange(s.signedAt, range.from, range.to)) inc(method, s.signatureKind);
  const reasons = new Map<string, number>();
  for (const s of signers) if (s.status === "declined" && s.declineReason && s.sentAt < range.to && s.sentAt >= range.from - 90 * DAY_MS) inc(reasons, s.declineReason.trim().slice(0, 80) || "No reason given");

  // ---- attention ----
  const item = (id: string, title: string, detail: string, cloneId: string): AttentionItem => ({ id, title, detail, href: `/contractflow-ai/clones/${encodeURIComponent(cloneId)}` });
  const titleOf = (id: string) => docById.get(id)?.title ?? "Document";
  const openReqs = requests.filter((r) => OPEN_REQ.has(r.status));
  const cap = <T,>(xs: T[]): T[] => xs.slice(0, 8);
  const sendAgain = (id: string) => `/contractflow-ai/clones/${encodeURIComponent(id)}/send`;
  const awaiting = cap(openReqs.filter((r) => now - r.createdAt >= SLA_DAYS * DAY_MS).sort((a, c) => a.createdAt - c.createdAt).map((r) => ({ ...item(r.id, titleOf(r.cloneId), `Sent ${ago(now, r.createdAt)} days ago, not signed. Send a reminder`, r.cloneId), href: sendAgain(r.cloneId) })));
  const expiringSoon = cap(openReqs.filter((r) => r.expiresAt > now && r.expiresAt - now <= EXPIRY_WINDOW_DAYS * DAY_MS).sort((a, c) => a.expiresAt - c.expiresAt).map((r) => item(r.id, titleOf(r.cloneId), `Link expires in ${Math.max(Math.ceil(days(r.expiresAt - now)), 0)} day${Math.ceil(days(r.expiresAt - now)) === 1 ? "" : "s"}`, r.cloneId)));
  const viewedNotSigned = cap(signers.filter((s) => s.status !== "signed" && s.status !== "declined" && s.viewedAt !== null && now - s.viewedAt >= VIEWED_STALE_DAYS * DAY_MS && openReqs.some((r) => r.id === s.requestId)).sort((a, c) => (a.viewedAt ?? 0) - (c.viewedAt ?? 0)).map((s) => ({ ...item(s.id, `${s.name}: ${titleOf(s.cloneId)}`, `Opened ${ago(now, s.viewedAt as number)} days ago, not signed. Send a reminder`, s.cloneId), href: sendAgain(s.cloneId) })));
  const closed = requests.filter((r) => (r.status === "declined" || r.status === "voided" || r.status === "expired")).map((r) => ({ r, at: r.status === "voided" ? r.voidedAt ?? r.createdAt : r.status === "expired" ? r.expiresAt : Math.max(r.createdAt, ...(signersByReq.get(r.id) ?? []).map((s) => s.signedAt ?? 0)) })).filter((x) => now - x.at <= RECENT_CLOSED_DAYS * DAY_MS && x.at <= now).sort((a, c) => c.at - a.at);
  const recentlyClosed = cap(closed.map(({ r, at }) => item(r.id, titleOf(r.cloneId), `${r.status === "declined" ? "Rejected" : r.status === "voided" ? "Voided" : "Expired"} ${ago(now, at)} days ago`, r.cloneId)));
  const otpLockouts = cap(signers.filter((s) => s.lockedUntil !== null && s.lockedUntil > now).map((s) => item(s.id, `${s.name}: ${titleOf(s.cloneId)}`, `Too many wrong codes; locked for ${Math.max(Math.ceil((s.lockedUntil as number - now) / 60000), 1)} more minutes`, s.cloneId)));
  const employeesUnsigned = cap(openReqs.filter((r) => docById.get(r.cloneId)?.partyType === "employee").sort((a, c) => a.createdAt - c.createdAt).map((r) => item(r.id, titleOf(r.cloneId), `Employee letter sent ${ago(now, r.createdAt)} days ago, not signed`, r.cloneId)));
  const renewalsSoon = cap(docs.filter((d) => d.status === "signed" && d.renewalAt !== null && d.renewalAt >= now - DAY_MS && d.renewalAt - now <= RENEWAL_WINDOW_DAYS * DAY_MS).sort((a, c) => (a.renewalAt ?? 0) - (c.renewalAt ?? 0)).map((d) => item(d.id, d.title, `Renews or expires on ${new Date((d.renewalAt as number) + IST_OFFSET_MS).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`, d.id)));
  const stampPending = cap(docs.filter((d) => d.stampPending && d.status !== "voided").map((d) => item(d.id, d.title, "Stamp duty applies; no certificate is recorded in ContractFlow yet", d.id)));

  // ---- team ----
  const lb = new Map<string, CfLeader>();
  for (const r of sCur) if (r.createdBy) { const l = lb.get(r.createdBy) ?? { userId: r.createdBy, name: input.names[r.createdBy] ?? "Someone", sent: 0, signed: 0 }; l.sent += 1; if (r.status === "completed") l.signed += 1; lb.set(r.createdBy, l); }
  const leaderboard = [...lb.values()].sort((a, c) => c.sent - a.sent || a.name.localeCompare(c.name)).slice(0, 8);

  return {
    range, scope: scope.all ? "all" : "mine", generatedAt: now, tiles,
    over: { granularity: b.granularity, points: [...pts.values()], sent: sCur.length, signed: gCur.length },
    funnel,
    turnaround: { buckets: hist, trend, count: tCur.length, avgDays: r1(avg(tCur)), medianDays: r1(median(tCur)) },
    byType: top(type, 10), byRecipient: top(rec, 6, (k) => PARTY_LABEL[k] ?? k), byChannel: top(chan, 3, (k) => (k === "sms" ? "SMS" : "Email")), byMethod: top(method, 3, (k) => (k === "drawn" ? "Drawn" : k === "typed" ? "Typed" : "Uploaded image")),
    outcomes: { declined: closedIn(range.from, range.to, "declined"), expired: closedIn(range.from, range.to, "expired"), voided: closedIn(range.from, range.to, "voided"), reasons: top(reasons, 6) },
    attention: { awaitingSignature: awaiting, expiringSoon, viewedNotSigned, recentlyClosed, otpLockouts, employeesUnsigned, renewalsSoon, stampPending },
    leaderboard, activity: [...input.activity].sort((a, c) => c.at - a.at).slice(0, 12),
    compliance: { signed: docs.filter((d) => d.status === "signed").length, stampPending: docs.filter((d) => d.stampPending && d.status !== "voided").length, renewalsSoon: docs.filter((d) => d.status === "signed" && d.renewalAt !== null && d.renewalAt >= now - DAY_MS && d.renewalAt - now <= RENEWAL_WINDOW_DAYS * DAY_MS).length },
    empty: scoped.docs.length === 0 && scoped.requests.length === 0,
    filters, filterCount: countCfFilters(filters), noMatch: countCfFilters(filters) > 0 && docs.length === 0 && requests.length === 0, options,
  };
}
