import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { ObjectId } from "mongodb";
import QRCode from "qrcode";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { canOpenPlatformSecret, decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, type EncryptedValue } from "@/lib/platform/crypto";
import { newTotpSecret, otpauthUri, verifyTotp } from "@/lib/security/totp";
import { getCompanyBrand } from "@/lib/platform/branding";
import { checkEmailCode } from "@/lib/security/email-otp";

/**
 * Two-step sign-in, chosen by each person for their own account (Profile & Settings): off, an authenticator app, or a code sent by email.
 * One method at a time. From then on a password alone does not sign them in: the six-digit code (or, for the app, one of ten single-use
 * recovery codes) is needed too. Nothing else switches it on or off for them.
 * The app method: The secret is encrypted at rest, a code works once,
 * wrong codes count towards the same lock-out as wrong passwords, and a Director can switch it off for someone who lost their device.
 */
interface TwoFactorDoc {
  secret: EncryptedValue;
  enabledAt: Date;
  lastStep: number;
  /** SHA-256 of each unused recovery code. */
  recovery: string[];
}
interface Pending { secret: EncryptedValue; at: Date }
interface UserTf { _id: ObjectId; email: string; twoFactor?: TwoFactorDoc | null; twoFactorPending?: Pending | null; twoFactorEmail?: { enabledAt: Date } | null; twoFactorSkipUntil?: Date | null; twoFactorForced?: boolean | null; secondStep?: { preferred?: "app" | "email" | null; recovery?: string[]; trusted?: { hash: string; expiresAt: Date; label?: string; createdAt?: Date }[] } | null }

export type TwoStepMethod = "app" | "email";

const SETUP_TTL_MS = 15 * 60_000;
export const newRecoveryCodes = (): string[] => Array.from({ length: 10 }, () => randomBytes(5).toString("hex").replace(/(.{5})(.{5})/, "$1-$2"));
const hashCode = (c: string) => createHash("sha256").update(c.trim().toLowerCase().replace(/[\s-]/g, "")).digest("hex");
const ctx = async (adminId: ObjectId | string) => `2fa:${await currentCompanyId()}:${String(adminId)}`;
const users = async () => (await getDb()).collection<UserTf>("admin_users");

export function twoFactorAvailable(): boolean {
  return isPlatformEncryptionConfigured();
}

export function hasTwoFactor(user: { twoFactor?: unknown; twoFactorEmail?: unknown } | null | undefined): boolean {
  return !!user && (!!user.twoFactor || !!user.twoFactorEmail);
}

export interface TwoStepStatus {
  /** Any method is on. */
  enabled: boolean;
  /** The preferred (or only) method; kept for older callers. */
  method: TwoStepMethod | null;
  /** Every method that is on. */
  methods: TwoStepMethod[];
  enabledAt: Date | null;
  recoveryLeft: number;
  preferred: TwoStepMethod | null;
  /** The authenticator app needs the platform's encryption key; the email method does not. */
  available: boolean;
}

export async function twoFactorStatus(adminId: ObjectId): Promise<TwoStepStatus> {
  const u = await (await users()).findOne({ _id: adminId }, { projection: { twoFactor: 1, twoFactorEmail: 1, secondStep: 1 } });
  const methods: TwoStepMethod[] = [...(u?.twoFactor ? (["app"] as const) : []), ...(u?.twoFactorEmail ? (["email"] as const) : [])];
  const pref = u?.secondStep?.preferred && methods.includes(u.secondStep.preferred) ? u.secondStep.preferred : null;
  return { enabled: methods.length > 0, method: pref ?? methods[0] ?? null, methods, enabledAt: u?.twoFactor?.enabledAt ?? u?.twoFactorEmail?.enabledAt ?? null, recoveryLeft: (u?.twoFactor?.recovery.length ?? 0) + (u?.secondStep?.recovery?.length ?? 0), preferred: pref, available: twoFactorAvailable() };
}

/** Turns on the email method once the person has typed the code that was just sent to their address. */
export async function enableEmailTwoFactor(adminId: ObjectId, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const col = await users();
  const u = await col.findOne({ _id: adminId }, { projection: { twoFactor: 1, twoFactorEmail: 1 } });
  if (u?.twoFactorEmail) return { ok: true };
  if (!(await checkEmailCode(adminId, "enable", code))) return { ok: false, error: "That code isn't right or has expired. Ask for a new one." };
  await col.updateOne({ _id: adminId }, { $set: { twoFactorEmail: { enabledAt: new Date() } }, $unset: { twoFactorPending: "" } });
  return { ok: true };
}

