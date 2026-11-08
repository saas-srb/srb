import "server-only";
import { getDb } from "@/lib/mongodb";
import { labelCollected } from "@/lib/products/agentos/calls/call-ui";
import { normalizeE164 } from "@/lib/products/agentos/calls/phone";
import { isTerminal, type CallDoc, type CallStatus, type CallTarget } from "@/lib/products/agentos/calls/types";
import type { DoNotContactQuery } from "@/lib/products/agentos/calls/dnc";
import { phonesMatch } from "@/lib/products/call-writeback";
import { LEAD_TIMELINE_COLLECTION } from "@/lib/lead-management/timeline";
import { DEALFLOW_PRODUCT, parseSubmissionEntityId } from "@/lib/dealflow-ai/call-targets";
import { getLeadRecord } from "@/lib/lead-management/records";
import { ObjectId } from "mongodb";
import { getLead, isValidCategory } from "@/lib/leads";

/**
 * DealFlow's side of AI calls: writing results back, the do-not-contact answer and the "who is this number" lookup.
 * Results live in their own collection (`dealflow_call_results`, one row per call, keyed by the call id) and as a timeline entry
 * (fixed id per call) on the lead; the record's own fields (notes, status, stage, phone …) are never written, so nothing a person
 * typed can be overwritten, and a repeated notification changes nothing.
 */

export const CALL_RESULTS_COLLECTION = "dealflow_call_results";
const LEADS = "lead_records";
const APPLICATIONS = "career_applications";

export interface CallResultDoc {
  _id: string; // the call id
  entityType: string;
  entityId: string;
  label: string;
  status: CallStatus;
  outcome: CallDoc["outcome"];
  purpose: string;
  agentId: string;
  summary: string | null;
  collected: { key: string; label: string; value: string }[];
  durationSecs: number | null;
  endedAt: Date | null;
  createdAt: Date;
}

async function results() {
  const c = (await getDb()).collection<CallResultDoc>(CALL_RESULTS_COLLECTION);
  await c.createIndex({ entityType: 1, entityId: 1, createdAt: -1 }).catch(() => {});
  return c;
}

const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
const STATUS_TITLE: Partial<Record<CallStatus, string>> = { completed: "AI call completed", failed: "AI call failed", no_answer: "AI call not answered", busy: "AI call: line busy" };
const OUTCOME_LABEL = { success: "Successful", failure: "Unsuccessful", unknown: "Unclear" } as const;

export function timelineDetail(r: Pick<CallResultDoc, "_id" | "summary" | "collected" | "outcome">): string {
  const lines: string[] = [];
  if (r.summary) lines.push(r.summary);
  if (r.collected.length) lines.push(r.collected.map((c) => `${c.label}: ${c.value}`).join(" · "));
  if (r.outcome) lines.push(`Outcome: ${OUTCOME_LABEL[r.outcome]}`);
  lines.push(`Call: /agentos/calls/${r._id}`);
  return lines.join("\n").slice(0, 2000);
}

/** True when the record a call is about still exists (not deleted). Anything that is not a DealFlow record, or a malformed id, is false. */
export async function dealflowEntityExists(t: CallTarget): Promise<boolean> {
  if (t.product !== DEALFLOW_PRODUCT) return false;
  if (t.entityType === "lead") return Boolean(await getLeadRecord(t.entityId));
  if (t.entityType === "applicant") {
    const ids: unknown[] = [t.entityId];
    if (/^[a-f\d]{24}$/i.test(t.entityId)) ids.push(new ObjectId(t.entityId));
    return Boolean(await (await getDb()).collection(APPLICATIONS).findOne({ _id: { $in: ids } } as never, { projection: { _id: 1 } }));
  }
  if (t.entityType === "submission") {
    const p = parseSubmissionEntityId(t.entityId);
    return Boolean(p && isValidCategory(p.category) && (await getLead(p.category, p.id)));
  }
  return false;
}

