"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { adoptEnvironment, adoptedSummary } from "@/lib/platform/adopt";
import { ensureLegacyCopy, legacyCopyStatus, runLegacyCopyTick, type FileCopyView } from "@/lib/storage/blob-to-gridfs";

/** "Import from environment": copies what this deployment's environment provides and the database lacks. Never overwrites. */
export async function importFromEnvironmentAction(): Promise<{ ok: true; adopted: string[]; total: number } | { ok: false; error: string }> {
  const user = await requirePlatformPermission("integrations.manage");
  const res = await adoptEnvironment({ actorId: user.id, trigger: "manual" });
  revalidatePath("/console", "layout");
  return { ok: true, adopted: res.adopted, total: res.total };
}

export async function adoptedSummaryAction() {
  await requirePlatformPermission("integrations.read");
  return adoptedSummary();
}

/** Looks at the old Blob store again and copies what is missing from the database (about 40 seconds per call). */
export async function fileCopyTickAction(restart: boolean): Promise<FileCopyView> {
  await requirePlatformPermission("integrations.manage");
  if (restart) await ensureLegacyCopy(true);
  const v = await runLegacyCopyTick(40_000);
  return v;
}

export async function fileCopyStatusAction(): Promise<FileCopyView> {
  await requirePlatformPermission("integrations.read");
  return legacyCopyStatus();
}

// ── Encryption key management (platform owner only, re-authenticated) ─────────

import { requirePlatformAdmin } from "@/lib/platform/console/access";
import { hasFreshReauth } from "@/lib/security/second-step-server";
import { addPreviousKey, computeKeyHealth, revealActiveKey, rotateKey, setRecoveryPassphrase, type KeyHealth } from "@/lib/platform/keyring/manage";
import { recordPlatformAudit } from "@/lib/platform/audit";

type Err = { ok: false; error: string };
/** One re-authentication mechanism for every sensitive area (see ReAuthGate): password plus a second-step method, fresh within the policy window. */
const fresh = async (userId: string): Promise<{ ok: true; via: string } | Err> => ((await hasFreshReauth(userId)) ? { ok: true, via: "fresh-reauth" } : { ok: false, error: "Please confirm it's you first." });

export async function keyHealthAction(): Promise<KeyHealth> {
  await requirePlatformPermission("integrations.read");
  return computeKeyHealth();
}

export async function addPreviousKeyAction(input: { key: string }): Promise<{ ok: true; opened: number } | Err> {
  const user = await requirePlatformAdmin();
  const re = await fresh(user.id);
  if (!re.ok) return re;
  const res = await addPreviousKey(String(input?.key ?? "").trim());
  await recordPlatformAudit({ actorId: user.id, action: "keyring.add_previous_key", target: { type: "keyring", id: "keyring" }, details: { ok: res.ok, via: re.via } });
  revalidatePath("/console", "layout");
  return res;
}

/** Shows the active key ONCE after re-authentication. */
export async function revealKeyAction(input?: Record<string, never>): Promise<{ ok: true; key: string } | Err> {
  const user = await requirePlatformAdmin();
  const re = await fresh(user.id);
  if (!re.ok) return re;
  const key = await revealActiveKey(user.id);
  await recordPlatformAudit({ actorId: user.id, action: "keyring.backup_revealed", target: { type: "keyring", id: "keyring" }, details: { via: re.via } });
  revalidatePath("/console", "layout");
  return key ? { ok: true, key } : { ok: false, error: "There is no active key." };
}

export async function setPassphraseAction(input: { passphrase: string }): Promise<{ ok: true } | Err> {
  const user = await requirePlatformAdmin();
  const re = await fresh(user.id);
  if (!re.ok) return re;
  const res = await setRecoveryPassphrase(String(input?.passphrase ?? ""));
  await recordPlatformAudit({ actorId: user.id, action: "keyring.passphrase_set", target: { type: "keyring", id: "keyring" }, details: { ok: res.ok, via: re.via } });
  return res;
}

