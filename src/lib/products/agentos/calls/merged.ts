import "server-only";
import type { Filter } from "mongodb";
import { botsCollection, listAllBots, listAibotsStaff, listUsableBots, toSummary, type BotSummary } from "@/lib/products/agentos/bots";
import { chatsCollection } from "@/lib/products/agentos/chats";
import { callActions, ATTENTION_STATUSES, isCallTab, type CallTab } from "@/lib/products/agentos/calls/call-ui";
import { callerName, listedPhone, recordingInfo, type RecordingInfo } from "@/lib/products/agentos/calls/call-display";
import { getConference } from "@/lib/products/agentos/calls/conference-state";
import { getPublicCallSettings } from "@/lib/products/agentos/calls/settings";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import { companyTimeZone } from "@/lib/products/agentos/calls/guards";
import { getCall, loadCallForViewer, toView } from "@/lib/products/agentos/calls/engine";
import { CALL_STATUSES, type CallDirection, type CallDoc, type CallStatus, type CallTarget } from "@/lib/products/agentos/calls/types";
import { buildCallQuery, CALLS_PAGE_SIZE, istRange, pageCount, type CallFilters as LegacyFilters } from "@/lib/products/agentos/voice/call-format";
import { can, type AibotsViewer } from "@/lib/products/agentos/viewer";

/**
 * ONE reader for the Calls page. Calls live in two places: `agentos_calls` (phone and scheduled calls, plus a mirror row for every
 * browser call made since the engine shipped) and the older chat rows that hold browser calls made before that. Both are merged
 * newest first; a chat row that already has a mirror row is shown once (as the engine call). The old Call History behaviour
 * (filters, detail page, recording) keeps working: legacy rows link to the same detail page as before.
 */

export const MERGED_PAGE_SIZE = CALLS_PAGE_SIZE;
const MAX_PAGE = 50;

export interface MergedFilters {
  tab: CallTab;
  bot: string;
  status: CallStatus | "";
  q: string;
  /** YYYY-MM-DD, IST, inclusive (the same day filter the old page had). */
  from: string;
  to: string;
  scope: "all" | "mine";
  page: number;
  /** Optional: only outbound, inbound, browser or website-visitor calls. */
  direction?: CallDirection | "";
}

/** The statuses the old page offered, still accepted in links people saved. */
const LEGACY_STATUS_ALIAS: Record<string, CallStatus> = { connected: "completed", processing: "in_progress", not_connected: "failed" };

const DIRECTIONS = ["outbound", "inbound", "web", "web_public"] as const;

