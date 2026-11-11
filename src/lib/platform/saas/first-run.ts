import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { ensureOperator } from "@/lib/platform/saas/bootstrap";

/**
 * First-run setup for a deployment on an empty database when SAAS_ADMIN_EMAIL is not set: one page (`/setup`) creates the first platform
 * admin. It exists only while no platform operator exists, and needs a one-time setup code that is written ONCE to the deployment's
 * runtime log (Vercel → project → Logs), so only someone with access to the project can finish it. Ten wrong codes lock it until
 * the next page load makes a new code. Existing platform staff are never touched.
 */

const DOC = "first_run_setup";
const MAX_ATTEMPTS = 10;
const hash = (s: string) => createHash("sha256").update(`selfrun-setup:${s.trim()}`).digest("hex");

interface SetupDoc {
  _id: typeof DOC;
  codeHash: string;
  attempts: number;
  createdAt: Date;
}

export async function operatorExists(): Promise<boolean> {
  const db = await getPlatformDb();
  return Boolean(await db.collection<Company>(COMPANIES_COLLECTION).findOne({ isPlatformOwner: true }, { projection: { _id: 1 } }));
}

/** True while the setup page should be offered. Creates (and logs, once) the setup code when needed. */
export async function firstRunOpen(): Promise<boolean> {
  if (await operatorExists()) return false;
  const col = (await getPlatformDb()).collection<SetupDoc>("platform_settings");
  const cur = await col.findOne({ _id: DOC });
  if (cur && cur.attempts < MAX_ATTEMPTS) return true;
  const code = randomBytes(6).toString("hex");
  await col.replaceOne({ _id: DOC }, { codeHash: hash(code), attempts: 0, createdAt: new Date() }, { upsert: true });
  console.log(`[setup] First-run setup code (valid until the admin is created): ${code}`);
  return true;
}

export async function completeFirstRunSetup(input: { code: string; email: string; password: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await operatorExists()) return { ok: false, error: "Setup is already done." };
  const col = (await getPlatformDb()).collection<SetupDoc>("platform_settings");
  const cur = await col.findOne({ _id: DOC });
  if (!cur || cur.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Reload this page to get a new setup code in the deployment log." };
  const a = Buffer.from(hash(input.code));
  const b = Buffer.from(cur.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await col.updateOne({ _id: DOC }, { $inc: { attempts: 1 } });
    return { ok: false, error: "That setup code is not right. It is in the deployment's runtime log." };
  }
  if (input.password.length < 10) return { ok: false, error: "Use a password of at least 10 characters." };
  try {
    const res = await ensureOperator({ email: input.email, password: input.password });
    if (!res.created) return { ok: false, error: "Setup is already done." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create the admin." };
  }
  await col.deleteOne({ _id: DOC });
  return { ok: true };
}
