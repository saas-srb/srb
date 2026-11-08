import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { lmsCan } from "@/lib/lms-roles";
import { getLead, isValidCategory } from "@/lib/leads";
import { getBot, toSummary } from "@/lib/products/agentos/bots";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import { loadCallDetail } from "@/lib/products/agentos/calls/merged";
import { speakerName } from "@/lib/products/agentos/calls/call-display";
import { labelCollected } from "@/lib/products/agentos/calls/call-ui";
import { maskPhone, normalizeE164 } from "@/lib/products/agentos/calls/phone";
import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";
import { targetHref } from "@/lib/products/agentos/calls/target-links";
import { reconcileStaleCalls } from "@/lib/products/agentos/calls/stale";
import type { CallDoc, CallStatus } from "@/lib/products/agentos/calls/types";
import { can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { applicantCallSpec, DEALFLOW_PRODUCT, leadCallSpec, parseSubmissionEntityId, submissionCallSpec, type DealflowCallSpec } from "@/lib/dealflow-ai/call-targets";
import { CALL_RESULTS_COLLECTION, type CallResultDoc } from "@/lib/dealflow-ai/call-results";
import {
  CALLS_PAGE_SIZE, LIVE_STATUSES, PEOPLE_PAGE_SIZE,
  type PanelAccess, type PanelActiveCall, type PanelCall, type PanelCallDetail, type PanelCallsPage, type PanelCategory, type PanelEntityType, type PanelFilter,
  type PanelPeoplePage, type PanelPerson, type PanelPersonView,
} from "@/lib/dealflow-ai/call-panel-types";

/**
 * DealFlow's read side of AI calls, for the "AI Voice Calls" page: who has been (or can be) called, each call as its own card, the
 * calls running right now and the detail of one call.
 *
 * Rules:
 *   - The page is for VIEW_LEADS; applicants (career applications) additionally need VIEW_CAREERS, the same rule that lets a person
 *     point a call at one (authorizeDealflowTarget).
 *   - A list shows only metadata (who, when, status, agent, count) and the masked number. A call's summary, answers, transcript and
 *     recording come from AgentOS's own rules: the person who placed the call, or someone with call oversight (VOICE_CALL_MANAGE /
 *     VIEW_CHATS). Anyone else (including people with no AgentOS account) sees what DealFlow stored when the call ended
 *     (dealflow_call_results) and is told so.
 *   - Calls are never merged: one engine call = one card.
 *   - The calls collection is the company's own (tenant scoped by the data layer).
 */

export interface PanelViewerCtx {
  lms: Parameters<typeof lmsCan>[0];
  /** The AgentOS identity of the same person, or null when they have no AgentOS account. */
  agentos: AibotsViewer | null;
}

const LEADS = "lead_records";
const APPLICATIONS = "career_applications";
const LIVE = [...LIVE_STATUSES] as CallStatus[];
const MAX_GROUPS = 5000;

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const digits = (s: string) => s.replace(/\D/g, "");

/** A number as DealFlow shows it: first 3 and last 4 characters only. Never the full number. */
export function maskNumber(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const e164 = normalizeE164(raw);
  if (e164) return maskPhone(e164);
  const d = digits(raw);
  return d.length >= 7 ? `${"•".repeat(Math.max(d.length - 4, 2))}${d.slice(-4)}` : "";
}

const hasPhone = (raw: unknown) => typeof raw === "string" && digits(raw).length >= 7;

function categoryOfLeadType(type: unknown): PanelCategory {
  return type === "job_applicant" ? "jobs" : type === "intern" ? "interns" : type === "trainee" ? "trainees" : "clients";
}

/** Whether this viewer may point at / see calls about this kind of record. */
export function canSeeEntityType(ctx: PanelViewerCtx, entityType: string): boolean {
  if (!lmsCan(ctx.lms, "VIEW_LEADS")) return false;
  if (entityType === "applicant") return lmsCan(ctx.lms, "VIEW_CAREERS");
  return entityType === "lead" || entityType === "submission";
}

/** AgentOS's own rule for opening someone's call: they placed it, or they oversee calls. */
export function canOpenCall(v: AibotsViewer | null, call: Pick<CallDoc, "initiatedBy">): boolean {
  if (!v) return false;
  return call.initiatedBy?.userId === v.userId || can(v, "VOICE_CALL_MANAGE") || can(v, "VIEW_CHATS");
}
const overseesLive = (v: AibotsViewer) => can(v, "VOICE_CALL_TAKEOVER") || can(v, "VOICE_CALL_MANAGE");

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface Group { entityType: PanelEntityType; entityId: string; label: string; count: number; lastAt: Date; lastStatus: CallStatus; activeCallId: string | null }

async function callGroups(entityTypes: PanelEntityType[]): Promise<Group[]> {
  const col = await callsCollection();
  const rows = await col
    .aggregate<{ _id: { t: PanelEntityType; i: string }; label: string; count: number; lastAt: Date; lastStatus: CallStatus; activeCallId: string | null }>([
      { $match: { "target.product": DEALFLOW_PRODUCT, "target.entityType": { $in: entityTypes } } },
      { $sort: { createdAt: -1 } },
      { $group: {
        _id: { t: "$target.entityType", i: "$target.entityId" }, label: { $first: "$target.label" }, count: { $sum: 1 }, lastAt: { $first: "$createdAt" }, lastStatus: { $first: "$status" },
        activeCallId: { $max: { $cond: [{ $in: ["$status", LIVE] }, "$_id", null] } },
      } },
      { $sort: { lastAt: -1 } },
      { $limit: MAX_GROUPS },
    ])
    .toArray();
  return rows.map((r) => ({ entityType: r._id.t, entityId: r._id.i, label: r.label ?? "", count: r.count, lastAt: r.lastAt, lastStatus: r.lastStatus, activeCallId: r.activeCallId ?? null }));
}

interface Named { name: string; phone: string; email: string; code: string; category: PanelCategory }

async function namesFor(groups: Group[]): Promise<Map<string, Named>> {
  const db = await getDb();
  const out = new Map<string, Named>();
  const leadIds = groups.filter((g) => g.entityType === "lead").map((g) => g.entityId);
  const appIds = groups.filter((g) => g.entityType === "applicant").map((g) => g.entityId);
  const [leads, apps] = await Promise.all([
    leadIds.length ? db.collection(LEADS).find({ _id: { $in: leadIds } } as never, { projection: { name: 1, phone: 1, email: 1, code: 1, type: 1 } }).toArray() : Promise.resolve([]),
    appIds.length ? db.collection(APPLICATIONS).find({ _id: { $in: appIds.flatMap((id) => (/^[a-f\d]{24}$/i.test(id) ? [id, new ObjectId(id)] : [id])) } } as never, { projection: { name: 1, phone: 1, email: 1 } }).toArray() : Promise.resolve([]),
  ]);
  for (const l of leads) out.set(`lead:${String(l._id)}`, { name: String(l.name ?? ""), phone: String(l.phone ?? ""), email: String(l.email ?? ""), code: String(l.code ?? ""), category: categoryOfLeadType(l.type) });
  for (const a of apps) out.set(`applicant:${String(a._id)}`, { name: String(a.name ?? ""), phone: String(a.phone ?? ""), email: String(a.email ?? ""), code: "", category: "jobs" });
  return out;
}

export interface PeopleQuery { q?: string; filter?: PanelFilter; page?: number }

/**
 * The left list: people with AI calls first (latest call first), then, for the "All" and category filters, leads that can be called
 * but never were. 30 per page. Applicant and enquiry (submission) records appear once they have a call.
 */
export async function listCallPeople(ctx: PanelViewerCtx, query: PeopleQuery = {}): Promise<PanelPeoplePage> {
  const empty: PanelPeoplePage = { people: [], total: 0, page: 1, pageSize: PEOPLE_PAGE_SIZE };
  if (!lmsCan(ctx.lms, "VIEW_LEADS")) return empty;
  const filter: PanelFilter = query.filter ?? "all";
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const q = (query.q ?? "").trim().slice(0, 80).toLowerCase();
  const qDigits = digits(q);
  const types = (["lead", "applicant", "submission"] as PanelEntityType[]).filter((t) => canSeeEntityType(ctx, t));

  const groups = await callGroups(types);
  const named = await namesFor(groups);
  const matches = groups.filter((g) => {
    const n = named.get(`${g.entityType}:${g.entityId}`);
    const category: PanelCategory = n?.category ?? (g.entityType === "applicant" ? "jobs" : "clients");
    if (filter === "active" && !g.activeCallId) return false;
    if (filter !== "all" && filter !== "active" && category !== filter) return false;
    if (!q) return true;
    const hay = [n?.name ?? g.label, g.label, n?.email ?? "", n?.code ?? ""].join(" ").toLowerCase();
    return hay.includes(q) || (qDigits.length >= 3 && digits(n?.phone ?? "").includes(qDigits));
  });

  // Callable leads with no call yet fill the rest (never under "Active now").
  const withCalls = new Set(groups.filter((g) => g.entityType === "lead").map((g) => g.entityId));
  const includeIdle = filter !== "active" && types.includes("lead");
  const idleQuery: Record<string, unknown> = { deletedAt: null, phone: { $regex: "(\\D*\\d){7}" }, _id: { $nin: [...withCalls] } };
  if (filter !== "all" && filter !== "active") idleQuery.type = filter === "jobs" ? "job_applicant" : filter === "interns" ? "intern" : filter === "trainees" ? "trainee" : "client";
  if (q) {
    const rx = new RegExp(escapeRx(q), "i");
    idleQuery.$or = [{ name: rx }, { email: rx }, { code: rx }, ...(qDigits.length >= 3 ? [{ phone: new RegExp(qDigits.split("").join("\\D*")) }] : [])];
  }
  const db = await getDb();
  const idleCol = db.collection(LEADS);
  const idleTotal = includeIdle ? await idleCol.countDocuments(idleQuery as never) : 0;

  const offset = (page - 1) * PEOPLE_PAGE_SIZE;
  const slice = matches.slice(offset, offset + PEOPLE_PAGE_SIZE);
  const people: PanelPerson[] = slice.map((g) => {
    const n = named.get(`${g.entityType}:${g.entityId}`);
    return {
      key: `${g.entityType}:${g.entityId}`, entityType: g.entityType, entityId: g.entityId, name: n?.name || g.label || "Unknown",
      category: n?.category ?? (g.entityType === "applicant" ? "jobs" : "clients"), phoneMasked: maskNumber(n?.phone),
      callCount: g.count, lastCallAt: g.lastAt.toISOString(), lastStatus: g.lastStatus, activeCallId: g.activeCallId,
    };
  });
  const room = PEOPLE_PAGE_SIZE - people.length;
  if (includeIdle && room > 0) {
    const skip = Math.max(0, offset - matches.length);
    const idle = await idleCol.find(idleQuery as never, { projection: { name: 1, phone: 1, type: 1 } }).sort({ name: 1, _id: 1 }).skip(skip).limit(room).toArray();
    for (const l of idle) {
      people.push({ key: `lead:${String(l._id)}`, entityType: "lead", entityId: String(l._id), name: String(l.name ?? "Unknown"), category: categoryOfLeadType(l.type), phoneMasked: maskNumber(l.phone), callCount: 0, lastCallAt: null, lastStatus: null, activeCallId: null });
    }
  }
  return { people, total: matches.length + idleTotal, page, pageSize: PEOPLE_PAGE_SIZE };
}

/** The selected person: header facts and what the "Call with AI" button needs (masked in the list, but the button needs the number as stored). */
export async function loadCallPerson(ctx: PanelViewerCtx, entityType: string, entityId: string): Promise<PanelPersonView | null> {
  if (!canSeeEntityType(ctx, entityType) || typeof entityId !== "string" || !entityId || entityId.length > 80) return null;
  const db = await getDb();
  let spec: DealflowCallSpec | null = null;
  let name = "";
  let phone = "";
  let category: PanelCategory = "clients";
  if (entityType === "lead") {
    const l = await db.collection(LEADS).findOne({ _id: entityId, deletedAt: null } as never);
    if (!l) return null;
    spec = leadCallSpec({ _id: String(l._id), name: String(l.name ?? ""), phone: String(l.phone ?? ""), type: l.type, source: l.source, status: l.status, subService: l.subService ?? null, message: l.message ?? null, clientId: l.clientId ?? null, doNotContact: l.doNotContact === true });
    name = String(l.name ?? ""); phone = String(l.phone ?? ""); category = categoryOfLeadType(l.type);
  } else if (entityType === "applicant") {
    const ids: unknown[] = [entityId];
    if (/^[a-f\d]{24}$/i.test(entityId)) ids.push(new ObjectId(entityId));
    const a = await db.collection(APPLICATIONS).findOne({ _id: { $in: ids } } as never);
    if (!a) return null;
    spec = applicantCallSpec({ _id: String(a._id), name: String(a.name ?? ""), phone: String(a.phone ?? ""), positionTitle: a.positionTitle ?? null });
    name = String(a.name ?? ""); phone = String(a.phone ?? ""); category = "jobs";
  } else {
    const p = parseSubmissionEntityId(entityId);
    if (!p || !isValidCategory(p.category)) return null;
    const s = await getLead(p.category, p.id);
    if (!s) return null;
    spec = submissionCallSpec({ id: p.id, category: p.category, name: String(s.name ?? ""), phone: String(s.phone ?? ""), subService: s.subService ?? null, message: s.message ?? null, categoryLabel: p.category });
    name = String(s.name ?? ""); phone = String(s.phone ?? "");
  }
  return { key: `${entityType}:${entityId}`, entityType: entityType as PanelEntityType, entityId, name: name || "Unknown", category, phoneMasked: hasPhone(phone) ? maskNumber(phone) : "", recordHref: targetHref({ product: DEALFLOW_PRODUCT, entityType, entityId }), callSpec: spec };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

async function agentCard(cache: Map<string, Promise<PanelCall["agent"]>>, agentId: string, withPhoto: boolean): Promise<PanelCall["agent"]> {
  let p = cache.get(agentId);
  if (!p) {
    p = getBot(agentId).then(
      (b) => (b ? { id: b._id, name: b.name, icon: String(b.icon), color: String(b.color), avatarUrl: withPhoto ? toSummary(b).avatarUrl : null } : { id: agentId, name: "Deleted agent", icon: "Bot", color: "slate", avatarUrl: null }),
      () => ({ id: agentId, name: "Voice agent", icon: "Bot", color: "slate", avatarUrl: null }),
    );
    cache.set(agentId, p);
  }
  return p;
}

async function dataFieldLabels(agentId: string): Promise<{ key: string; label: string }[]> {
  const b = await getBot(agentId).catch(() => null);
  return (b?.voice?.dataFields ?? []).map((f) => ({ key: f.key, label: f.label }));
}

/** One engine call as a card, honouring what this viewer may see of it. `stored` is DealFlow's copy of the result (terminal calls). */
export async function toPanelCall(ctx: PanelViewerCtx, c: CallDoc, stored: CallResultDoc | undefined, agents: Map<string, Promise<PanelCall["agent"]>>): Promise<PanelCall> {
  const open = canOpenCall(ctx.agentos, c);
  const access: PanelAccess = open ? "full" : ctx.agentos ? "not_visible" : "no_account";
  const agent = await agentCard(agents, c.agentId, ctx.agentos !== null);
  const collected = open ? labelCollected(c.collected ?? [], await dataFieldLabels(c.agentId)) : (stored?.collected ?? []);
  return {
    id: c._id, access, status: c.status, direction: c.direction, testMode: c.testMode === true,
    at: (c.status === "scheduled" && c.scheduledFor ? c.scheduledFor : (c.dialedAt ?? c.createdAt)).toISOString(), scheduledFor: c.scheduledFor?.toISOString() ?? null,
    agent, purpose: c.purpose, purposeLabel: PURPOSE_BY_KEY.get(c.purpose)?.label ?? c.purpose, durationSecs: c.durationSecs ?? stored?.durationSecs ?? null,
    outcome: open ? c.outcome : (stored?.outcome ?? null), summary: open ? c.summary : (stored?.summary ?? null), collected,
    phoneMasked: c.phone ? maskPhone(c.phone) : c.phoneLast4 ? `••••${c.phoneLast4}` : null, live: LIVE.includes(c.status),
    calledBy: open ? (c.initiatedBy?.email ?? null) : null, agentosHref: `/agentos/calls/${c._id}`,
  };
}

/** The person's calls, newest first, 20 per page. Each engine call is its own card; none are merged. */
export async function listPersonCalls(ctx: PanelViewerCtx, entityType: string, entityId: string, page = 1): Promise<PanelCallsPage> {
  const pg = Math.max(1, Math.floor(page));
  if (!canSeeEntityType(ctx, entityType) || typeof entityId !== "string" || !entityId || entityId.length > 80) return { calls: [], total: 0, page: pg, pageSize: CALLS_PAGE_SIZE };
  const col = await callsCollection();
  const q = { "target.product": DEALFLOW_PRODUCT, "target.entityType": entityType, "target.entityId": entityId };
  const [rows, total] = await Promise.all([
    col.find(q, { projection: { transcript: 0 } }).sort({ createdAt: -1, _id: -1 }).skip((pg - 1) * CALLS_PAGE_SIZE).limit(CALLS_PAGE_SIZE).toArray(),
    col.countDocuments(q),
  ]);
  const stored = rows.length ? await (await getDb()).collection<CallResultDoc>(CALL_RESULTS_COLLECTION).find({ _id: { $in: rows.map((r) => r._id) } }).toArray() : [];
  const byId = new Map(stored.map((s) => [s._id, s]));
  const agents = new Map<string, Promise<PanelCall["agent"]>>();
  const calls = await Promise.all(rows.map((r) => toPanelCall(ctx, r, byId.get(r._id), agents)));
  return { calls, total, page: pg, pageSize: CALLS_PAGE_SIZE };
}

/** The full detail of one call. Transcript, recording, control history only when AgentOS lets this person open the call. */
export async function loadPanelCallDetail(ctx: PanelViewerCtx, callId: string): Promise<PanelCallDetail | null> {
  if (typeof callId !== "string" || !callId || callId.length > 64) return null;
  const doc = await (await callsCollection()).findOne({ _id: callId }, { projection: { transcript: 0 } });
  if (!doc || doc.target?.product !== DEALFLOW_PRODUCT || !canSeeEntityType(ctx, doc.target.entityType)) return null;
  const stored = await (await getDb()).collection<CallResultDoc>(CALL_RESULTS_COLLECTION).findOne({ _id: callId });
  const call = await toPanelCall(ctx, doc, stored ?? undefined, new Map());
  const base = { call, access: call.access, summaryTitle: null, failure: null, terminationReason: null, endedAt: doc.endedAt?.toISOString() ?? null };

  if (call.access === "no_account") {
    return { ...base, accessNote: "You don't have an AgentOS account, so the transcript and recording aren't available here. Below is the result DealFlow stored when the call ended. Ask an admin for AgentOS access to listen to calls.", transcript: null, recording: { url: null, note: null }, controlHistory: [] };
  }
  if (call.access === "not_visible") {
    return { ...base, accessNote: "This call was placed by another team member. The transcript and recording are visible only to the person who placed the call and to AgentOS call managers. Below is the result DealFlow stored when the call ended.", transcript: null, recording: { url: null, note: null }, controlHistory: [] };
  }
  const data = await loadCallDetail(ctx.agentos!, callId);
  const agentName = data.agent?.name ?? "Agent";
  const kindOf = (l: { role: "agent" | "user"; speaker?: "lead" | "ai" | "human" }): "lead" | "ai" | "human" => l.speaker ?? (l.role === "agent" ? "ai" : "lead");
  const transcript = (data.call.transcript ?? []).map((l) => {
    const kind = kindOf(l);
    // The other end of a DealFlow call is the lead (outbound) or the caller (inbound); the AI and a team member keep AgentOS's names.
    return { speaker: kind === "lead" ? (data.call.direction === "inbound" ? "Caller" : "Lead") : speakerName(l, data.call, agentName), kind, atSecs: l.atSecs, text: l.text };
  });
  const live = LIVE.includes(data.call.status);
  return {
    ...base,
    call: { ...call, summary: data.call.summary, outcome: data.call.outcome, collected: labelCollected(data.call.collected, data.dataFields) },
    accessNote: null,
    transcript: transcript.length ? transcript : null,
    recording: { url: data.recording.url, note: data.recording.note },
    controlHistory: data.controlHistory,
    failure: data.call.failure?.message ?? null, terminationReason: data.call.terminationReason, summaryTitle: data.call.summaryTitle,
    endedAt: data.call.endedAt ?? (live ? null : base.endedAt),
  };
}

// ---------------------------------------------------------------------------
// Active calls
// ---------------------------------------------------------------------------

let lastReconcile = 0;
const RECONCILE_EVERY_MS = 30_000;

/** Calls ringing or in progress right now about DealFlow records. Stuck ones are checked with the provider (at most every 30 s). */
export async function listActiveDealflowCalls(ctx: PanelViewerCtx): Promise<PanelActiveCall[]> {
  if (!lmsCan(ctx.lms, "VIEW_LEADS")) return [];
  if (ctx.agentos && Date.now() - lastReconcile > RECONCILE_EVERY_MS) {
    lastReconcile = Date.now();
    await reconcileStaleCalls(overseesLive(ctx.agentos) ? {} : { initiatorId: ctx.agentos.userId }).catch(() => 0);
  }
  const rows = await (await callsCollection())
    .find({ "target.product": DEALFLOW_PRODUCT, status: { $in: LIVE } }, { projection: { transcript: 0 } })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  const agents = new Map<string, Promise<PanelCall["agent"]>>();
  const out: PanelActiveCall[] = [];
  for (const c of rows) {
    if (!c.target || !canSeeEntityType(ctx, c.target.entityType)) continue;
    const v = ctx.agentos;
    const mine = Boolean(v && c.initiatedBy?.userId === v.userId);
    const allowed = Boolean(v && (mine || overseesLive(v)));
    out.push({
      id: c._id, entityType: c.target.entityType, entityId: c.target.entityId, personName: c.target.label || "Contact", agentName: (await agentCard(agents, c.agentId, false)).name,
      purposeLabel: PURPOSE_BY_KEY.get(c.purpose)?.label ?? c.purpose, status: c.status, startedAt: (c.dialedAt ?? c.createdAt).toISOString(), testMode: c.testMode === true,
      canLive: allowed && c.status === "in_progress", canEnd: allowed,
    });
  }
  return out;
}

/** True when this call is a DealFlow call this person may act on from the page (used before ending a call). */
export async function isVisibleDealflowCall(ctx: PanelViewerCtx, callId: string): Promise<boolean> {
  if (typeof callId !== "string" || !callId || callId.length > 64) return false;
  const doc = await (await callsCollection()).findOne({ _id: callId }, { projection: { target: 1 } });
  return Boolean(doc?.target && doc.target.product === DEALFLOW_PRODUCT && canSeeEntityType(ctx, doc.target.entityType));
}

export async function countActiveDealflowCalls(ctx: PanelViewerCtx): Promise<number> {
  if (!lmsCan(ctx.lms, "VIEW_LEADS")) return 0;
  const types = (["lead", "applicant", "submission"] as const).filter((t) => canSeeEntityType(ctx, t));
  return (await callsCollection()).countDocuments({ "target.product": DEALFLOW_PRODUCT, "target.entityType": { $in: types }, status: { $in: LIVE } });
}