export function parseMergedFilters(sp: Record<string, string | string[] | undefined>): MergedFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const status = one("status");
  const page = Math.floor(Number(one("page")));
  const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00+05:30`).getTime()) ? v : "");
  const tab = one("tab");
  return {
    tab: isCallTab(tab) ? tab : "all",
    bot: one("bot").slice(0, 64),
    status: (CALL_STATUSES as readonly string[]).includes(status) ? (status as CallStatus) : (LEGACY_STATUS_ALIAS[status] ?? ""),
    q: one("q").trim().slice(0, 80),
    from: day(one("from")),
    to: day(one("to")),
    scope: one("scope") === "mine" ? "mine" : "all",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    direction: (DIRECTIONS as readonly string[]).includes(one("direction")) ? (one("direction") as CallDirection) : "",
  };
}

export interface MergedCallRow {
  /** The id used in links: an engine call id, or a chat id for an older browser call. */
  id: string;
  source: "engine" | "legacy";
  href: string;
  /** The moment the list is ordered by (the scheduled time for an upcoming call). */
  at: string;
  direction: CallDirection;
  status: CallStatus;
  /** The caller as the list shows them when no record is linked: a masked number (per the company's setting) or the website visitor. */
  caller: string | null;
  /** Where a website visitor's call started. */
  origin: string | null;
  /** Older calls that never connected: still "failed", but said plainly. */
  statusNote: string | null;
  /** Placed to the company's test number (engine calls only). */
  testMode?: boolean;
  agentId: string;
  agent: BotSummary | null;
  purpose: string | null;
  target: CallTarget | null;
  phone: string | null;
  initiatedBy: string;
  mine: boolean;
  durationSecs: number | null;
  summary: string | null;
  scheduledFor: string | null;
  failureMessage: string | null;
  actions: { cancel: boolean; reschedule: boolean; retry: boolean };
}

export interface MergedCallList {
  items: MergedCallRow[];
  total: number;
  page: number;
  totalPages: number;
  oversight: boolean;
  agents: { value: string; label: string }[];
  /** Badge numbers for the tabs (the viewer's visible calls, ignoring the other filters). */
  counts: { upcoming: number; attention: number };
}

const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function engineQuery(f: MergedFilters, scopeUser: string | null): Filter<CallDoc> {
  const and: Filter<CallDoc>[] = [];
  if (scopeUser) and.push({ "initiatedBy.userId": scopeUser });
  if (f.bot) and.push({ agentId: f.bot });
  if (f.direction) and.push({ direction: f.direction });
  if (f.tab === "upcoming") and.push({ status: "scheduled" });
  if (f.tab === "attention") and.push({ direction: "outbound", status: { $in: [...ATTENTION_STATUSES] } });
  if (f.status) and.push({ status: f.status });
  const { gte, lt } = istRange(f.from, f.to);
  if (gte || lt) and.push({ createdAt: { ...(gte ? { $gte: gte } : {}), ...(lt ? { $lt: lt } : {}) } });
  if (f.q) {
    const r = new RegExp(rx(f.q), "i");
    and.push({ $or: [{ "initiatedBy.email": r }, { summary: r }, { summaryTitle: r }, { "target.label": r }] });
  }
  return and.length ? { $and: and } : {};
}

/** The old chat-row query plus the merged status/tab, and without chat rows that the engine mirrors. */
function legacyQuery(f: MergedFilters, scopeUser: string | null, mirrored: string[]): Record<string, unknown> | null {
  if (f.tab === "upcoming") return null; // an older browser call is never scheduled
  if (f.direction && f.direction !== "web") return null; // older calls are all browser calls
  const legacy: LegacyFilters = { bot: f.bot, status: "", q: f.q, from: f.from, to: f.to, scope: f.scope, page: 1 };
  const base = buildCallQuery(legacy, scopeUser);
  const and = [...(base.$and as Record<string, unknown>[])];
  if (mirrored.length) and.push({ _id: { $nin: mirrored } });
  const wants = f.tab === "attention" ? ("failed" as const) : f.status || null;
  if (wants) {
    if (f.tab === "attention" && f.status && f.status !== "failed") return null;
    if (wants === "completed") and.push({ "voiceCall.status": "done", "voiceCall.conversationId": { $type: "string" } });
    else if (wants === "failed") and.push({ $or: [{ "voiceCall.status": "failed" }, { "voiceCall.conversationId": null }] });
    else if (wants === "in_progress") and.push({ "voiceCall.status": { $in: ["started", "processing"] }, "voiceCall.conversationId": { $type: "string" } });
    else return null; // scheduled, dialing, no_answer, busy, cancelled never existed on older calls
  }
  return { $and: and };
}

async function mirroredChatIds(): Promise<string[]> {
  return (await callsCollection()).distinct("chatId", { chatId: { $type: "string" } }) as Promise<string[]>;
}

/** What the viewer sees on the Calls page, newest first (soonest first on Upcoming). */
export async function listMergedCalls(viewer: AibotsViewer, filters: MergedFilters): Promise<MergedCallList> {
  const manages = can(viewer, "VOICE_CALL_MANAGE");
  const canCall = can(viewer, "VOICE_CALL");
  const oversight = manages || can(viewer, "VIEW_CHATS");
  const scopeUser = oversight && filters.scope === "all" ? null : viewer.userId;
  const page = Math.min(Math.max(1, filters.page), MAX_PAGE);
  const window = page * MERGED_PAGE_SIZE;
  const [engine, chats, mirrored, publicSettings] = await Promise.all([callsCollection(), chatsCollection(), mirroredChatIds(), getPublicCallSettings()]);

  const eq = engineQuery(filters, scopeUser);
  const lq = legacyQuery(filters, scopeUser, mirrored);
  const upcomingFirst = filters.tab === "upcoming";
  const ownScope = oversight && filters.scope === "all" ? {} : { "initiatedBy.userId": viewer.userId };

  const [engineRows, engineTotal, legacyRows, legacyTotal, upcoming, attention, agents] = await Promise.all([
    engine.find(eq, { projection: { transcript: 0 } }).sort(upcomingFirst ? { scheduledFor: 1, _id: 1 } : { createdAt: -1, _id: -1 }).limit(window).toArray(),
    engine.countDocuments(eq),
    lq ? chats.find(lq, { projection: { "voiceCall.transcript": { $slice: 1 } } }).sort({ createdAt: -1, _id: -1 }).limit(window).toArray() : Promise.resolve([]),
    lq ? chats.countDocuments(lq) : Promise.resolve(0),
    engine.countDocuments({ ...ownScope, status: "scheduled" }),
    engine.countDocuments({ ...ownScope, direction: "outbound", status: { $in: [...ATTENTION_STATUSES] } }),
    oversight ? listAllBots().then((b) => b.filter((x) => x.kind === "voice")) : listUsableBots(viewer).then((b) => b.filter((x) => x.kind === "voice")),
  ]);

  const botIds = [...new Set([...engineRows.map((r) => r.agentId), ...legacyRows.map((r) => r.botId)])];
  const botRows = botIds.length ? await (await botsCollection()).find({ _id: { $in: botIds } }).toArray() : [];
  const bots = new Map(botRows.map((b) => [b._id, toSummary(b)]));

  const rows: MergedCallRow[] = [];
  for (const c of engineRows) {
    const v = toView(c, viewer);
    // A browser call's mirror row opens the same detail page (recording and transcript) the old Call History used.
    const href = c.chatId ? `/agentos/calls/${c.chatId}` : `/agentos/calls/${c._id}`;
    rows.push({
      id: c._id, source: "engine", href, at: (upcomingFirst && c.scheduledFor ? c.scheduledFor : c.createdAt).toISOString(), direction: c.direction, status: c.status, statusNote: null, testMode: c.testMode === true,
      agentId: c.agentId, agent: bots.get(c.agentId) ?? null, purpose: c.direction === "web" ? null : c.purpose, target: c.target,
      // Inbound callers are masked in the list when the company asks for it; the detail page shows the full number to people who manage calls.
      phone: c.direction === "inbound" ? listedPhone(c, publicSettings.maskInboundNumbers) : c.phone ? v.phone : null,
      caller: callerName({ direction: c.direction, phone: c.phone, target: c.target, visitorName: c.context?.visitor_name }, publicSettings.maskInboundNumbers),
      origin: c.direction === "web_public" ? (c.publicMeta?.origin ?? null) : null,
      initiatedBy: c.initiatedBy?.email ?? (c.direction === "web_public" ? "Website visitor" : "Inbound caller"), mine: v.mine, durationSecs: c.durationSecs,
      summary: c.summaryTitle || c.summary || null, scheduledFor: c.scheduledFor?.toISOString() ?? null, failureMessage: c.failure?.message ?? null,
      actions: callActions({ status: c.status, direction: c.direction, mine: v.mine }, { canCall, isManager: manages }),
    });
  }
  for (const c of legacyRows) {
    const v = c.voiceCall!;
    const connected = Boolean(v.conversationId);
    const status: CallStatus = !connected || v.status === "failed" ? "failed" : v.status === "done" ? "completed" : "in_progress";
    rows.push({
      id: c._id, source: "legacy", href: `/agentos/calls/${c._id}`, at: c.createdAt.toISOString(), direction: "web", status,
      statusNote: !connected ? "Never connected" : null, caller: null, origin: null, agentId: c.botId, agent: bots.get(c.botId) ?? null, purpose: null, target: null, phone: null,
      initiatedBy: c.userEmail, mine: c.userId === viewer.userId, durationSecs: v.durationSecs, summary: v.summaryTitle || v.summary || null, scheduledFor: null,
      failureMessage: null, actions: { cancel: false, reschedule: false, retry: false },
    });
  }
  rows.sort((a, b) => (upcomingFirst ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at)) || a.id.localeCompare(b.id));
  const total = engineTotal + legacyTotal;
  return {
    items: rows.slice((page - 1) * MERGED_PAGE_SIZE, page * MERGED_PAGE_SIZE),
    total, page, totalPages: Math.min(pageCount(total, MERGED_PAGE_SIZE), MAX_PAGE), oversight,
    agents: agents.map((b) => ({ value: b._id, label: b.name })),
    counts: { upcoming, attention },
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface CallDetailData {
  call: ReturnType<typeof toView>;
  agent: BotSummary | null;
  /** The agent's own field labels, to name the collected values. */
  dataFields: { key: string; label: string }[];
  context: Record<string, string>;
  timeZone: string | null;
  compliance: CallDoc["compliance"];
  controlHistory: { at: string; from: "ai" | "human"; to: "ai" | "human"; by: string }[];
  chatId: string | null;
  /** The recording: whether there is one, where to play it, and what to tell the person about it. */
  recording: RecordingInfo & { url: string | null };
  /** Website calls: the page the visitor was on. */
  origin: string | null;
  /** Who was on the other end of an inbound or website call, as a name or a masked number. */
  caller: string | null;
}

/** One engine call with everything the detail page shows. Throws NotFoundError when the viewer may not see it. Logs a manager's view of someone else's call. */
export async function loadCallDetail(viewer: AibotsViewer, callId: string): Promise<CallDetailData> {
  const call = await getCall(viewer, callId);
  const doc = await loadCallForViewer(viewer, callId, true);
  const [botRow, tz, staff] = await Promise.all([
    botsCollection().then((c) => c.findOne({ _id: doc.agentId })),
    companyTimeZone().catch(() => null),
    listAibotsStaff().catch(() => [] as { value: string; label: string }[]),
  ]);
  const names = new Map(staff.map((s) => [s.value, s.label]));
  const publicSettings = await getPublicCallSettings();
  const conference = (doc.control?.history?.length ?? 0) > 0 || Boolean(await getConference(doc._id).catch(() => null));
  const rec = recordingInfo({ status: doc.status, conversationId: doc.conversationId, hasAudio: doc.hasAudio, conference });
  return {
    recording: { ...rec, url: rec.available ? `/api/agentos/calls/${doc._id}/audio` : null },
    origin: doc.direction === "web_public" ? (doc.publicMeta?.origin ?? null) : null,
    caller: callerName({ direction: doc.direction, phone: doc.phone, target: doc.target, visitorName: doc.context?.visitor_name }, publicSettings.maskInboundNumbers),
    call,
    agent: botRow ? toSummary(botRow) : null,
    dataFields: (botRow?.voice?.dataFields ?? []).map((f) => ({ key: f.key, label: f.label })),
    context: doc.context ?? {},
    timeZone: tz,
    compliance: doc.compliance,
    controlHistory: (doc.control?.history ?? []).map((h) => ({ at: h.at.toISOString(), from: h.from, to: h.to, by: names.get(h.by) ?? (h.by === viewer.userId ? "You" : "A team member") })),
    chatId: doc.chatId,
  };
}
