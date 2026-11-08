import { lmsEvents } from "@/lib/notify/triggers/lms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { emitEvent } from "@/lib/platform/events";
import { externalUsers } from "@/lib/portal-auth";
import { newId, nextSequence, formatCode } from "@/lib/products/clientos/db";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { sendActivityChatMessage } from "@/lib/lead-management/activity-notifier";
import { awardActivity } from "@/lib/wallet/earn";
import { recordLeadEvent } from "@/lib/lead-management/timeline";
import { firstStage, isValidStage, nextStageOptions, stageMeta } from "@/lib/lead-management/workflows";
import type {
  LeadRecord,
  LeadType,
  LeadManagementSource,
  LeadSourceRef,
  SerializedLeadRecord,
} from "@/lib/lead-management/types";

export const LEAD_RECORDS_COLLECTION = "lead_records";

let idx = false;

async function collection() {
  const db = await getDb();
  const c = db.collection<LeadRecord>(LEAD_RECORDS_COLLECTION);
  if (!idx) {
    idx = true;
    await Promise.all([
      c.createIndex({ code: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ email: 1 }).catch(() => {}),
      c.createIndex({ externalUserId: 1 }).catch(() => {}),
      c.createIndex({ type: 1, stage: 1 }).catch(() => {}),
      c.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}

export function serializeLeadRecord(l: LeadRecord): SerializedLeadRecord {
  return {
    ...l,
    stageEnteredAt: l.stageEnteredAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    deletedAt: l.deletedAt ? l.deletedAt.toISOString() : null,
  };
}

// --- create --------------------------------------------------------------

export interface CreateLeadInput {
  type: LeadType;
  source: LeadManagementSource;
  name: string;
  email: string; // will be lower-cased
  phone: string;
  subService?: string | null;
  message?: string | null;
  externalUserId: string;
  sourceRef?: LeadSourceRef | null;
  applicationId?: string | null;
  ownerStaffId?: string | null;
  actorId?: string | null;
}

export async function createLeadRecord(input: CreateLeadInput): Promise<LeadRecord> {
  const c = await collection();
  const now = new Date();
  const seq = await nextSequence("lead_record_code");
  const doc: LeadRecord = {
    _id: newId(),
    code: formatCode(`LEAD-${now.getFullYear()}`, seq),
    type: input.type,
    source: input.source,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    subService: input.subService ?? null,
    message: input.message?.trim() || null,
    stage: firstStage(input.type),
    stageEnteredAt: now,
    status: "open",
    externalUserId: input.externalUserId,
    ownerStaffId: input.ownerStaffId ?? null,
    hasUnreadPortalReply: false,
    sourceRef: input.sourceRef ?? null,
    applicationId: input.applicationId ?? null,
    offerId: null,
    studentId: null,
    clientId: null,
    projectId: null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.actorId ?? null,
    updatedBy: input.actorId ?? null,
    deletedAt: null,
  };
  await c.insertOne(doc);
  await emitEvent("lead.created", { entity: { type: "lead", id: doc._id, label: doc.name, url: `/dealflow-ai/leads/${doc._id}` }, actorId: input.actorId, data: { name: doc.name, email: doc.email, phone: doc.phone, code: doc.code, leadType: doc.type, leadSource: doc.source } });
  await lmsEvents.leadCreated({ id: doc._id, code: doc.code, name: doc.name, type: doc.type, ownerStaffId: doc.ownerStaffId, source: doc.source, message: doc.message }, input.actorId ?? null);
  return doc;
}

// --- reads --------------------------------------------------------------

export async function getLeadRecord(id: string): Promise<LeadRecord | null> {
  return (await collection()).findOne({ _id: id, deletedAt: null });
}

export async function listLeadsForUser(externalUserId: string): Promise<LeadRecord[]> {
  return (await collection()).find({ externalUserId, deletedAt: null }).sort({ createdAt: -1 }).toArray();
}

export interface LeadListFilter {
  type?: LeadType;
  stage?: string;
  source?: LeadManagementSource;
  status?: "open" | "won" | "lost";
  ownerStaffId?: string;
  search?: string;
  limit?: number;
}

export async function listLeadRecords(filter: LeadListFilter = {}): Promise<LeadRecord[]> {
  const c = await collection();
  const q: Record<string, unknown> = { deletedAt: null };
  if (filter.type) q.type = filter.type;
  if (filter.stage) q.stage = filter.stage;
  if (filter.source) q.source = filter.source;
  if (filter.status) q.status = filter.status;
  if (filter.ownerStaffId) q.ownerStaffId = filter.ownerStaffId;
  if (filter.search?.trim()) {
    const rx = new RegExp(filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ name: rx }, { email: rx }, { phone: rx }, { code: rx }];
  }
  return c
    .find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(filter.limit ?? 200, 500))
    .toArray();
}

export interface LeadStats {
  total: number;
  open: number;
  byType: Record<string, number>;
  byStage: Record<string, number>;
  unassigned: number;
}

export async function getLeadStats(): Promise<LeadStats> {
  const c = await collection();
  const rows = await c.find({ deletedAt: null }, { projection: { type: 1, stage: 1, status: 1, ownerStaffId: 1 } }).toArray();
  const byType: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  let open = 0;
  let unassigned = 0;
  for (const r of rows) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
    if (r.status === "open") open += 1;
    if (!r.ownerStaffId) unassigned += 1;
  }
  return { total: rows.length, open, byType, byStage, unassigned };
}

