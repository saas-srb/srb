import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { APPLICATIONS_COLLECTION } from "@/lib/career-applications";
import { registerCallSettledHandler } from "@/lib/products/agentos/calls/engine";
import { registerDoNotContactProvider, type DoNotContactQuery } from "@/lib/products/agentos/calls/dnc";
import type { CallDoc, CallTarget } from "@/lib/products/agentos/calls/types";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";
import { buildAiCallEntry, loosePhoneRegex, phonesMatch, type AiCallEntry } from "@/lib/products/call-writeback";
import { registerTargetAuthorizer } from "@/lib/products/agentos/calls/integrations";
import { canManageEmployees } from "@/lib/hrms-roles";
import { registerBriefingProvider } from "@/lib/products/agentos/calls/briefing";
import { talentosBriefing } from "@/lib/products/talentos/call-briefing";

/**
 * TalentOS recruitment x AI calls.
 *
 * A call about a candidate has target { product: "talentos", entityType: "applicant", entityId: <career application id> }.
 * When it settles, the engine tells us once; we append a snapshot to the application's own `aiCalls` list. That list is a separate
 * field: nothing a recruiter typed (status, notes, name, phone …) is ever read back or overwritten, and the same call is never
 * added twice. `doNotContact` is a person's decision recorded on the application and honoured by every outbound call.
 */

export const TALENTOS_PRODUCT = "talentos";
export const APPLICANT_ENTITY = "applicant";
const MAX_ENTRIES = 50;

interface ApplicationCalls {
  aiCalls?: AiCallEntry[];
  doNotContact?: boolean;
  phone?: string;
}

async function applications() {
  return (await getDb()).collection<ApplicationCalls & { _id: ObjectId }>(APPLICATIONS_COLLECTION);
}

const toObjectId = (id: unknown): ObjectId | null => (typeof id === "string" && /^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : null);

/** Called by the calling engine when a call about a candidate reaches a finished state. Idempotent. */
export async function writeBackApplicantCall(call: CallDoc): Promise<boolean> {
  if (call.target?.product !== TALENTOS_PRODUCT || call.target.entityType !== APPLICANT_ENTITY) return false;
  const _id = toObjectId(call.target.entityId);
  if (!_id) return false;
  // The record must still exist: a deleted applicant is not written into (the update would match nothing anyway, but say so).
  if (!(await (await applications()).findOne({ _id }, { projection: { _id: 1 } }))) return false;
  const r = await (await applications()).updateOne(
    { _id, "aiCalls.callId": { $ne: call._id } },
    { $push: { aiCalls: { $each: [buildAiCallEntry(call)], $slice: -MAX_ENTRIES } } }
  );
  return r.modifiedCount === 1;
}

export async function getApplicantCalls(applicationId: string): Promise<{ aiCalls: AiCallEntry[]; doNotContact: boolean }> {
  const _id = toObjectId(applicationId);
  if (!_id) return { aiCalls: [], doNotContact: false };
  const doc = await (await applications()).findOne({ _id }, { projection: { aiCalls: 1, doNotContact: 1 } });
  return { aiCalls: [...(doc?.aiCalls ?? [])].reverse(), doNotContact: doc?.doNotContact === true };
}

export async function setApplicantDoNotContact(applicationId: string, value: boolean): Promise<boolean> {
  const _id = toObjectId(applicationId);
  if (!_id) return false;
  const r = await (await applications()).updateOne({ _id }, { $set: { doNotContact: value === true } });
  return r.matchedCount === 1;
}

/** True when this candidate, or any flagged candidate with the same number, asked not to be contacted. */
export async function isApplicantDoNotContact(q: DoNotContactQuery): Promise<boolean> {
  const col = await applications();
  if (q.target?.product === TALENTOS_PRODUCT && q.target.entityType === APPLICANT_ENTITY) {
    const _id = toObjectId(q.target.entityId);
    if (_id && (await col.findOne({ _id, doNotContact: true }, { projection: { _id: 1 } }))) return true;
  }
  // By number, not by scanning the flagged list: find only rows whose phone contains these digits, then confirm each is the same line.
  const re = loosePhoneRegex(q.phone);
  if (!re) return false;
  const cursor = col.find({ doNotContact: true, phone: re }, { projection: { phone: 1 } });
  for await (const a of cursor) if (phonesMatch(a.phone, q.phone)) return true;
  return false;
}

/** Who may point a call at a candidate: HR staff who may manage employees (the same rule as the recruitment page's call buttons) and the record must exist. */
export async function authorizeApplicantTarget(viewer: AibotsViewer, target: CallTarget): Promise<boolean> {
  if (target.product !== TALENTOS_PRODUCT || target.entityType !== APPLICANT_ENTITY) return false;
  if (!canManageEmployees(viewer.ctx)) return false;
  const _id = toObjectId(target.entityId);
  return Boolean(_id && (await (await applications()).findOne({ _id }, { projection: { _id: 1 } })));
}
registerTargetAuthorizer(TALENTOS_PRODUCT, authorizeApplicantTarget);

registerCallSettledHandler(TALENTOS_PRODUCT, async (call) => {
  await writeBackApplicantCall(call);
});
registerDoNotContactProvider(TALENTOS_PRODUCT, isApplicantDoNotContact);
registerBriefingProvider(TALENTOS_PRODUCT, talentosBriefing);

export interface PipelineCandidate {
  id: string;
  name: string;
  positionTitle: string;
  status: string;
  phone: string;
  doNotContact: boolean;
  appliedAt: string;
}

/** Candidates who are past the first look, for the recruitment "Pipeline" tab. */
export async function listPipelineCandidates(limit = 100): Promise<PipelineCandidate[]> {
  const docs = await (await getDb())
    .collection(APPLICATIONS_COLLECTION)
    .find({ status: { $in: ["shortlisted", "interview_scheduled", "selected", "hired"] } }, { projection: { name: 1, positionTitle: 1, status: 1, phone: 1, doNotContact: 1, createdAt: 1 } })
    .sort({ updatedAt: -1 })
    .limit(Math.min(limit, 200))
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    name: String(d.name ?? ""),
    positionTitle: String(d.positionTitle ?? ""),
    status: String(d.status ?? ""),
    phone: String(d.phone ?? ""),
    doNotContact: d.doNotContact === true,
    appliedAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : "",
  }));
}