/** Turns the email method off after the code that was just sent to the address. */
export async function disableEmailTwoFactor(adminId: ObjectId, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const col = await users();
  const u = await col.findOne({ _id: adminId }, { projection: { twoFactorEmail: 1 } });
  if (!u?.twoFactorEmail) return { ok: true };
  if (!(await checkEmailCode(adminId, "disable", code))) return { ok: false, error: "That code isn't right or has expired. Ask for a new one." };
  await col.updateOne({ _id: adminId }, { $unset: { twoFactorEmail: "" } });
  return { ok: true };
}

export async function startTwoFactorSetup(adminId: ObjectId, email: string): Promise<{ ok: true; secret: string; qr: string } | { ok: false; error: string }> {
  if (!twoFactorAvailable()) return { ok: false, error: "Two-step sign-in isn't available right now. Please try again in a few minutes, or contact support." };
  const col = await users();
  const u = await col.findOne({ _id: adminId }, { projection: { twoFactor: 1, twoFactorEmail: 1 } });
  void u; // an authenticator can be added or replaced while email codes are on (the caller has re-authenticated)
  const secret = newTotpSecret();
  await col.updateOne({ _id: adminId }, { $set: { twoFactorPending: { secret: encryptPlatformSecret(secret, await ctx(adminId)), at: new Date() } } });
  const qr = await QRCode.toDataURL(otpauthUri(secret, email, await issuerName()), { margin: 1, width: 192 });
  return { ok: true, secret, qr };
}

/** Checks the first code from the app; on success turns two-step on and returns the recovery codes (shown once, never stored in the clear). */
export async function confirmTwoFactorSetup(adminId: ObjectId, code: string): Promise<{ ok: true; recovery: string[] } | { ok: false; error: string }> {
  const col = await users();
  const u = await col.findOne({ _id: adminId }, { projection: { twoFactorPending: 1, twoFactor: 1, twoFactorEmail: 1, secondStep: 1 } });
  const p = u?.twoFactorPending;
  if (!p || Date.now() - p.at.getTime() > SETUP_TTL_MS) return { ok: false, error: "That setup has expired. Start again." };
  const secret = decryptPlatformSecret(p.secret, await ctx(adminId));
  if (!secret) return { ok: false, error: "That setup can't be read any more. Start again." };
  const step = verifyTotp(secret, code);
  if (step === null) return { ok: false, error: "That code isn't right. Wait for the next one in your app and try again." };
  const left = (u?.twoFactor?.recovery.length ?? 0) + (u?.secondStep?.recovery?.length ?? 0);
  const recovery = left > 0 ? [] : newRecoveryCodes();
  await col.updateOne({ _id: adminId }, { $set: { twoFactor: { secret: p.secret, enabledAt: new Date(), lastStep: step, recovery: u?.twoFactor?.recovery ?? [] }, ...(recovery.length ? { "secondStep.recovery": recovery.map(hashCode) } : {}) }, $unset: { twoFactorPending: "", twoFactorForced: "" } });
  return { ok: true, recovery };
}

/**
 * Whether `code` is a valid second step for this account: the current app code, or an unused recovery code (which is used up). Updates the
 * replay guard, so the same code cannot be used twice.
 */
export async function verifySecondStep(user: { _id: ObjectId; twoFactor?: TwoFactorDoc | null }, code: string): Promise<boolean> {
  return (await verifySecondStepDetailed(user, code)) === "ok";
}

/** True when the authenticator secret opens with the keys this deployment has. False = key mismatch (not the person's mistake). */
export async function secondStepReadable(user: { _id: ObjectId; twoFactor?: { secret: EncryptedValue } | null }): Promise<boolean> {
  if (!user.twoFactor) return true;
  return canOpenPlatformSecret(user.twoFactor.secret, await ctx(user._id));
}

/**
 * "ok" = valid app code or unused recovery code (used up). "wrong" = a wrong code. "key_mismatch" = the secret can't be opened with this
 * deployment's keys: the code could not be checked at all, which must never be treated as a wrong code (no lock-out). Recovery codes are
 * hashes and work without the key.
 */
