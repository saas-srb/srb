import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getApplication, APPLICATIONS_COLLECTION, type CareerApplication } from "@/lib/career-applications";
import { listInterviewsForApplication } from "@/lib/products/clientos/interviews";
import { listLeadTimeline } from "@/lib/lead-management/timeline";
import { listLeadMessages } from "@/lib/lead-management/messages";
import { stageMeta } from "@/lib/lead-management/workflows";
import { LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { PORTAL_DOCS_COLLECTION, type PortalDocument } from "@/lib/products/clientos/documents";
import { AUDIT_COLLECTION as PORTAL_AUDIT_COLLECTION, type PortalAuditLog } from "@/lib/products/clientos/audit";
import { getOfferByApplication } from "@/lib/products/talentos/offers";
import { EMPLOYEES_COLLECTION, employeeFullName, type Employee } from "@/lib/products/talentos/employees";
import { getWallet } from "@/lib/wallet/wallets";
import type { LeadRecord, SerializedLeadMessage, SerializedLeadTimelineEvent } from "@/lib/lead-management/types";
import type { ExternalUserDoc } from "@/lib/portal-auth";

/**
 * Everything the platform knows about one job applicant, for the LMS
 * applicant profile. Read-only and assembled live from the modules that own
 * each piece — Careers (the application and other applications by the same
 * email), Lead Management (lead, journey timeline, portal + internal
 * messages, message attachments), the External Portal (account, shared
 * documents, activity), HRMS (offer, employee record once hired) and the
 * Wallet. Nothing is copied; the profile links back to each owner for actions.
 */

export interface ProfileLead {
  id: string;
  code: string;
  stage: string;
  stageLabel: string;
  status: string;
  createdAt: string;
  timeline: SerializedLeadTimelineEvent[];
  portalMessages: SerializedLeadMessage[];
  internalMessages: SerializedLeadMessage[];
}

export interface ProfileFile {
  id: string;
  name: string;
  size: number;
  contentType: string;
  category: string;
  source: "portal_document" | "message_attachment";
  sharedBy: "staff" | "applicant";
  createdAt: string;
  href: string;
}

export interface ApplicantProfile {
  application: CareerApplication & { _id: ObjectId };
  otherApplications: { id: string; positionTitle: string; status: string; createdAt: string }[];
  account: {
    id: string;
    email: string;
    phone: string;
    role: string;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
    mustChangePassword: boolean;
    locked: boolean;
    referralCode: string | null;
    referredByCode: string | null;
  } | null;
  leads: ProfileLead[];
  interviews: Awaited<ReturnType<typeof listInterviewsForApplication>>;
  files: ProfileFile[];
  offer: {
    id: string;
    status: string;
    positionTitle: string;
    offerDate: string | null;
    proposedJoiningDate: string | null;
    annualCtc: number | null;
    notes: string | null;
  } | null;
  employee: { id: string; name: string; code: string; status: string; joiningDate: string | null } | null;
  wallet: { available: number; pending: number; lifetimeEarned: number; lifetimeRedeemed: number; status: string } | null;
  activity: { id: string; action: string; entity: string; summary: string | null; ip: string | null; createdAt: string }[];
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const ci = (v: string) => new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

export async function getApplicantProfile(id: string): Promise<ApplicantProfile | null> {
  const application = (await getApplication(id)) as (CareerApplication & { _id: ObjectId }) | null;
  if (!application) return null;
  const db = await getDb();
  const appId = application._id.toString();

  // The portal account linked to this application; fall back to the same email (one person, several applications).
  const users = db.collection<ExternalUserDoc>("external_users");
  const account = (await users.findOne({ applicationId: appId })) ?? (application.email ? await users.findOne({ email: application.email.toLowerCase() }) : null);

  const [others, leadDocs, interviews, offer, employee, wallet] = await Promise.all([
    application.email
      ? db
          .collection<CareerApplication>(APPLICATIONS_COLLECTION)
          .find({ email: ci(application.email), _id: { $ne: application._id } }, { projection: { positionTitle: 1, status: 1, createdAt: 1 } })
          .sort({ createdAt: -1 })
          .toArray()
      : Promise.resolve([]),
    db
      .collection<LeadRecord>(LEAD_RECORDS_COLLECTION)
      .find({ deletedAt: null, $or: [{ applicationId: appId }, ...(account ? [{ externalUserId: account._id, type: "job_applicant" as const }] : [])] })
      .sort({ createdAt: -1 })
      .toArray(),
    listInterviewsForApplication(appId),
    getOfferByApplication(appId).catch(() => null),
    db.collection<Employee>(EMPLOYEES_COLLECTION).findOne({ "recruitment.applicationId": appId, deletedAt: null }),
    account ? getWallet(account._id).catch(() => null) : Promise.resolve(null),
  ]);

  const leads: ProfileLead[] = await Promise.all(
    leadDocs.map(async (l) => {
      const [timeline, portalMessages, internalMessages] = await Promise.all([listLeadTimeline(l._id), listLeadMessages(l._id, { visibility: "portal" }), listLeadMessages(l._id, { visibility: "internal" })]);
      return { id: l._id, code: l.code, stage: l.stage, stageLabel: stageMeta(l.type, l.stage)?.label ?? l.stage, status: l.status, createdAt: l.createdAt.toISOString(), timeline, portalMessages, internalMessages };
    })
  );

  const files: ProfileFile[] = [];
  if (account) {
    const docs = await db.collection<PortalDocument>(PORTAL_DOCS_COLLECTION).find({ ownerUserId: account._id, deletedAt: null }).sort({ createdAt: -1 }).toArray();
    for (const d of docs)
      files.push({ id: d._id, name: d.name, size: d.size, contentType: d.contentType, category: d.category, source: "portal_document", sharedBy: "staff", createdAt: d.createdAt.toISOString(), href: `/api/dealflow-ai/applicants/${appId}/documents/${d._id}` });
  }
  for (const l of leads)
    for (const m of [...l.portalMessages, ...l.internalMessages])
      for (const a of m.attachments)
        files.push({ id: a.storageKey, name: a.filename, size: a.size, contentType: a.contentType, category: m.visibility === "internal" ? "Internal note attachment" : "Message attachment", source: "message_attachment", sharedBy: m.authorType === "portal" ? "applicant" : "staff", createdAt: m.createdAt, href: `/api/lead-messages/files/${encodeURIComponent(a.storageKey)}` });
  files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const activity = account
    ? (await db.collection<PortalAuditLog>(PORTAL_AUDIT_COLLECTION).find({ actorId: account._id }).sort({ createdAt: -1 }).limit(50).toArray()).map((a) => ({ id: a._id, action: String(a.action), entity: a.entity, summary: a.summary, ip: a.ip, createdAt: a.createdAt.toISOString() }))
    : [];

  return {
    application,
    otherApplications: others.map((o) => ({ id: String(o._id), positionTitle: o.positionTitle, status: o.status, createdAt: o.createdAt.toISOString() })),
    account: account
      ? {
          id: account._id,
          email: account.email,
          phone: account.phone,
          role: account.role,
          status: account.status,
          createdAt: account.createdAt.toISOString(),
          lastLoginAt: iso(account.lastLoginAt),
          mustChangePassword: account.mustChangePassword === true,
          locked: !!account.lockedUntil && account.lockedUntil > new Date(),
          referralCode: account.referralCode ?? null,
          referredByCode: account.referredByCode ?? null,
        }
      : null,
    leads,
    interviews,
    files,
    offer: offer ? { id: offer._id, status: offer.status, positionTitle: offer.positionTitle, offerDate: offer.offerDate, proposedJoiningDate: offer.proposedJoiningDate, annualCtc: offer.annualCtc, notes: offer.notes } : null,
    employee: employee ? { id: employee._id, name: employeeFullName(employee), code: employee.employeeCode, status: employee.status, joiningDate: employee.professional?.joiningDate ?? null } : null,
    wallet: wallet ? { available: wallet.balances.available, pending: wallet.balances.pending, lifetimeEarned: wallet.balances.lifetimeEarned, lifetimeRedeemed: wallet.balances.lifetimeRedeemed, status: wallet.status } : null,
    activity,
  };
}

/** A portal document belongs to this applicant's portal account (staff download gate). */
export async function applicantDocument(applicationId: string, docId: string): Promise<PortalDocument | null> {
  const profile = await getApplication(applicationId);
  if (!profile) return null;
  const db = await getDb();
  const users = db.collection<ExternalUserDoc>("external_users");
  const account = (await users.findOne({ applicationId })) ?? (profile.email ? await users.findOne({ email: profile.email.toLowerCase() }) : null);
  if (!account) return null;
  return db.collection<PortalDocument>(PORTAL_DOCS_COLLECTION).findOne({ _id: docId, ownerUserId: account._id, deletedAt: null });
}
