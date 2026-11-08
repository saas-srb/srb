import { hasPlanFlag } from "@/lib/platform/billing/enforce";
import { mongoTimeZone } from "@/lib/timezone";
import "server-only";
import { companyScope, messagesCol, nextRequestNumber, requestsCol, type MessageDoc, type RequestDoc } from "@/lib/support/db";
import { firstStatusIn, getSupportConfig, initialStatus, stateOf } from "@/lib/support/config";
import { validateAttachments } from "@/lib/support/attachments";
import type { AiAnalysis, Attachment, ChatTurn, RequestContext, StatusState, SupportConfig } from "@/lib/support/types";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const PAGE_SIZE = 25;

export type RequestView = Omit<RequestDoc, "createdAt" | "updatedAt" | "resolvedAt" | "history"> & {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  history: { at: string; by: string; action: string; from?: string | null; to?: string | null }[];
};
export type MessageView = Omit<MessageDoc, "createdAt"> & { createdAt: string };

const viewRequest = (r: RequestDoc): RequestView => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  history: r.history.map((h) => ({ ...h, at: h.at.toISOString() })),
});
const viewMessage = (m: MessageDoc): MessageView => ({ ...m, createdAt: m.createdAt.toISOString() });

/** A company-facing caller: who is asking and for which company. The company is always taken from the host, never from input. */
export interface CompanyCaller {
  companyId: string;
  companyName: string;
  user: { id: string; email: string };
}

export interface NewRequestInput {
  type: string;
  title: string;
  description: string;
  category?: string | null;
  priority?: string | null;
  severity?: string | null;
  fields?: Record<string, unknown>;
  context?: Partial<RequestContext> | null;
  source?: "form" | "chat";
  chat?: ChatTurn[];
  attachments?: Attachment[];
}

function sanitizeContext(c: Partial<RequestContext> | null | undefined): RequestContext | null {
  if (!c) return null;
  const s = (v: unknown, n = 200) => clean(v, n) || null;
  return {
    panel: s(c.panel, 60),
    page: s(c.page),
    route: s(c.route, 300),
    feature: s(c.feature),
    browser: s(c.browser, 60),
    browserVersion: s(c.browserVersion, 40),
    os: s(c.os, 60),
    device: s(c.device, 60),
    userAgent: s(c.userAgent, 400),
    viewport: s(c.viewport, 30),
    timestamp: s(c.timestamp, 40) ?? new Date().toISOString(),
    errorInfo: s(c.errorInfo, 2000),
  };
}

