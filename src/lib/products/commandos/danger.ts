import "server-only";
import { randomBytes } from "node:crypto";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { verifyPassword } from "@/lib/lms-auth";
import { verifySecondStep } from "@/lib/security/two-factor";

/**
 * The multi-step confirmation behind every destructive data action (restore a backup, delete all data, delete the company). Four things have
 * to be true, and the server checks every one of them again at the last step: the person asked for exactly this action (a challenge made
 * minutes ago for this action and this backup), typed the company's exact name, typed the exact phrase for the action, and proved who they are
 * with their password (and their two-step code when that is on). A challenge works once, expires in 10 minutes and dies after 5 wrong tries.
 */
export type DangerAction = "restore" | "wipe" | "delete";
export const DANGER_PHRASES: Record<DangerAction, string> = { restore: "RESTORE MY DATA", wipe: "DELETE ALL MY DATA", delete: "DELETE MY COMPANY" };
const TTL_MS = 10 * 60_000;
const MAX_TRIES = 5;
const COLLECTION = "danger_challenges";

interface Challenge { _id: string; adminId: string; action: DangerAction; ref: string | null; expiresAt: Date; tries: number }
const col = async () => (await getDb()).collection<Challenge>(COLLECTION);

export async function startChallenge(adminId: string, action: DangerAction, ref: string | null = null): Promise<{ token: string; phrase: string; companyName: string }> {
  const c = await col();
  await c.deleteMany({ adminId, expiresAt: { $lt: new Date() } });
  await c.deleteMany({ adminId, action }); // one open challenge per action
  const token = randomBytes(24).toString("hex");
  await c.insertOne({ _id: token, adminId, action, ref, expiresAt: new Date(Date.now() + TTL_MS), tries: 0 });
  const company = await getCompany(await currentCompanyId());
  return { token, phrase: DANGER_PHRASES[action], companyName: company?.name ?? "" };
}

export interface Confirmation { token: string; typedName: string; phrase: string; password: string; code?: string }

/** Checks everything and uses up the challenge. On success returns what the challenge was made for (the backup to restore, if any). */
export async function consumeChallenge(user: { id: string; _id: ObjectId; passwordHash: string; twoFactor?: unknown }, action: DangerAction, c: Confirmation): Promise<{ ok: true; ref: string | null } | { ok: false; error: string }> {
  const col_ = await col();
  const ch = await col_.findOne({ _id: String(c.token ?? "") });
  if (!ch || ch.adminId !== user.id || ch.action !== action || ch.expiresAt.getTime() < Date.now()) return { ok: false, error: "This confirmation expired. Start again." };
  if (ch.tries >= MAX_TRIES) {
    await col_.deleteOne({ _id: ch._id });
    return { ok: false, error: "Too many wrong tries. Start again." };
  }
  const fail = async (error: string) => {
    await col_.updateOne({ _id: ch._id }, { $inc: { tries: 1 } });
    return { ok: false as const, error };
  };
  const company = await getCompany(await currentCompanyId());
  if (!company || String(c.typedName ?? "").trim() !== company.name.trim()) return fail("The company name you typed doesn't match.");
  if (String(c.phrase ?? "").trim() !== DANGER_PHRASES[action]) return fail(`Type ${DANGER_PHRASES[action]} exactly to confirm.`);
  if (!verifyPassword(String(c.password ?? ""), user.passwordHash)) return fail("That password isn't right.");
  if (user.twoFactor && !(await verifySecondStep(user as never, String(c.code ?? "")))) return fail("That two-step code isn't right.");
  const used = await col_.deleteOne({ _id: ch._id });
  if (used.deletedCount !== 1) return { ok: false, error: "This confirmation was already used. Start again." };
  return { ok: true, ref: ch.ref };
}
