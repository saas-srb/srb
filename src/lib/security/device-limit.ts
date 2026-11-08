import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";

/**
 * One device at a time on the free plan; paid plans have no limit. Whether it applies is decided by the company's plan at sign-in. The
 * platform's own workspace, companies never billed (internal) and the public demo workspace (shared by every visitor) are never limited.
 */
export async function oneDeviceLimitApplies(): Promise<boolean> {
  const companyId = await currentCompanyIdOrNull();
  if (!companyId) return false;
  const company = await getCompany(companyId).catch(() => null);
  if (!company || company.slug === "demo") return false;
  const e = await entitlementsFor(companyId).catch(() => null);
  return !!e && e.status !== "internal" && e.planId === "free";
}

const TICKET_TTL_MS = 5 * 60_000;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

interface TicketDoc { tokenHash: string; adminId: ObjectId; email: string; expiresAt: Date; usedAt: Date | null }
let indexed = false;
async function tickets() {
  const c = (await getDb()).collection<TicketDoc>("login_takeovers");
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ tokenHash: 1 }, { unique: true }).catch(() => {}), c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {})]);
  }
  return c;
}

/**
 * A one-time pass given right after the password (and code) were checked and another device was found. The person confirms on the page, and
 * the pass proves the sign-in was already verified, so the password and the one-time code are not asked for twice. Valid for 5 minutes, once.
 */
export async function createTakeoverTicket(adminId: ObjectId, email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await (await tickets()).insertOne({ tokenHash: sha(token), adminId, email, expiresAt: new Date(Date.now() + TICKET_TTL_MS), usedAt: null });
  return token;
}

export async function consumeTakeoverTicket(token: string): Promise<{ adminId: ObjectId; email: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const doc = await (await tickets()).findOneAndUpdate({ tokenHash: sha(token), usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
  return doc ? { adminId: doc.adminId, email: doc.email } : null;
}