export async function createRequest(caller: CompanyCaller, input: NewRequestInput): Promise<{ ok: true; id: string; number: number } | { ok: false; error: string }> {
  const cfg = await getSupportConfig();
  const type = cfg.types.find((t) => t.key === input.type && t.active);
  if (!type) return { ok: false, error: "Choose a request type." };
  const title = clean(input.title, 160);
  const description = clean(input.description, 8000);
  if (!title) return { ok: false, error: "Add a short title." };
  if (!description) return { ok: false, error: "Describe your request." };

  const fields: Record<string, string> = {};
  for (const f of type.fields) {
    const value = clean(input.fields?.[f.key], f.type === "textarea" ? 4000 : 500);
    if (f.required && !value) return { ok: false, error: `“${f.label}” is required.` };
    if (value && f.type === "select" && f.options?.length && !f.options.includes(value)) return { ok: false, error: `Choose a valid option for “${f.label}”.` };
    if (value) fields[f.key] = value;
  }

  const pick = (list: { key: string; active: boolean }[], key: unknown) => (list.find((o) => o.key === key && o.active) ? String(key) : null);
  const priority = pick(cfg.priorities, input.priority) ?? cfg.priorities.find((p) => p.active)!.key;
  // Plans with priority support are looked at first: the flag is stamped on the request for the support team.
  const prioritySupport = await hasPlanFlag("prioritySupport").catch(() => false);
  const now = new Date();
  const number = await nextRequestNumber();
  const id = crypto.randomUUID();
  const chat = (Array.isArray(input.chat) ? input.chat : [])
    .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
    .slice(-20)
    .map((t) => ({ role: t.role, text: clean(t.text, 2000) }));

  const doc: RequestDoc = {
    _id: id,
    number,
    ...companyScope(caller.companyId),
    companyName: clean(caller.companyName, 120),
    createdBy: caller.user,
    type: type.key,
    title,
    description,
    category: pick(cfg.categories, input.category),
    priority,
    prioritySupport,
    severity: type.kind === "bug" ? pick(cfg.severities, input.severity) : null,
    status: initialStatus(cfg),
    team: null,
    assignee: null,
    fields,
    context: sanitizeContext(input.context),
    source: input.source === "chat" ? "chat" : "form",
    chat,
    attachments: validateAttachments(caller, input.attachments),
    ai: null,
    history: [{ at: now, by: caller.user.email, action: "created", to: initialStatus(cfg) }],
    lastActor: "company",
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
  await (await requestsCol()).insertOne(doc);
  return { ok: true, id, number };
}

// ── Company-facing reads (always pinned to the caller's company) ─────────────────────────────────────────────────
export async function listForCompany(companyId: string, opts: { state?: StatusState | "all"; q?: string } = {}): Promise<RequestView[]> {
  const cfg = await getSupportConfig();
  const filter: Record<string, unknown> = { ...companyScope(companyId) };
  if (opts.state && opts.state !== "all") filter.status = { $in: cfg.statuses.filter((s) => s.state === opts.state).map((s) => s.key) };
  const q = clean(opts.q, 80);
  if (q) filter.$or = [{ title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, ...(Number(q) ? [{ number: Number(q) }] : [])];
  return (await (await requestsCol()).find(filter).sort({ updatedAt: -1 }).limit(200).toArray()).map(viewRequest);
}

export async function getForCompany(companyId: string, id: string): Promise<{ request: RequestView; messages: MessageView[] } | null> {
  const request = await (await requestsCol()).findOne({ _id: clean(id, 60), ...companyScope(companyId) });
  if (!request) return null;
  const messages = await (await messagesCol()).find({ requestId: request._id, ...companyScope(companyId), visibility: "public" }).sort({ createdAt: 1 }).limit(500).toArray();
  return { request: viewRequest(request), messages: messages.map(viewMessage) };
}

export async function countForCompany(companyId: string): Promise<{ open: number; waiting: number; total: number }> {
  const cfg = await getSupportConfig();
  const col = await requestsCol();
  const scope = companyScope(companyId);
  const keys = (state: StatusState) => cfg.statuses.filter((s) => s.state === state).map((s) => s.key);
  const [open, waiting, total] = await Promise.all([col.countDocuments({ ...scope, status: { $in: keys("open") } }), col.countDocuments({ ...scope, status: { $in: keys("waiting") } }), col.countDocuments(scope)]);
  return { open, waiting, total };
}

export async function companyReply(caller: CompanyCaller, id: string, body: string, attachments: unknown = []): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = clean(body, 5000);
  const files = validateAttachments(caller, attachments);
  if (!text && files.length === 0) return { ok: false, error: "Write a message or attach a file first." };
  const cfg = await getSupportConfig();
  const col = await requestsCol();
  const req = await col.findOne({ _id: clean(id, 60), ...companyScope(caller.companyId) });
  if (!req) return { ok: false, error: "Request not found." };
  const state = stateOf(cfg, req.status);
  if (state === "closed") return { ok: false, error: "This request is closed. Please create a new request." };
  const now = new Date();
  // A reply from the company puts a "waiting for user" or "resolved" request back in front of the team.
  const reopen = state === "waiting" || state === "resolved";
  const next = reopen ? firstStatusIn(cfg, "open") : req.status;
  await (await messagesCol()).insertOne({ _id: crypto.randomUUID(), requestId: req._id, ...companyScope(caller.companyId), authorType: "company", visibility: "public", authorId: caller.user.id, authorLabel: caller.user.email, body: text, attachments: files, createdAt: now });
  await col.updateOne(
    { _id: req._id, ...companyScope(caller.companyId) },
    { $set: { status: next, lastActor: "company", updatedAt: now, resolvedAt: reopen ? null : req.resolvedAt }, ...(reopen ? { $push: { history: { at: now, by: caller.user.email, action: state === "resolved" ? "reopened" : "replied", from: req.status, to: next } } } : {}) },
  );
  return { ok: true };
}

// ── Staff (SelfRun AI) ────────────────────────────────────────────────────────────────────────────────────────────
export interface StaffFilters {
  q?: string;
  state?: StatusState | "all";
  status?: string;
  type?: string;
  priority?: string;
  companyId?: string;
  assignee?: string; // user id, "me" resolved by caller, or "none"
  page?: number;
}

export async function listAllRequests(f: StaffFilters): Promise<{ rows: RequestView[]; total: number; page: number; totalPages: number }> {
  const cfg = await getSupportConfig();
  const filter: Record<string, unknown> = {};
  if (f.status) filter.status = clean(f.status, 40);
  else if (f.state && f.state !== "all") filter.status = { $in: cfg.statuses.filter((s) => s.state === f.state).map((s) => s.key) };
  if (f.type) filter.type = clean(f.type, 40);
  if (f.priority) filter.priority = clean(f.priority, 40);
  if (f.companyId) filter.companyId = clean(f.companyId, 60);
  if (f.assignee === "none") filter.assignee = null;
  else if (f.assignee) filter["assignee.id"] = clean(f.assignee, 60);
  const q = clean(f.q, 80);
  if (q) {
    const re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ title: re }, { companyName: re }, { "createdBy.email": re }, ...(Number(q) ? [{ number: Number(q) }] : [])];
  }
  const col = await requestsCol();
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const [total, rows] = await Promise.all([col.countDocuments(filter), col.find(filter).sort({ prioritySupport: -1, updatedAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray()]);
  return { rows: rows.map(viewRequest), total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getAnyRequest(id: string): Promise<{ request: RequestView; messages: MessageView[] } | null> {
  const request = await (await requestsCol()).findOne({ _id: clean(id, 60) });
  if (!request) return null;
  const messages = await (await messagesCol()).find({ requestId: request._id }).sort({ createdAt: 1 }).limit(500).toArray();
  return { request: viewRequest(request), messages: messages.map(viewMessage) };
}

export async function supportStats(): Promise<{ byState: Record<StatusState, number>; byType: { key: string; count: number }[]; byCompany: { companyId: string; name: string; count: number }[]; unassigned: number; total: number }> {
  const cfg = await getSupportConfig();
  const col = await requestsCol();
  const [byStatus, byType, byCompany, unassigned, total] = await Promise.all([
    col.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    col.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$type", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    col.aggregate<{ _id: string; name: string; n: number }>([{ $group: { _id: "$companyId", name: { $last: "$companyName" }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]).toArray(),
    col.countDocuments({ assignee: null, status: { $in: cfg.statuses.filter((s) => s.state === "open").map((s) => s.key) } }),
    col.countDocuments({}),
  ]);
  const byState = { open: 0, waiting: 0, resolved: 0, closed: 0 } as Record<StatusState, number>;
  for (const r of byStatus) byState[stateOf(cfg, r._id)] += r.n;
  return { byState, byType: byType.map((t) => ({ key: t._id, count: t.n })), byCompany: byCompany.map((c) => ({ companyId: c._id, name: c.name, count: c.n })), unassigned, total };
}

export interface StaffPatch {
  status?: string;
  priority?: string;
  severity?: string | null;
  category?: string | null;
  team?: string | null;
  assignee?: { id: string; email: string } | null;
}

/** Applies a validated change and records each changed field in the request's audit history. */
export async function updateRequestStaff(id: string, patch: StaffPatch, actorEmail: string, cfg: SupportConfig): Promise<{ ok: true; request: RequestView; statusChanged: boolean } | { ok: false; error: string }> {
  const col = await requestsCol();
  const req = await col.findOne({ _id: clean(id, 60) });
  if (!req) return { ok: false, error: "Request not found." };
  const set: Record<string, unknown> = {};
  const history: RequestDoc["history"] = [];
  const now = new Date();
  const change = (field: string, from: string | null, to: string | null) => {
    if (from !== to) history.push({ at: now, by: actorEmail, action: field, from, to });
  };
  const valid = (list: { key: string; active: boolean }[], v: string) => list.some((o) => o.key === v);

  if (patch.status !== undefined) {
    if (!cfg.statuses.some((s) => s.key === patch.status)) return { ok: false, error: "Unknown status." };
    set.status = patch.status;
    change("status", req.status, patch.status);
    const was = stateOf(cfg, req.status);
    const to = stateOf(cfg, patch.status);
    if ((to === "resolved" || to === "closed") && was !== "resolved" && was !== "closed") set.resolvedAt = now;
    if (to === "open" || to === "waiting") set.resolvedAt = null;
  }
  if (patch.priority !== undefined) {
    if (!valid(cfg.priorities, patch.priority)) return { ok: false, error: "Unknown priority." };
    set.priority = patch.priority;
    change("priority", req.priority, patch.priority);
  }
  if (patch.severity !== undefined) {
    if (patch.severity && !valid(cfg.severities, patch.severity)) return { ok: false, error: "Unknown severity." };
    set.severity = patch.severity;
    change("severity", req.severity, patch.severity);
  }
  if (patch.category !== undefined) {
    if (patch.category && !valid(cfg.categories, patch.category)) return { ok: false, error: "Unknown category." };
    set.category = patch.category;
    change("category", req.category, patch.category);
  }
  if (patch.team !== undefined) {
    if (patch.team && !valid(cfg.teams, patch.team)) return { ok: false, error: "Unknown team." };
    set.team = patch.team;
    change("team", req.team, patch.team);
  }
  if (patch.assignee !== undefined) {
    set.assignee = patch.assignee;
    change("assignee", req.assignee?.email ?? null, patch.assignee?.email ?? null);
  }
  if (history.length === 0) return { ok: true, request: viewRequest(req), statusChanged: false };
  set.updatedAt = now;
  const updated = await col.findOneAndUpdate({ _id: req._id }, { $set: set, $push: { history: { $each: history } } }, { returnDocument: "after" });
  return { ok: true, request: viewRequest(updated!), statusChanged: patch.status !== undefined && patch.status !== req.status };
}

export async function staffReply(id: string, actor: { id: string; email: string }, body: string, internal: boolean, cfg: SupportConfig): Promise<{ ok: true; request: RequestView } | { ok: false; error: string }> {
  const text = clean(body, 5000);
  if (!text) return { ok: false, error: "Write a message first." };
  const col = await requestsCol();
  const req = await col.findOne({ _id: clean(id, 60) });
  if (!req) return { ok: false, error: "Request not found." };
  const now = new Date();
  await (await messagesCol()).insertOne({ _id: crypto.randomUUID(), requestId: req._id, companyId: req.companyId, authorType: "staff", visibility: internal ? "internal" : "public", authorId: actor.id, authorLabel: "Support team", body: text, createdAt: now });
  const set: Record<string, unknown> = { updatedAt: now };
  const history: RequestDoc["history"] = [{ at: now, by: actor.email, action: internal ? "internal note" : "replied" }];
  if (!internal) {
    set.lastActor = "staff";
    // The first public answer on an untouched request moves it out of the initial status.
    if (req.status === initialStatus(cfg) && !req.assignee) {
      set.assignee = actor;
      history.push({ at: now, by: actor.email, action: "assignee", from: null, to: actor.email });
    }
  }
  const updated = await col.findOneAndUpdate({ _id: req._id }, { $set: set, $push: { history: { $each: history } } }, { returnDocument: "after" });
  return { ok: true, request: viewRequest(updated!) };
}

export async function saveAnalysis(id: string, ai: AiAnalysis): Promise<void> {
  await (await requestsCol()).updateOne({ _id: id }, { $set: { ai } });
}

/** Open requests with similar titles (cheap, deterministic duplicate hints; the AI only confirms/explains). */
export async function findSimilar(req: RequestView, limit = 5): Promise<{ id: string; number: number; title: string; companyName: string }[]> {
  const words = [...new Set(req.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3))].slice(0, 8);
  if (words.length === 0) return [];
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const rows = await (await requestsCol()).find({ _id: { $ne: req._id }, title: re }).sort({ updatedAt: -1 }).limit(40).toArray();
  const scored = rows.map((r) => ({ r, s: words.filter((w) => r.title.toLowerCase().includes(w)).length })).filter((x) => x.s >= Math.min(2, words.length));
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map(({ r }) => ({ id: r._id, number: r.number, title: r.title, companyName: r.companyName }));
}

// ── Company dashboard ────────────────────────────────────────────────────────────────────────────────────────────
export interface CompanyDashboard {
  totals: { total: number; open: number; waiting: number; resolved: number; closed: number; avgResolutionHours: number | null };
  byType: { key: string; count: number }[];
  byStatus: { key: string; count: number }[];
  byPriority: { key: string; count: number }[];
  trend: { date: string; count: number }[];
  needsYou: RequestView[];
  recent: RequestView[];
}

/** Everything the Help & Support dashboard shows, for ONE company, optionally narrowed by created-date range, type and search. */
export async function companyDashboard(companyId: string, f: { from?: string; to?: string; type?: string; q?: string } = {}): Promise<CompanyDashboard> {
  const cfg = await getSupportConfig();
  const col = await requestsCol();
  const match: Record<string, unknown> = { ...companyScope(companyId) };
  const created: { $gte?: Date; $lte?: Date } = {};
  if (f.from && !Number.isNaN(Date.parse(f.from))) created.$gte = new Date(`${f.from}T00:00:00`);
  if (f.to && !Number.isNaN(Date.parse(f.to))) created.$lte = new Date(`${f.to}T23:59:59.999`);
  if (created.$gte || created.$lte) match.createdAt = created;
  if (f.type) match.type = clean(f.type, 40);
  const q = clean(f.q, 80);
  if (q) match.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const tz = mongoTimeZone();
  const group = (field: string) => col.aggregate<{ _id: string; n: number }>([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
  const [byStatus, byType, byPriority, trend, resolution, needsYou, recent] = await Promise.all([
    group("status"),
    group("type"),
    group("priority"),
    col.aggregate<{ _id: string; n: number }>([{ $match: match }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    col.aggregate<{ _id: null; ms: number; n: number }>([{ $match: { ...match, resolvedAt: { $ne: null } } }, { $group: { _id: null, ms: { $sum: { $subtract: ["$resolvedAt", "$createdAt"] } }, n: { $sum: 1 } } }]).toArray(),
    col.find({ ...match, status: { $in: cfg.statuses.filter((s) => s.state === "waiting").map((s) => s.key) } }).sort({ updatedAt: -1 }).limit(5).toArray(),
    col.find(match).sort({ updatedAt: -1 }).limit(6).toArray(),
  ]);
  const totals = { total: 0, open: 0, waiting: 0, resolved: 0, closed: 0, avgResolutionHours: resolution[0]?.n ? Math.round((resolution[0].ms / resolution[0].n / 3_600_000) * 10) / 10 : null };
  for (const s of byStatus) {
    totals.total += s.n;
    totals[stateOf(cfg, s._id)] += s.n;
  }
  return {
    totals,
    byType: byType.map((x) => ({ key: x._id, count: x.n })),
    byStatus: byStatus.map((x) => ({ key: x._id, count: x.n })),
    byPriority: byPriority.map((x) => ({ key: x._id, count: x.n })),
    trend: trend.map((x) => ({ date: x._id, count: x.n })),
    needsYou: needsYou.map(viewRequest),
    recent: recent.map(viewRequest),
  };
}