// --- mutations --------------------------------------------------------------

export async function advanceLeadStage(
  leadId: string,
  toStage: string,
  actorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lead = await getLeadRecord(leadId);
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.stage === toStage) return { ok: false, error: "Lead is already at that stage." };
  if (!isValidStage(lead.type, toStage)) return { ok: false, error: "Unknown stage for this lead type." };
  const allowed = nextStageOptions(lead.type, lead.stage).some((s) => s.key === toStage);
  if (!allowed) return { ok: false, error: "That stage isn't reachable from the current stage." };

  const meta = stageMeta(lead.type, toStage)!;
  const now = new Date();
  const status = meta.terminal ?? "open";
  await (await collection()).updateOne(
    { _id: leadId },
    { $set: { stage: toStage, stageEnteredAt: now, status, updatedAt: now, updatedBy: actorId } }
  );
  await emitEvent("lead.status_changed", { entity: { type: "lead", id: leadId, label: lead.name, url: `/dealflow-ai/leads/${leadId}` }, actorId, data: { name: lead.name, email: lead.email, status: toStage, previousStatus: lead.stage, outcome: status, won: status === "won" } });

  await recordLeadEvent(leadId, {
    kind: "stage_changed",
    title: `Stage: ${meta.label}`,
    detail: null,
    actor: "staff",
    actorId,
    visibleToLead: true,
  });
  await lmsEvents.stageChanged({ id: leadId, code: lead.code, name: lead.name, type: lead.type, ownerStaffId: lead.ownerStaffId }, meta.label, meta.terminal ?? null, actorId);
  await notifyPortalUser({
    recipientUserId: lead.externalUserId,
    type: "status_update",
    title: "Status updated",
    body: `Your ${labelForType(lead.type)} is now: ${meta.portalLabel}.`,
    link: "/clientos/journey",
  });
  await sendActivityChatMessage({
    leadId,
    activityType: "stage_change",
    title: `Stage Advanced: ${meta.portalLabel}`,
    stageKey: toStage,
    details: meta.terminal === "won"
      ? "Congratulations! Your request has successfully completed all stages."
      : meta.terminal === "lost"
        ? "Your request status has been updated."
        : `Your ${labelForType(lead.type)} has progressed to the ${meta.portalLabel} stage. Check your portal dashboard for details.`,
    actorStaffId: actorId,
  });

  // Wallet & Credits: every completed journey stage earns credits (rule per account type, optionally per stage). Lost/rejected outcomes never pay.
  if (meta.terminal !== "lost") {
    await awardActivity({ userId: lead.externalUserId, role: lead.type, type: "stage_complete", key: `${leadId}:${toStage}`, subKey: toStage, detail: `Stage completed: ${meta.label}` });
  }

  // Soft side-effect breadcrumbs — never block the stage change.
  if (toStage === "offer_released") {
    await recordLeadEvent(leadId, {
      kind: "offer_released",
      title: "Offer released",
      detail: "Attach the offer letter from Documents so the candidate can download it.",
      actor: "system",
      visibleToLead: false,
    });
  }
  if (toStage === "certificate_issued") {
    await recordLeadEvent(leadId, {
      kind: "certificate_issued",
      title: "Certificate issued",
      actor: "system",
      visibleToLead: true,
    });
  }
  if (toStage === "batch_assigned" && !lead.studentId) {
    await recordLeadEvent(leadId, {
      kind: "linked_student",
      title: "Link a Cohort AI student",
      detail: "This lead has no linked student yet — link one so batch, attendance and assignments show in the portal.",
      actor: "system",
      visibleToLead: false,
    });
  }
  if (toStage === "project_started" && !lead.projectId) {
    await recordLeadEvent(leadId, {
      kind: "linked_project",
      title: "Link a SprintOS project",
      detail: "This lead has no linked project yet — link one so milestones, meetings and invoices show in the portal.",
      actor: "system",
      visibleToLead: false,
    });
  }

  return { ok: true };
}