/** The settled-call handler. Safe to run any number of times for the same call. Nothing is written for a record that no longer exists. */
export async function recordDealflowCall(call: CallDoc): Promise<boolean> {
  const t = call.target;
  if (!t || t.product !== DEALFLOW_PRODUCT || !isTerminal(call.status) || call.status === "cancelled") return false;
  if (!(await dealflowEntityExists(t))) return false;
  const doc: CallResultDoc = {
    _id: call._id, entityType: t.entityType, entityId: t.entityId, label: t.label, status: call.status, outcome: call.outcome, purpose: call.purpose, agentId: call.agentId,
    summary: clip(call.summary, 1500), collected: labelCollected(call.collected ?? [], null).map((c) => ({ ...c, value: c.value.slice(0, 500) })),
    durationSecs: call.durationSecs, endedAt: call.endedAt, createdAt: new Date(),
  };
  const col = await results();
  const ins = await col.updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
  // The row is written once; if it was already there the stored one is what the page shows (later webhook data for the same call is not appended).
  const db = await getDb();
  const leadIds: string[] = [];
  if (t.entityType === "lead") leadIds.push(t.entityId);
  else if (t.entityType === "applicant") {
    const linked = await db.collection(LEADS).find({ applicationId: t.entityId, deletedAt: null }, { projection: { _id: 1 } }).limit(5).toArray();
    leadIds.push(...linked.map((l) => String(l._id)));
  }
  for (const leadId of leadIds) {
    try {
      await db.collection<{ _id: string }>(LEAD_TIMELINE_COLLECTION).insertOne({
        _id: `aicall_${call._id}`, leadId, kind: "ai_call", title: STATUS_TITLE[call.status] ?? "AI call", detail: timelineDetail(doc), actor: "system", actorId: null, visibleToLead: false, createdAt: new Date(),
      } as never);
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  return ins.upsertedCount === 1;
}

/**
 * Writes one entry on the timeline of the lead(s) a DealFlow record stands for (the lead itself, or the leads linked to an applicant), under a
 * fixed id so repeating it changes nothing. Returns how many entries were newly written. Nothing is written for a record that no longer exists.
 */
export async function writeTimelineEntry(t: CallTarget, entry: { id: string; kind: string; title: string; detail: string }): Promise<number> {
  if (!(await dealflowEntityExists(t))) return 0;
  const db = await getDb();
  const leadIds: string[] = [];
  if (t.entityType === "lead") leadIds.push(t.entityId);
  else if (t.entityType === "applicant") {
    const linked = await db.collection(LEADS).find({ applicationId: t.entityId, deletedAt: null }, { projection: { _id: 1 } }).limit(5).toArray();
    leadIds.push(...linked.map((l) => String(l._id)));
  }
  let written = 0;
  for (const leadId of leadIds) {
    try {
      await db.collection<{ _id: string }>(LEAD_TIMELINE_COLLECTION).insertOne({
        _id: `${entry.id}_${leadId}`, leadId, kind: entry.kind, title: entry.title.slice(0, 200), detail: entry.detail.slice(0, 2000), actor: "system", actorId: null, visibleToLead: false, createdAt: new Date(),
      } as never);
      written++;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  return written;
}

export async function listCallResults(entityType: string, entityId: string, limit = 20): Promise<CallResultDoc[]> {
  return (await (await results()).find({ entityType, entityId }).sort({ createdAt: -1 }).limit(limit).toArray());
}

// ---------------------------------------------------------------------------
// Phone matching
// ---------------------------------------------------------------------------
const digitsOf = (s: string) => s.replace(/\D/g, "");
export { phonesMatch };

/** A regex that finds the number however it is punctuated (last 10 digits, any separators between). Candidates are verified with phonesMatch. */
function looseRegex(e164: string): RegExp {
  const tail = digitsOf(e164).slice(-10);
  return new RegExp(tail.split("").join("[^0-9]*"));
}

async function matchingRecords(e164: string, extra: Record<string, unknown> = {}) {
  const db = await getDb();
  const re = looseRegex(e164);
  const [leads, apps] = await Promise.all([
    db.collection(LEADS).find({ phone: re, deletedAt: null, ...extra }, { projection: { name: 1, phone: 1, doNotContact: 1 } }).limit(50).toArray(),
    Object.keys(extra).length ? Promise.resolve([]) : db.collection(APPLICATIONS).find({ phone: re }, { projection: { name: 1, phone: 1 } }).limit(50).toArray(),
  ]);
  return {
    leads: leads.filter((l) => phonesMatch(l.phone, e164)),
    apps: apps.filter((a) => phonesMatch(a.phone, e164)),
  };
}

/** The engine's do-not-contact question: the lead's flag (by record, by linked application, or by the number itself). */
export async function dealflowDoNotContact(q: DoNotContactQuery): Promise<boolean> {
  const db = await getDb();
  const t = q.target;
  if (t?.product === DEALFLOW_PRODUCT) {
    if (t.entityType === "lead" && (await db.collection(LEADS).findOne({ _id: t.entityId as never, doNotContact: true }, { projection: { _id: 1 } }))) return true;
    if (t.entityType === "applicant" && (await db.collection(LEADS).findOne({ applicationId: t.entityId, doNotContact: true, deletedAt: null }, { projection: { _id: 1 } }))) return true;
  }
  const e164 = normalizeE164(q.phone);
  if (!e164) return false;
  return (await matchingRecords(e164, { doNotContact: true })).leads.length > 0;
}

/** "Who is this number": a lead first, then an applicant. Returns the target and label for the call, or null. */
export async function dealflowCallerLookup(e164: string): Promise<CallTarget | null> {
  const { leads, apps } = await matchingRecords(e164);
  const lead = leads[0];
  if (lead) return { product: DEALFLOW_PRODUCT, entityType: "lead", entityId: String(lead._id), label: String(lead.name ?? "").slice(0, 120) };
  const app = apps[0];
  if (app) return { product: DEALFLOW_PRODUCT, entityType: "applicant", entityId: String(app._id), label: String(app.name ?? "").slice(0, 120) };
  return null;
}
