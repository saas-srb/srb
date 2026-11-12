import "server-only";
import { clientPromise } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { maskEmail } from "@/lib/security/email-otp";

/**
 * STAFF-ONLY queue of people whose authenticator can't be opened ("two-step reset needed"). Filled quietly when such a person signs in
 * (they see only a calm "we couldn't verify this code" with recovery options); listed in Platform Console, Health, where staff reset them in
 * one click; staff get a Console notification and an audit event, and an email when an email provider exists. Cleared when the person is
 * reset or recovers. Never shown to customers.
 */

const COLLECTION = "platform_two_step_reset_needed";
const RENOTIFY_MS = 24 * 60 * 60_000;

export interface ResetNeeded {
  _id: string;
  companyId: string;
  adminId: string;
  email: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  seen: number;
  notifiedAt: Date | null;
}

async function col() {
  return (await clientPromise).db().collection<ResetNeeded>(COLLECTION);
}

export async function flagTwoStepResetNeeded(input: { companyId: string; adminId: string; email: string }): Promise<void> {
  const c = await col();
  const id = `${input.companyId}:${input.adminId}`;
  const now = new Date();
  const prev = await c.findOne({ _id: id });
  await c.updateOne({ _id: id }, { $set: { companyId: input.companyId, adminId: input.adminId, email: input.email, lastSeenAt: now }, $setOnInsert: { firstSeenAt: now, notifiedAt: null }, $inc: { seen: 1 } }, { upsert: true });
  if (prev?.notifiedAt && now.getTime() - prev.notifiedAt.getTime() < RENOTIFY_MS) return; // staff were told recently
  await c.updateOne({ _id: id }, { $set: { notifiedAt: now } });
  await recordPlatformAudit({ actorId: input.adminId, action: "two_step.unreadable_detected", companyId: input.companyId, target: { type: "admin_user", id: input.adminId }, details: { email: maskEmail(input.email) } }).catch(() => {});
  await notifyStaff(input.companyId, input.email).catch(() => {});
}

async function notifyStaff(companyId: string, email: string): Promise<void> {
  const db = (await clientPromise).db();
  const owner = await db.collection<{ _id: string; name?: string }>("companies").findOne({ isPlatformOwner: true } as never, { projection: { _id: 1 } });
  const company = await db.collection<{ _id: string; name?: string }>("companies").findOne({ _id: companyId }, { projection: { name: 1 } });
  if (!owner) return;
  const { runAsCompany } = await import("@/lib/platform/tenancy/context");
  const { notify } = await import("@/lib/platform/notifications");
  await runAsCompany(owner._id, () => notify({ to: { role: "super_admin" }, title: "Two-step reset needed", body: `${maskEmail(email)} (${company?.name ?? companyId}) can't use their authenticator. Reset it in Console, Health.`, url: "/console/health" }));
  // Email to platform staff when an email provider exists (best effort).
  const { resolveEmailConfig } = await import("@/lib/platform/integrations/resolve");
  const cfg = await resolveEmailConfig().catch(() => null);
  if (!cfg || cfg.provider !== "resend" || !cfg.resendApiKey) return;
  const staff = await runAsCompany(owner._id, async () => (await (await import("@/lib/mongodb")).getDb()).collection("admin_users").find({ roles: "super_admin" }, { projection: { email: 1 } }).limit(5).toArray());
  const { sendEmail } = await import("@/lib/platform/email");
  const { renderEmail } = await import("@/lib/platform/email/template");
  const { html, text } = renderEmail({ brand: "Platform Console", heading: "Two-step reset needed", paragraphs: [`${maskEmail(email)} (${company?.name ?? companyId}) can't use their authenticator and was offered recovery options. Reset their two-step in Console, Health.`] });
  for (const s of staff) if (s.email) await sendEmail({ to: String(s.email), subject: "Two-step reset needed", html, text, event: "platform_two_step_reset_needed" }).catch(() => {});
}

export async function listTwoStepResetNeeded(limit = 50): Promise<ResetNeeded[]> {
  return (await col()).find({}).sort({ lastSeenAt: -1 }).limit(limit).toArray();
}

export async function clearTwoStepFlag(companyId: string, adminId: string): Promise<void> {
  await (await col()).deleteOne({ _id: `${companyId}:${adminId}` }).catch(() => {});
}
