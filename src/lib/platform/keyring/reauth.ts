import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { verifyPassword } from "@/lib/security/password";
import { breakGlassMatches } from "@/lib/security/break-glass";
import { secondStepReadable, verifySecondStepDetailed } from "@/lib/security/two-factor";
import { checkEmailCode } from "@/lib/security/email-otp";

/**
 * Re-authentication before a key is shown or changed: the signed-in staff member's password AND their second step. When their authenticator
 * can't be opened (key mismatch) the deployment's own SAAS_ADMIN_EMAIL / SAAS_ADMIN_PASSWORD (break-glass) stand in for it. Not counted
 * against sign-in lock-outs; a wrong answer simply refuses.
 */
export async function reauthStaff(userId: string, password: string, code: string): Promise<{ ok: true; via: "password-and-code" | "password" | "break-glass" } | { ok: false; error: string }> {
  if (!ObjectId.isValid(userId)) return { ok: false, error: "Sign in again." };
  const u = await (await getDb()).collection("admin_users").findOne({ _id: new ObjectId(userId) });
  if (!u) return { ok: false, error: "Sign in again." };
  const user = u as unknown as { _id: ObjectId; email: string; passwordHash: string; twoFactor?: { secret: never; recovery: string[]; lastStep: number } | null; twoFactorEmail?: unknown };
  const passwordOk = verifyPassword(password, user.passwordHash);
  if (user.twoFactor) {
    if (!(await secondStepReadable(user as never))) {
      // Authenticator can't be opened here: only the deployment's emergency credentials prove the person.
      return breakGlassMatches({ email: user.email, password, envEmail: process.env.SAAS_ADMIN_EMAIL, envPassword: process.env.SAAS_ADMIN_PASSWORD })
        ? { ok: true, via: "break-glass" }
        : { ok: false, error: "Your authenticator can't be checked on this deployment. Confirm with this deployment's SAAS_ADMIN_EMAIL / SAAS_ADMIN_PASSWORD (as the password) to continue." };
    }
    if (!passwordOk) return { ok: false, error: "That password isn't right." };
    return (await verifySecondStepDetailed(user as never, code)) === "ok" ? { ok: true, via: "password-and-code" } : { ok: false, error: "That second-step code isn't right." };
  }
  if (!passwordOk) return { ok: false, error: "That password isn't right." };
  if (user.twoFactorEmail && !(await checkEmailCode(user._id, "login", code))) return { ok: false, error: "Enter the code emailed to you (sign out and in again to get one)." };
  return { ok: true, via: "password" };
}