export async function assignLeadOwner(leadId: string, ownerStaffId: string | null, actorId: string): Promise<void> {
  await (await collection()).updateOne(
    { _id: leadId },
    { $set: { ownerStaffId, updatedAt: new Date(), updatedBy: actorId } }
  );
  await recordLeadEvent(leadId, {
    kind: "owner_assigned",
    title: ownerStaffId ? "Owner assigned" : "Owner cleared",
    actor: "staff",
    actorId,
    visibleToLead: false,
  });
  const assigned = await getLeadRecord(leadId);
  if (assigned) await lmsEvents.leadAssigned({ id: assigned._id, code: assigned.code, name: assigned.name, type: assigned.type }, ownerStaffId, actorId);
}

/** A portal user replied in the Communication Center — flags it for staff attention on the leads list. */
export async function markLeadPortalReplyReceived(leadId: string): Promise<void> {
  // No `updatedBy` here — that field is stamped with staff ids everywhere else in this
  // record, and a portal user's id landing there would silently break any future
  // "last edited by" resolution against `admin_users`.
  await (await collection()).updateOne({ _id: leadId }, { $set: { hasUnreadPortalReply: true, updatedAt: new Date() } });
}

/** Staff opened the lead's Communication Center — clears the unread flag. */
export async function clearLeadPortalUnread(leadId: string, actorId: string): Promise<void> {
  await (await collection()).updateOne(
    { _id: leadId, hasUnreadPortalReply: true },
    { $set: { hasUnreadPortalReply: false, updatedAt: new Date(), updatedBy: actorId } }
  );
}

export async function setLeadLink(
  leadId: string,
  patch: Partial<Pick<LeadRecord, "studentId" | "clientId" | "projectId" | "offerId" | "applicationId">>,
  actorId: string
): Promise<void> {
  await (await collection()).updateOne(
    { _id: leadId },
    { $set: { ...patch, updatedAt: new Date(), updatedBy: actorId } }
  );
}

export async function setLeadDoNotContact(leadId: string, doNotContact: boolean, actorId: string): Promise<boolean> {
  const r = await (await collection()).updateOne({ _id: leadId, deletedAt: null }, { $set: { doNotContact, updatedAt: new Date(), updatedBy: actorId } });
  return r.matchedCount > 0;
}

export async function mirrorLinkToAccount(
  externalUserId: string,
  patch: { applicationId?: string | null; studentId?: string | null; clientId?: string | null }
): Promise<void> {
  const users = await externalUsers();
  await users.updateOne({ _id: externalUserId }, { $set: { ...patch, updatedAt: new Date() } });
}

function labelForType(type: LeadType): string {
  switch (type) {
    case "job_applicant":
      return "application";
    case "intern":
      return "internship";
    case "trainee":
      return "training";
    case "client":
      return "project";
  }
}

export { labelForType as leadTypeNoun };