export async function verifySecondStepDetailed(user: { _id: ObjectId; twoFactor?: TwoFactorDoc | null }, code: string): Promise<"ok" | "wrong" | "key_mismatch"> {
  const tf = user.twoFactor;
  if (!tf) return "ok";
  const col = await users();
  const readable = await secondStepReadable(user as never);
  if (readable) {
    const secret = decryptPlatformSecret(tf.secret, await ctx(user._id));
    const step = secret ? verifyTotp(secret, code, tf.lastStep ?? 0) : null;
    if (step !== null) {
      // Only the first request to present this step wins.
      const r = await col.updateOne({ _id: user._id, "twoFactor.lastStep": { $lt: step } }, { $set: { "twoFactor.lastStep": step } });
      return r.modifiedCount === 1 ? "ok" : "wrong";
    }
  }
  if (await useRecoveryCode(user as never, code)) return "ok";
  return readable ? "wrong" : "key_mismatch";
}

/** Uses up a recovery code (hash based, needs no key), from either place they may live. Single use. */
export async function useRecoveryCode(user: { _id: ObjectId; twoFactor?: { recovery: string[] } | null; secondStep?: { recovery?: string[] } | null }, code: string): Promise<boolean> {
  const h = hashCode(code);
  const col = await users();
  const fresh = await col.findOne({ _id: user._id }, { projection: { twoFactor: 1, secondStep: 1 } });
  if (fresh?.secondStep?.recovery?.includes(h)) return (await col.updateOne({ _id: user._id, "secondStep.recovery": h }, { $pull: { "secondStep.recovery": h } } as never)).modifiedCount === 1;
  if (fresh?.twoFactor?.recovery.includes(h)) return (await col.updateOne({ _id: user._id, "twoFactor.recovery": h }, { $pull: { "twoFactor.recovery": h } })).modifiedCount === 1;
  return false;
}

/** The authenticator code only (no recovery code): "ok" | "wrong" | "unreadable". */
export async function verifyAuthenticatorCode(user: { _id: ObjectId; twoFactor?: TwoFactorDoc | null }, code: string): Promise<"ok" | "wrong" | "unreadable"> {
  const tf = user.twoFactor;
  if (!tf) return "wrong";
  if (!(await secondStepReadable(user as never))) return "unreadable";
  const secret = decryptPlatformSecret(tf.secret, await ctx(user._id));
  const step = secret ? verifyTotp(secret, code, tf.lastStep ?? 0) : null;
  if (step === null) return "wrong";
  const r = await (await users()).updateOne({ _id: user._id, "twoFactor.lastStep": { $lt: step } }, { $set: { "twoFactor.lastStep": step } });
  return r.modifiedCount === 1 ? "ok" : "wrong";
}

/** New recovery codes (shown once by the caller); the old ones stop working. */
export async function regenerateRecoveryCodes(adminId: ObjectId): Promise<string[]> {
  const codes = newRecoveryCodes();
  await (await users()).updateOne({ _id: adminId }, { $set: { "secondStep.recovery": codes.map(hashCode) } } as never);
  await (await users()).updateOne({ _id: adminId, twoFactor: { $exists: true } }, { $set: { "twoFactor.recovery": [] } });
  return codes;
}

export async function setPreferredMethod(adminId: ObjectId, method: TwoStepMethod): Promise<void> {
  await (await users()).updateOne({ _id: adminId }, { $set: { "secondStep.preferred": method } } as never);
}

/**
 * After a recovery that proves the person (recovery code, emailed code, break-glass, a staff reset) while the secret can't be opened:
 * the unreadable secret is removed and setting two-step up again is REQUIRED at once (it is then sealed with the active key).
 */
export async function recoverTwoStep(adminId: ObjectId): Promise<void> {
  await (await users()).updateOne({ _id: adminId }, { $unset: { twoFactor: "", twoFactorPending: "" }, $set: { twoFactorForced: true } });
  await import("@/lib/platform/two-step-alerts").then(async (m) => m.clearTwoStepFlag(await currentCompanyId(), String(adminId))).catch(() => {});
}

/** A short message for places that check a code: tells a key mismatch apart from a wrong code. */
export async function twoStepFailureMessage(user: { _id: ObjectId; twoFactor?: { secret: EncryptedValue } | null }, wrong: string): Promise<string> {
  return (await secondStepReadable(user)) ? wrong : "We couldn't verify this code. Enter a recovery code, or ask your administrator to reset your sign-in.";
}

