import { lmsEvents } from "@/lib/notify/triggers/lms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/clientos/db";

/**
 * `portal_interviews` — structured interview slots for a job application. The ERP
 * only tracks a coarse `interview_scheduled` status on `career_applications`, so
 * this fills the gap. Staff create these from the LMS careers application page.
 */

export const INTERVIEWS_COLLECTION = "portal_interviews";

export type InterviewMode = "onsite" | "video" | "phone";
export type InterviewStatus = "scheduled" | "completed" | "cancelled";

export interface PortalInterview {
  _id: string;
  /** Lead Management link. Set for interviews created from `/dealflow-ai/leads`. */
  leadId: string | null;
  applicationId: string;
  title: string;
  round: string | null;
  mode: InterviewMode;
  scheduledAt: Date;
  durationMins: number;
  location: string | null;
  meetingLink: string | null;
  panel: string | null;
  status: InterviewStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedInterview extends Omit<PortalInterview, "scheduledAt" | "createdAt" | "updatedAt"> {
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
}

let idx = false;

async function collection() {
  const db = await getDb();
  const c = db.collection<PortalInterview>(INTERVIEWS_COLLECTION);
  if (!idx) {
    idx = true;
    await Promise.all([
      c.createIndex({ applicationId: 1, scheduledAt: 1 }).catch(() => {}),
      c.createIndex({ leadId: 1, scheduledAt: 1 }).catch(() => {}),
      c.createIndex({ scheduledAt: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

export function serializeInterview(i: PortalInterview): SerializedInterview {
  return {
    ...i,
    scheduledAt: i.scheduledAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export async function listInterviewsForApplication(applicationId: string): Promise<SerializedInterview[]> {
  const c = await collection();
  const rows = await c.find({ applicationId }).sort({ scheduledAt: 1 }).toArray();
  return rows.map(serializeInterview);
}

export async function listInterviewsForLead(leadId: string, applicationId: string | null): Promise<SerializedInterview[]> {
  const c = await collection();
  const or: Record<string, unknown>[] = [{ leadId }];
  if (applicationId) or.push({ applicationId });
  const rows = await c.find({ $or: or }).sort({ scheduledAt: 1 }).toArray();
  // de-dupe by _id (a row can match both clauses)
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r._id) && seen.add(r._id)).map(serializeInterview);
}

export interface InterviewWriteData {
  title: string;
  round?: string | null;
  mode: InterviewMode;
  scheduledAt: string; // ISO
  durationMins: number;
  location?: string | null;
  meetingLink?: string | null;
  panel?: string | null;
  notes?: string | null;
}

export async function createInterview(
  applicationId: string,
  data: InterviewWriteData,
  actorId: string,
  leadId: string | null = null
): Promise<PortalInterview> {
  const c = await collection();
  const now = new Date();
  const doc: PortalInterview = {
    _id: newId(),
    leadId,
    applicationId,
    title: data.title.trim(),
    round: data.round?.trim() || null,
    mode: data.mode,
    scheduledAt: new Date(data.scheduledAt),
    durationMins: Math.min(Math.max(Math.round(data.durationMins) || 45, 10), 240),
    location: data.location?.trim() || null,
    meetingLink: data.meetingLink?.trim() || null,
    panel: data.panel?.trim() || null,
    status: "scheduled",
    notes: data.notes?.trim() || null,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  await c.insertOne(doc);
  try {
    const { getLeadRecord } = await import("@/lib/lead-management/records");
    const lead = leadId ? await getLeadRecord(leadId) : null;
    await lmsEvents.interviewScheduled(lead ? { id: lead._id, name: lead.name, type: lead.type, ownerStaffId: lead.ownerStaffId } : null, doc.title, doc.scheduledAt, actorId);
  } catch {
    /* a notification must not fail the booking */
  }
  if (leadId) {
    try {
      const { sendActivityChatMessage } = await import("@/lib/lead-management/activity-notifier");
      await sendActivityChatMessage({
        leadId,
        activityType: "interview_scheduled",
        title: `Interview Scheduled: ${data.title.trim()}`,
        details: `Scheduled for ${new Date(data.scheduledAt).toLocaleString("en-IN")} (${data.mode}). Check the Interview Schedule section in your portal for link and instructions.`,
        actorStaffId: actorId,
      });
    } catch (err) {
      console.error("Failed to post interview chat message:", err);
    }
  }
  return doc;
}

export async function updateInterviewStatus(id: string, status: InterviewStatus): Promise<void> {
  const c = await collection();
  await c.updateOne({ _id: id }, { $set: { status, updatedAt: new Date() } });

  const iv = await c.findOne({ _id: id });
  if (iv?.leadId) {
    try {
      const { sendActivityChatMessage } = await import("@/lib/lead-management/activity-notifier");
      await sendActivityChatMessage({
        leadId: iv.leadId,
        activityType: "interview_scheduled",
        title: `Interview ${status === "completed" ? "Completed" : status === "cancelled" ? "Cancelled" : "Updated"}`,
        details: status === "completed" ? `Your interview "${iv.title}" has been marked completed.` : status === "cancelled" ? `Your interview "${iv.title}" has been cancelled.` : `Your interview "${iv.title}" status has been updated.`,
      });
    } catch {
      /* non-blocking */
    }
  }

  // Wallet & Credits: attending an interview round earns credits (best-effort; never affects the status change).
  if (status === "completed") {
    try {
      if (iv) {
        const { externalUsers } = await import("@/lib/portal-auth");
        const { awardActivity } = await import("@/lib/wallet/earn");
        const users = await externalUsers();
        const user = iv.applicationId ? await users.findOne({ applicationId: iv.applicationId }, { projection: { _id: 1, role: 1 } }) : null;
        if (user) await awardActivity({ userId: user._id, role: user.role, type: "interview_completed", key: id });
      }
    } catch {
      /* non-blocking */
    }
  }
}

export async function deleteInterview(id: string): Promise<void> {
  const c = await collection();
  await c.deleteOne({ _id: id });
}

/** For the "account exists?" badge on the staff careers page. */
export async function nextInterviewFor(applicationId: string): Promise<SerializedInterview | null> {
  const c = await collection();
  const row = await c
    .find({ applicationId, status: "scheduled", scheduledAt: { $gte: new Date() } })
    .sort({ scheduledAt: 1 })
    .limit(1)
    .next();
  return row ? serializeInterview(row) : null;
}