export async function rotateKeyAction(input?: Record<string, never>): Promise<{ ok: true } | Err> {
  const user = await requirePlatformAdmin();
  const re = await fresh(user.id);
  if (!re.ok) return re;
  const res = await rotateKey();
  await recordPlatformAudit({ actorId: user.id, action: "keyring.rotated", target: { type: "keyring", id: "keyring" }, details: { ok: res.ok, via: re.via } });
  revalidatePath("/console", "layout");
  return res;
}

/** Platform staff resets a company admin's two-step (lost device, or a key mismatch): audited, the person is told by email and sets it up again. */
export async function resetCompanyTwoStepAction(input: { company: string; email: string }): Promise<{ ok: true; message: string } | Err> {
  const user = await requirePlatformPermission("companies.manage");
  const { getPlatformDb } = await import("@/lib/platform/tenancy/platform-db");
  const { runAsCompany } = await import("@/lib/platform/tenancy/context");
  const { getDb } = await import("@/lib/mongodb");
  const { recoverTwoStep } = await import("@/lib/security/two-factor");
  const { sendRecoveryNotice } = await import("@/lib/hub-auth");
  const key = String(input?.company ?? "").trim().toLowerCase();
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!key || !email) return { ok: false, error: "Enter the company (its slug or id) and the person's email." };
  const company = await (await getPlatformDb()).collection<{ _id: string; slug: string; name: string }>("companies").findOne({ $or: [{ _id: key }, { slug: key }] });
  if (!company) return { ok: false, error: "No such company." };
  const found = await runAsCompany(company._id, async () => {
    const u = await (await getDb()).collection("admin_users").findOne({ email });
    if (!u) return null;
    await recoverTwoStep(u._id);
    return { id: String(u._id), email: String(u.email) };
  });
  if (!found) return { ok: false, error: `No user ${email} in ${company.name}.` };
  await recordPlatformAudit({ actorId: user.id, action: "two_step.staff_reset", companyId: company._id, target: { type: "admin_user", id: found.id }, details: { email } });
  await sendRecoveryNotice(found.email, "staff_reset");
  return { ok: true, message: `Two-step was reset for ${email}. They set it up again at their next sign-in.` };
}

// ── Second-step policy (platform default, optional per-company override) ──────

import { getSecondStepPolicy, saveCompanyPolicy, savePlatformPolicy } from "@/lib/security/second-step-server";
import type { SecondStepPolicy } from "@/lib/security/second-step";

export async function secondStepPolicyAction(): Promise<SecondStepPolicy> {
  await requirePlatformPermission("integrations.read");
  return getSecondStepPolicy("");
}

export async function saveSecondStepPolicyAction(patch: Partial<SecondStepPolicy>): Promise<{ ok: true; policy: SecondStepPolicy } | Err> {
  const user = await requirePlatformPermission("integrations.manage");
  if (patch.smsAllowed && !(await (await import("@/lib/security/sms-otp")).smsConfigured())) return { ok: false, error: "Set up Twilio and the SMS sender in Integrations (SMS sign-in codes) before allowing SMS codes." };
  const policy = await savePlatformPolicy({ emailAllowed: Boolean(patch.emailAllowed), smsAllowed: Boolean(patch.smsAllowed), requireForAdmins: Boolean(patch.requireForAdmins), trustDeviceAllowed: Boolean(patch.trustDeviceAllowed), trustDeviceDays: Number(patch.trustDeviceDays), reauthMinutes: Number(patch.reauthMinutes) }, user.id);
  return { ok: true, policy };
}

/** A company's own override (or `null` to go back to the platform default). */
export async function saveCompanySecondStepPolicyAction(input: { company: string; patch: Partial<SecondStepPolicy> | null }): Promise<{ ok: true } | Err> {
  const user = await requirePlatformPermission("companies.manage");
  const { getPlatformDb } = await import("@/lib/platform/tenancy/platform-db");
  const key = String(input?.company ?? "").trim().toLowerCase();
  const company = await (await getPlatformDb()).collection<{ _id: string }>("companies").findOne({ $or: [{ _id: key }, { slug: key }] } as never);
  if (!company) return { ok: false, error: "No such company." };
  await saveCompanyPolicy(company._id, input.patch, user.id);
  return { ok: true };
}