/** Turns two-step off for the signed-in person, after one valid code (or recovery code). */
export async function disableTwoFactor(adminId: ObjectId, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const col = await users();
  const u = await col.findOne({ _id: adminId });
  if (!u?.twoFactor) return { ok: true };
  if (!(await verifySecondStep(u, code))) return { ok: false, error: await twoStepFailureMessage(u as never, "That code isn't right.") };
  await col.updateOne({ _id: adminId }, { $unset: { twoFactor: "", twoFactorPending: "" } });
  await col.updateOne({ _id: adminId, "secondStep.preferred": "app" } as never, { $unset: { "secondStep.preferred": "" } } as never);
  return { ok: true };
}

/** A Director switching two-step off for someone who lost their device or mailbox (they can set it up again). */
export async function resetTwoFactor(adminId: ObjectId): Promise<void> {
  await (await users()).updateOne({ _id: adminId }, { $unset: { twoFactor: "", twoFactorPending: "", twoFactorEmail: "" } });
  await import("@/lib/platform/two-step-alerts").then(async (m) => m.clearTwoStepFlag(await currentCompanyId(), String(adminId))).catch(() => {});
}

/** The name an authenticator app shows beside the code: the company's own name, never the platform's. */
async function issuerName(): Promise<string> {
  const brand = await getCompanyBrand().catch(() => null);
  return brand?.name?.trim() || "Workspace";
}

/**
 * Whether the sign-in screen asks the person to turn on two-step sign-in. The same for everyone, Platform Console people included.
 *   "required": the operator has made it mandatory (REQUIRE_PRIVILEGED_MFA=1) for Directors and Platform Console people. No skipping.
 *   "due":      two-step is off and they have not skipped lately: the setup screen shows at sign-in, with "Skip for now".
 *   "none":     it is on, or they skipped less than SKIP_HOURS ago, or prompting is switched off (TWO_STEP_PROMPT=0).
 * Skipping is a snooze, not a decision: once it ends the screen comes back at the next sign-in.
 */
export type TwoFactorPrompt = "none" | "due" | "required";

export async function twoFactorPrompt(user: { id: string; roles?: readonly string[] }, opts: { alwaysPrivileged?: boolean } = {}): Promise<TwoFactorPrompt> {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(user.id)) return "none";
  const id = new ObjectId(user.id);
  if ((await twoFactorStatus(id)).enabled) return "none";
  // Set after a recovery (key mismatch, break-glass, staff reset): setting two-step up again is required, no skipping.
  if ((await (await users()).findOne({ _id: id }, { projection: { twoFactorForced: 1 } }))?.twoFactorForced) return "required";
  // Mandatory only when the operator asks for it. Everyone else can skip, so the screen, the Console and every product always agree.
  const { getSecondStepPolicy } = await import("@/lib/security/second-step-server");
  const policy = await getSecondStepPolicy().catch(() => null);
  const privileged = !!opts.alwaysPrivileged || (user.roles ?? []).includes("super_admin");
  const mandatory = privileged && (process.env.REQUIRE_PRIVILEGED_MFA === "1" || Boolean(policy?.requireForAdmins));
  if (mandatory) return "required";
  if (process.env.TWO_STEP_PROMPT === "0") return "none";
  const snoozed = await (await users()).findOne({ _id: id }, { projection: { twoFactorSkipUntil: 1 } });
  if (snoozed?.twoFactorSkipUntil && snoozed.twoFactorSkipUntil.getTime() > Date.now()) return "none";
  return "due";
}

/** Whether the person is sent to the setup screen now (either kind). */
export async function mustSetUpTwoFactor(user: { id: string; roles?: readonly string[] }, opts: { alwaysPrivileged?: boolean } = {}): Promise<boolean> {
  return (await twoFactorPrompt(user, opts)) !== "none";
}

/** How long "Skip for now" lasts before the setup screen is shown again. 72 hours; TWO_STEP_SKIP_HOURS changes it. */
export const SKIP_HOURS = Math.max(1, Number(process.env.TWO_STEP_SKIP_HOURS) || 72);

/** "Skip for now": the setup screen stops showing for SKIP_HOURS (the caller has checked skipping is allowed). */
export async function snoozeTwoFactorSetup(adminId: ObjectId): Promise<{ ok: true; until: Date }> {
  const until = new Date(Date.now() + SKIP_HOURS * 60 * 60 * 1000);
  await (await users()).updateOne({ _id: adminId }, { $set: { twoFactorSkipUntil: until } } as never);
  return { ok: true, until };
}
