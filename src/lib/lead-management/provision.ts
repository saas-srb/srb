import "server-only";
import { randomInt } from "node:crypto";
import { hashPassword } from "@/lib/lms-auth";
import { externalUsers, type ExternalUserDoc } from "@/lib/portal-auth";
import { newId } from "@/lib/products/clientos/db";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { sendActivityChatMessage } from "@/lib/lead-management/activity-notifier";
import { recordPortalAudit } from "@/lib/products/clientos/audit";
import { PORTAL_ROLE_META } from "@/lib/portal-roles";
import { createLeadRecord } from "@/lib/lead-management/records";
import { recordLeadEvent } from "@/lib/lead-management/timeline";
import { LEAD_SOURCE_META } from "@/lib/lead-management/types";
import type { LeadManagementSource, LeadRecord, LeadSourceRef, LeadType } from "@/lib/lead-management/types";
import { awardSignupBonus } from "@/lib/wallet/signup-bonus";
import { attributeAndRewardReferral } from "@/lib/wallet/referrals";
import { resolveReferralCode } from "@/lib/wallet/referral-capture";

/**
 * The heart of the lead-driven portal: turn any website form submission into a
 * Lead + a portal account the person is immediately logged into. Called from the
 * two public intake routes (`/api/careers/apply`, `/api/leads/[category]`) and
 * from the staff "manual lead" form.
 */

const PW_WORDS = ["Orbit", "Nova", "Comet", "Solar", "Lunar", "Pulse", "Vega", "Astra", "Photon", "Quasar"];

export function generateTempPassword(): string {
  const word = PW_WORDS[randomInt(PW_WORDS.length)];
  const n = randomInt(1000, 9999);
  const sym = "!@#$%&*"[randomInt(7)];
  return `${word}${n}${sym}`;
}

export interface ProvisionInput {
  source: LeadManagementSource;
  type?: LeadType; // defaults to LEAD_SOURCE_META[source].type
  name: string;
  email: string;
  phone: string;
  subService?: string | null;
  message?: string | null;
  sourceRef?: LeadSourceRef | null;
  applicationId?: string | null;
  actorId?: string | null; // set for manual (staff) leads
  /** Self-serve signup: the person's own chosen password. When set, no temp password is generated. */
  password?: string | null;
  referralCode?: string | null; // Wallet & Credits — first-touch `?ref=` capture, only applied on a brand-new account
  /**
   * Bulk import: the lead still gets the account record the pipeline links to,
   * but nothing the person would see or receive — no wallet sign-up bonus or
   * referral reward, no welcome notification or chat message.
   */
  quiet?: boolean;
}

export interface ProvisionResult {
  leadId: string;
  leadCode: string;
  externalUserId: string;
  role: LeadType;
  tempPassword: string | null;
  isNewAccount: boolean;
}

export async function provisionLeadAndAccount(input: ProvisionInput): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const type = input.type ?? LEAD_SOURCE_META[input.source].type;
  const users = await externalUsers();

  const existing = await users.findOne({ email });
  let externalUserId: string;
  let tempPassword: string | null = null;
  let isNewAccount = false;
  let referralCode: string | null = null;
  let role: LeadType;

  if (existing) {
    externalUserId = existing._id;
    role = existing.role;
  } else {
    isNewAccount = true;
    // Posted code wins, else the first-touch cookie from proxy.ts. Never for staff-entered leads — that cookie would be the staff member's browser's.
    referralCode = input.actorId ? null : await resolveReferralCode(input.referralCode);
    tempPassword = input.password ? null : generateTempPassword();
    role = type;
    const now = new Date();
    const doc: ExternalUserDoc & { leadId: string | null; activeLeadId: string | null } = {
      _id: newId(),
      email,
      phone: input.phone.trim(),
      passwordHash: hashPassword(input.password ?? tempPassword ?? generateTempPassword()),
      role,
      applicationId: input.applicationId ?? null,
      studentId: null,
      clientId: null,
      displayName: input.name.trim() || email.split("@")[0],
      status: "active",
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      leadId: null,
      activeLeadId: null,
      referralCode: null,
      referredByCode: referralCode,
    };
    await users.insertOne(doc);
    externalUserId = doc._id;
  }

  const lead: LeadRecord = await createLeadRecord({
    type,
    source: input.source,
    name: input.name,
    email,
    phone: input.phone,
    subService: input.subService ?? null,
    message: input.message ?? null,
    externalUserId,
    sourceRef: input.sourceRef ?? null,
    applicationId: input.applicationId ?? null,
    actorId: input.actorId ?? null,
  });

  // Point the account at this lead. First lead becomes the primary link; every
  // submission makes its lead the active one the portal dashboard renders.
  const set: Record<string, unknown> = { activeLeadId: lead._id, updatedAt: new Date() };
  if (!existing?.leadId) set.leadId = lead._id;
  if (input.applicationId && !existing?.applicationId) set.applicationId = input.applicationId;
  await users.updateOne({ _id: externalUserId }, { $set: set });

  if (isNewAccount && !input.quiet) {
    await recordLeadEvent(lead._id, {
      kind: "account_created",
      title: "Portal account created",
      detail: `Signed in automatically from the ${LEAD_SOURCE_META[input.source].label} form.`,
      actor: "system",
      visibleToLead: true,
    });
    // Wallet & Credits — fire-and-forget-ish, but awaited so a signup bonus
    // is reliably present the moment the visitor lands on /portal. Never
    // blocks or fails the actual account/lead creation above.
    try {
      await awardSignupBonus(externalUserId, role);
      await attributeAndRewardReferral(referralCode, externalUserId, role);
    } catch (walletErr) {
      console.error("Wallet signup/referral reward failed (account still created)", walletErr);
    }
  }
  await recordLeadEvent(lead._id, {
    kind: "lead_submitted",
    title: `${LEAD_SOURCE_META[input.source].label} submitted`,
    detail: input.subService ? `Interest: ${input.subService}` : null,
    actor: input.actorId ? "staff" : "applicant",
    actorId: input.actorId ?? null,
    visibleToLead: true,
  });

  if (!input.quiet) {
    await notifyPortalUser({
      recipientUserId: externalUserId,
      type: "welcome",
      title: isNewAccount ? `Welcome to the ${PORTAL_ROLE_META[role].portalName}` : "We received your submission",
      body: isNewAccount
        ? "Your account is ready. Track everything here — it updates live as our team progresses your request."
        : `A new request (${lead.code}) has been added to your portal.`,
      link: "/clientos",
    });
    await sendActivityChatMessage({
      leadId: lead._id,
      activityType: "welcome",
      title: isNewAccount ? `Welcome to your ${PORTAL_ROLE_META[role].portalName}` : `Submission Received (${lead.code})`,
      stageKey: lead.stage,
      details: isNewAccount
        ? "Your account is active. Track your progress, send messages, and receive real-time updates directly in this thread."
        : `Your new request (${lead.code}) has been received and added to your portal timeline.`,
      actorStaffId: input.actorId ?? null,
    });
  }
  await recordPortalAudit({
    actorId: externalUserId,
    action: isNewAccount ? "register" : "lead_added",
    entity: "lead",
    entityId: lead._id,
    summary: `${input.source} · ${lead.code}`,
  });

  return {
    leadId: lead._id,
    leadCode: lead.code,
    externalUserId,
    role,
    tempPassword,
    isNewAccount,
  };
}
