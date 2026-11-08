import "server-only";
import { botsCollection } from "@/lib/products/agentos/bots";
import { newId, notDeleted } from "@/lib/products/agentos/db";
import { applyConversationUpdate, type EngineDeps } from "@/lib/products/agentos/calls/engine";
import { last4Of, maskPhone, normalizeE164, logText } from "@/lib/products/agentos/calls/phone";
import { getPublicCallSettings } from "@/lib/products/agentos/calls/settings";
import { callsCollection, isDuplicateKey, numbersCollection, phoneFingerprint } from "@/lib/products/agentos/calls/store";
import type { CallDoc, CallTarget } from "@/lib/products/agentos/calls/types";
import { can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { workspaceAgentClient } from "@/lib/products/agentos/voice/connection";

/**
 * Inbound calls (a caller dials a company number that has an agent) and the call lists that show them next to website calls.
 * Inbound calls are never put through the outbound guards (do-not-call list, calling window, caps): those protect people the company
 * calls, and a person who dials in has chosen to talk.
 */

// ---------------------------------------------------------------------------
// Who is calling: products register a lookup (DealFlow: leads, ClientOS: clients …); the first match names the call's target.
// ---------------------------------------------------------------------------

export type CallerLookup = (phoneE164: string) => Promise<CallTarget | null>;
const lg = globalThis as unknown as { __agentosCallerLookups?: Map<string, CallerLookup> };
const lookups = (lg.__agentosCallerLookups ??= new Map<string, CallerLookup>());

export function registerCallerLookup(product: string, fn: CallerLookup): void {
  lookups.set(product, fn);
}
/** Test hook. */
export function clearCallerLookups(): void {
  lookups.clear();
}

async function findCaller(phone: string): Promise<CallTarget | null> {
  for (const [product, fn] of lookups) {
    try {
      const hit = await fn(phone);
      if (hit) return hit;
    } catch (e) {
      console.error(`[agentos calls] caller lookup failed (${product})`, logText(e));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recording an inbound call
// ---------------------------------------------------------------------------

export interface InboundCallInput {
  conversationId: string;
  /** The ElevenLabs agent that answered. */
  elevenAgentId: string;
  /** The caller's number and the company number they dialed (any format; invalid = the call is not ours to record). */
  caller: unknown;
  called: unknown;
}

/** Creates the call record for a call that came in on a company number with an agent. False when it isn't one of ours. Safe to repeat. */
export async function createInboundCall(i: InboundCallInput, deps: Pick<EngineDeps, "now"> = {}): Promise<boolean> {
  const caller = normalizeE164(i.caller);
  const called = normalizeE164(i.called);
  if (!caller || !called || !i.elevenAgentId || !i.conversationId) return false;
  const num = await (await numbersCollection()).findOne({ number: called, supportsInbound: true });
  const bot = await (await botsCollection()).findOne({ "voice.elevenAgentId": i.elevenAgentId, ...notDeleted });
  if (!num || !bot) return false;
  const now = (deps.now ?? (() => new Date()))();
  const doc: CallDoc = {
    _id: newId(), idempotencyKey: `inbound:${i.conversationId}`, direction: "inbound", agentId: bot._id, elevenAgentId: i.elevenAgentId, purpose: "support",
    target: await findCaller(caller), phone: caller, phoneHash: await phoneFingerprint(caller), phoneLast4: last4Of(caller), fromNumberId: num._id, initiatedBy: null,
    scheduledFor: null, anchorAt: now, dialedAt: null, endedAt: null, status: "in_progress", attempts: 1, conversationId: i.conversationId, callSid: null,
    context: {}, compliance: null, failure: null, collected: [], outcome: null, summary: null, summaryTitle: null, transcript: null, durationSecs: null,
    hasAudio: null, terminationReason: null, meteredAt: null, meterLeaseUntil: null, chatId: null, cancelledBy: null,
    control: { mode: "ai", handler: null, canHandBack: true, history: [] }, eventSeq: 0, createdAt: now, updatedAt: now,
  };
  try {
    await (await callsCollection()).insertOne(doc);
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
  }
  return true;
}

/**
 * The safety net for companies whose ElevenLabs account can't send the post-call webhook (SelfRun's shared account): looks at each answering
 * agent's recent conversations and records the inbound ones that have no call record yet. Runs from the scheduled sweep; never throws.
 */
export async function reconcileInboundCalls(deps: EngineDeps = {}): Promise<{ checked: number; recorded: number }> {
  const out = { checked: 0, recorded: 0 };
  try {
    const numbers = await (await numbersCollection()).find({ supportsInbound: true, assignedAgentId: { $ne: null } }).limit(50).toArray();
    if (!numbers.length) return out;
    const client = await (deps.client ?? workspaceAgentClient)();
    if (!client) return out;
    const calls = await callsCollection();
    const now = (deps.now ?? (() => new Date()))().getTime();
    const bots = await (await botsCollection()).find({ _id: { $in: [...new Set(numbers.map((n) => n.assignedAgentId!))] } }).toArray();
    for (const bot of bots) {
      const agentId = bot.voice?.elevenAgentId;
      if (!agentId) continue;
      const recent = (await client.listConversations(agentId, { pageSize: 50 }).catch(() => null))?.items ?? [];
      const fresh = recent.filter((c) => c.conversationId && c.startedAt && now - new Date(c.startedAt).getTime() < 3 * 24 * 60 * 60 * 1000);
      const known = new Set((await calls.find({ conversationId: { $in: fresh.map((c) => c.conversationId) } }, { projection: { conversationId: 1 } }).toArray()).map((c) => c.conversationId));
      for (const c of fresh.filter((x) => !known.has(x.conversationId)).slice(0, 10)) {
        out.checked++;
        const detail = await client.getConversation(c.conversationId).catch(() => null);
        const phone = detail?.phoneCall;
        if (!detail || detail.agentId !== agentId || phone?.direction !== "inbound") continue;
        if (await createInboundCall({ conversationId: c.conversationId, elevenAgentId: agentId, caller: phone.externalNumber, called: phone.agentNumber }, deps)) {
          await applyConversationUpdate({ conversationId: c.conversationId, agentId, detail }, deps);
          out.recorded++;
        }
      }
    }
  } catch (e) {
    console.error("[agentos calls] inbound reconcile failed", logText(e));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data for the settings page and the call lists
// ---------------------------------------------------------------------------

export interface InboundNumberView {
  numberId: string;
  label: string;
  masked: string;
  agentId: string;
  agentName: string;
  lastCalls: { callId: string; at: string; caller: string; status: string; durationSecs: number | null; summary: string | null }[];
}

/** The caller as a list shows them: the contact's name when known, else the number masked (or full, when the company turned masking off). */
export function callerLabel(c: Pick<CallDoc, "phone" | "target">, maskNumbers: boolean): string {
  if (c.target?.label) return c.target.label;
  if (!c.phone) return "Unknown caller";
  return maskNumbers ? maskPhone(c.phone) : c.phone;
}

/** Which company numbers answer with an agent, and the last inbound calls on each. Needs VOICE_CALL_MANAGE; empty otherwise. */
export async function listInboundNumbers(viewer: AibotsViewer, perNumber = 5): Promise<InboundNumberView[]> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) return [];
  const [numbers, settings] = await Promise.all([(await numbersCollection()).find({ supportsInbound: true, assignedAgentId: { $ne: null } }).sort({ createdAt: 1 }).limit(50).toArray(), getPublicCallSettings()]);
  if (!numbers.length) return [];
  const bots = new Map((await (await botsCollection()).find({ _id: { $in: numbers.map((n) => n.assignedAgentId!) } }).toArray()).map((b) => [b._id, b.voice?.displayName || b.name]));
  const calls = await callsCollection();
  const out: InboundNumberView[] = [];
  for (const n of numbers) {
    const rows = await calls.find({ direction: "inbound", fromNumberId: n._id }, { projection: { transcript: 0 } }).sort({ createdAt: -1 }).limit(Math.min(Math.max(perNumber, 1), 20)).toArray();
    out.push({
      numberId: n._id, label: n.label, masked: maskPhone(n.number), agentId: n.assignedAgentId!, agentName: bots.get(n.assignedAgentId!) ?? "Agent removed",
      lastCalls: rows.map((c) => ({ callId: c._id, at: c.createdAt.toISOString(), caller: callerLabel(c, settings.maskInboundNumbers), status: c.status, durationSecs: c.durationSecs, summary: c.summaryTitle || c.summary })),
    });
  }
  return out;
}

export interface ExternalCallRow {
  callId: string;
  direction: "inbound" | "web_public";
  startedAt: string;
  agentId: string;
  agentName: string;
  /** Contact name, masked number, or the website visitor's name / "Website visitor". */
  who: string;
  /** Where a website call came from. */
  origin: string | null;
  status: string;
  durationSecs: number | null;
  summary: string | null;
}

/**
 * Inbound phone calls and website visitor calls for Call History: calls with no signed-in person behind them, so only people who oversee
 * calls (VIEW_CHATS) see them. Newest first; numbers masked per the company's setting.
 */
export async function listExternalCalls(viewer: AibotsViewer, o: { page?: number; pageSize?: number; agentId?: string; direction?: "inbound" | "web_public" } = {}): Promise<{ items: ExternalCallRow[]; total: number; page: number }> {
  if (!can(viewer, "VIEW_CHATS")) return { items: [], total: 0, page: 1 };
  const page = Math.max(1, Math.floor(o.page ?? 1));
  const size = Math.min(Math.max(Math.floor(o.pageSize ?? 25), 1), 100);
  const filter: Record<string, unknown> = { direction: o.direction ?? { $in: ["inbound", "web_public"] } };
  if (o.agentId) filter.agentId = String(o.agentId).slice(0, 64);
  const calls = await callsCollection();
  const [rows, total, settings] = await Promise.all([
    calls.find(filter, { projection: { transcript: 0 } }).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size).toArray(),
    calls.countDocuments(filter),
    getPublicCallSettings(),
  ]);
  const bots = new Map((await (await botsCollection()).find({ _id: { $in: [...new Set(rows.map((r) => r.agentId))] } }).toArray()).map((b) => [b._id, b.voice?.displayName || b.name]));
  return {
    total,
    page,
    items: rows.map((c) => ({
      callId: c._id,
      direction: c.direction === "inbound" ? "inbound" : "web_public",
      startedAt: c.createdAt.toISOString(),
      agentId: c.agentId,
      agentName: bots.get(c.agentId) ?? "Agent removed",
      who: c.direction === "inbound" ? callerLabel(c, settings.maskInboundNumbers) : c.context.visitor_name || "Website visitor",
      origin: c.direction === "web_public" ? (c.publicMeta?.origin ?? null) : null,
      status: c.status,
      durationSecs: c.durationSecs,
      summary: c.summaryTitle || c.summary,
    })),
  };
}
