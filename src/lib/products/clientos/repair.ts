import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { hashPassword } from "@/lib/lms-auth";
import { externalUsers, type ExternalUserDoc } from "@/lib/portal-auth";
import { normalizePhone } from "@/lib/products/clientos/db";
import { isPortalRole } from "@/lib/portal-roles";
import type { LeadRecord } from "@/lib/lead-management/types";

/**
 * Portal accounts for people the company already has on file.
 *
 * A lead (and its career application) can exist without the portal account it points to — for example when data was brought over
 * from another system without its `external_users`. The person then can't sign in and staff can't "log in as" them. These helpers
 * put the account back under the id the lead already references, so every link (lead, timeline, messages, documents) keeps working.
 * Nobody is told a password: the account gets an unusable one and the person sets their own at /clientos/forgot-password (email + phone).
 */

const LEADS = "lead_records";
const APPLICATIONS = "career_applications";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const unusablePassword = () => hashPassword(randomBytes(24).toString("hex"));

function accountFromLead(lead: LeadRecord): ExternalUserDoc & { leadId: string | null; activeLeadId: string | null } {
  const now = new Date();
  return {
    _id: lead.externalUserId,
    email: lead.email.trim().toLowerCase(),
    phone: (lead.phone ?? "").trim(),
    passwordHash: unusablePassword(),
    role: isPortalRole(lead.type) ? lead.type : "job_applicant",
    applicationId: lead.applicationId ?? null,
    studentId: lead.studentId ?? null,
    clientId: lead.clientId ?? null,
    displayName: lead.name?.trim() || lead.email.split("@")[0],
    status: "active",
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    createdAt: lead.createdAt ?? now,
    updatedAt: now,
    lastLoginAt: null,
    leadId: lead._id,
    activeLeadId: lead._id,
    referralCode: null,
    referredByCode: null,
    // Marks a stand-in made by this module: scripts/restore-portal-data.ts may replace it with the original account (nothing else).
    restoredByRepair: true,
  } as ExternalUserDoc & { leadId: string | null; activeLeadId: string | null };
}

export interface RepairResult {
  leadsChecked: number;
  /** Accounts recreated under the id their lead already pointed at. */
  recreated: number;
  /** Leads re-pointed at an account that already existed under their email. */
  relinked: number;
  /** Applications that had neither a lead nor an account (a lead + account were created). */
  provisioned: number;
  failed: number;
}

/** Every lead of the current company whose portal account is missing gets it back; applications without any record get one too. */
export async function repairPortalAccounts(): Promise<RepairResult> {
  const db = await getDb();
  const users = await externalUsers();
  const result: RepairResult = { leadsChecked: 0, recreated: 0, relinked: 0, provisioned: 0, failed: 0 };

  const leads = await db.collection<LeadRecord>(LEADS).find({ deletedAt: null }).sort({ createdAt: 1 }).toArray();
  for (const lead of leads) {
    result.leadsChecked++;
    try {
      if (await users.findOne({ _id: lead.externalUserId }, { projection: { _id: 1 } })) continue;
      const email = (lead.email ?? "").trim().toLowerCase();
      if (!emailRe.test(email)) {
        result.failed++;
        continue;
      }
      const sameEmail = await users.findOne({ email });
      if (sameEmail) {
        await db.collection<LeadRecord>(LEADS).updateOne({ _id: lead._id }, { $set: { externalUserId: sameEmail._id, updatedAt: new Date() } });
        await users.updateOne({ _id: sameEmail._id, leadId: { $in: [null, undefined] } }, { $set: { leadId: lead._id, activeLeadId: lead._id, updatedAt: new Date() } });
        result.relinked++;
        continue;
      }
      await users.insertOne(accountFromLead({ ...lead, email }));
      result.recreated++;
    } catch (err) {
      result.failed++;
      console.error("[portal-repair] lead", lead._id, err);
    }
  }

  // Applications nobody ever created a lead / account for.
  const { provisionLeadAndAccount } = await import("@/lib/lead-management/provision");
  const apps = await db.collection<{ _id: unknown; name: string; email: string; phone: string; positionTitle?: string; coverNote?: string }>(APPLICATIONS).find({}).toArray();
  for (const app of apps) {
    const id = String(app._id);
    try {
      const email = (app.email ?? "").trim().toLowerCase();
      if (!emailRe.test(email)) continue;
      if (await db.collection(LEADS).findOne({ applicationId: id, deletedAt: null }, { projection: { _id: 1 } })) continue;
      if (await users.findOne({ $or: [{ applicationId: id }, { email }] }, { projection: { _id: 1 } })) continue;
      await provisionLeadAndAccount({
        source: "job_portal",
        quiet: true,
        name: app.name,
        email,
        phone: app.phone,
        subService: app.positionTitle ?? null,
        message: app.coverNote ?? null,
        sourceRef: { kind: "career_application", id },
        applicationId: id,
      });
      result.provisioned++;
    } catch (err) {
      result.failed++;
      console.error("[portal-repair] application", id, err);
    }
  }
  return result;
}

/**
 * Self-service: someone proves who they are with the email and phone on file (the same bar as registration) and has a lead but no
 * account. Recreates it so the "forgot password" step can finish. Null when nothing on file matches.
 */
export async function restoreAccountFor(emailRaw: string, phoneRaw: string): Promise<ExternalUserDoc | null> {
  const email = emailRaw.trim().toLowerCase();
  const phone = normalizePhone(phoneRaw);
  if (!emailRe.test(email) || phone.length < 7) return null;
  const db = await getDb();
  const users = await externalUsers();
  const existing = await users.findOne({ email });
  if (existing) return existing;
  const leads = await db.collection<LeadRecord>(LEADS).find({ email, deletedAt: null }).sort({ createdAt: 1 }).toArray();
  const lead = leads.find((l) => normalizePhone(l.phone ?? "") === phone);
  if (!lead) return null;
  try {
    const doc = accountFromLead(lead);
    await users.insertOne(doc);
    // Any other lead of the same person pointing at a missing account follows.
    for (const other of leads) {
      if (other._id !== lead._id && other.externalUserId !== doc._id && !(await users.findOne({ _id: other.externalUserId }, { projection: { _id: 1 } }))) {
        await db.collection<LeadRecord>(LEADS).updateOne({ _id: other._id }, { $set: { externalUserId: doc._id, updatedAt: new Date() } });
      }
    }
    return doc;
  } catch {
    return users.findOne({ email });
  }
}

/** A new account (self-registration) takes over the person's leads whose account is missing, so their history is not orphaned. */
export async function adoptOrphanLeads(userId: string, emailRaw: string): Promise<number> {
  const email = emailRaw.trim().toLowerCase();
  const db = await getDb();
  const users = await externalUsers();
  let adopted = 0;
  const leads = await db.collection<LeadRecord>(LEADS).find({ email, deletedAt: null, externalUserId: { $ne: userId } }).sort({ createdAt: 1 }).toArray();
  for (const lead of leads) {
    if (await users.findOne({ _id: lead.externalUserId }, { projection: { _id: 1 } })) continue;
    await db.collection<LeadRecord>(LEADS).updateOne({ _id: lead._id }, { $set: { externalUserId: userId, updatedAt: new Date() } });
    if (adopted === 0) await users.updateOne({ _id: userId }, { $set: { leadId: lead._id, activeLeadId: lead._id, updatedAt: new Date() } });
    adopted++;
  }
  return adopted;
}

