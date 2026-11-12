import type { Db } from "mongodb";
import { findSealed, isSealedShape, type CipherSample, type Sealed, type ShapeSample } from "@/lib/platform/keyring/probe";

/**
 * Collects ciphertext from the database for key verification. Known locations come with their context (so a wrong key is PROVABLE);
 * everything else with the `{c, iv, t}` shape is collected as shape-only evidence (capped). Read-only. The contexts mirror the helpers that
 * seal them: `2fa:<companyId>:<adminId>` (two-step secrets), `config:<KEY>` (Console server keys), the integrations contexts, `adopted-env:<KEY>`,
 * `payments:razorpay:<companyId>:<field>`.
 */

export interface KnownLocation extends CipherSample {
  /** Where to write the re-sealed value (rotation). */
  target: { collection: string; filter: Record<string, unknown>; path: string };
}

const INTEGRATION_CONTEXTS: Record<string, string> = {
  "email.resendApiKey": "integrations:resend:apiKey",
  "domains.vercelToken": "integrations:vercel:apiToken",
  "domains.previous.token": "integrations:vercel:previousApiToken",
};

export async function collectKnown(db: Db, cap = 2000): Promise<KnownLocation[]> {
  const out: KnownLocation[] = [];
  const push = (l: KnownLocation) => out.length < cap && out.push(l);
  const sealed = (v: unknown): v is Sealed => isSealedShape(v);

  for await (const u of db.collection("admin_users").find({ $or: [{ "twoFactor.secret": { $exists: true } }, { "twoFactorPending.secret": { $exists: true } }] }, { projection: { companyId: 1, twoFactor: 1, twoFactorPending: 1 } })) {
    const aad = `2fa:${String(u.companyId)}:${String(u._id)}`;
    for (const f of ["twoFactor", "twoFactorPending"] as const) {
      const enc = (u[f] as { secret?: unknown } | undefined)?.secret;
      if (sealed(enc)) push({ enc, aad, where: `admin_users.${f}.secret`, target: { collection: "admin_users", filter: { _id: u._id }, path: `${f}.secret` } });
    }
  }
  const settings = db.collection<Record<string, unknown> & { _id: string }>("platform_settings");
  const cfg = await settings.findOne({ _id: "platform_config" });
  for (const [key, v] of Object.entries((cfg?.values as Record<string, { enc?: unknown }> | undefined) ?? {})) if (sealed(v?.enc)) push({ enc: v.enc, aad: `config:${key}`, where: `platform_config.${key}`, target: { collection: "platform_settings", filter: { _id: "platform_config" }, path: `values.${key}.enc` } });
  const integ = (await settings.findOne({ _id: "integrations" })) as Record<string, Record<string, Record<string, unknown>>> | null;
  for (const [path, aad] of Object.entries(INTEGRATION_CONTEXTS)) {
    const v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | null | undefined)?.[k], integ);
    const enc = (v as { enc?: unknown } | null | undefined)?.enc;
    if (sealed(enc)) push({ enc, aad, where: `integrations.${path}`, target: { collection: "platform_settings", filter: { _id: "integrations" }, path: `${path}.enc` } });
  }
  const adopted = await settings.findOne({ _id: "env_adoption" });
  for (const [key, e] of Object.entries((adopted?.entries as Record<string, { enc?: unknown }> | undefined) ?? {})) if (sealed(e?.enc)) push({ enc: e.enc, aad: `adopted-env:${key}`, where: `env_adoption.${key}`, target: { collection: "platform_settings", filter: { _id: "env_adoption" }, path: `entries.${key}.enc` } });
  for await (const p of db.collection("platform_payment_accounts").find({}, { projection: { companyId: 1, keySecret: 1, webhookSecret: 1, accountNumber: 1 } })) {
    for (const f of ["keySecret", "webhookSecret", "accountNumber"]) if (sealed(p[f])) push({ enc: p[f], aad: `payments:razorpay:${String(p.companyId)}:${f}`, where: `platform_payment_accounts.${f}`, target: { collection: "platform_payment_accounts", filter: { _id: p._id }, path: f } });
  }
  return out;
}

/** Shape-only scan of every collection (a few documents each, hard cap), for evidence that a key opens something we don't know the context of. */
export async function collectShapes(db: Db, perCollection = 40, cap = 1500): Promise<ShapeSample[]> {
  const out: ShapeSample[] = [];
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith("system.") && !n.startsWith("storage.") && n !== "platform_audit_log");
  for (const name of names) {
    if (out.length >= cap) break;
    try {
      for await (const doc of db.collection(name).find({}).limit(perCollection)) for (const f of findSealed(doc)) if (out.length < cap) out.push({ enc: f.enc, where: `${name}.${f.path}` });
    } catch {
      /* a collection we can't read is skipped */
    }
  }
  return out;
}
