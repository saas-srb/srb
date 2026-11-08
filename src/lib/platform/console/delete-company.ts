import "server-only";
import { randomBytes } from "node:crypto";
import { del } from "@vercel/blob";
import type { Document, Filter } from "mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, COMPANY_DOMAINS_COLLECTION, forgetCompanyRouting, type Company, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { forgetCompanySiteUrls } from "@/lib/platform/tenancy/site-url";
import { KEY_SEPARATOR } from "@/lib/platform/tenancy/collections";
import { activeDomainProvider } from "@/lib/platform/domains";
import { appHostOf } from "@/lib/platform/domains/custom";
import { PLATFORM_AUDIT_COLLECTION } from "@/lib/platform/audit";
import { blobAuth } from "@/lib/storage/blob-token";

/**
 * Permanently deletes a company: its domains at the hosting provider (Vercel), its uploaded files, every database row it owns, and
 * finally the company record. Nothing is archived. Only the platform audit log keeps one line saying who deleted what and when.
 *
 * Deleting is multi-step on purpose: `requestDeletion` (step 1, creates a short-lived challenge) → the caller proves the typed name and
 * phrase against it → `purgeCompany`. The challenge lives in the database so it works across serverless instances.
 */

const REQUESTS = "company_deletion_requests";
const CHALLENGE_TTL_MS = 10 * 60_000;
export const DELETE_PHRASE = "DELETE PERMANENTLY";

interface DeletionRequest {
  _id: string;
  companyId: string;
  actorId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface DeletionPreview {
  companyId: string;
  name: string;
  slug: string;
  domains: string[];
  collections: { name: string; rows: number }[];
  totalRows: number;
}

const UUID_KEY = /^[a-z0-9_/-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]+)?$/i;
const NEVER_PURGE = new Set<string>([COMPANIES_COLLECTION, PLATFORM_AUDIT_COLLECTION, REQUESTS]);

async function loadDeletable(companyId: string): Promise<{ ok: true; company: Company } | { ok: false; error: string }> {
  const company = await (await getPlatformDb()).collection<Company>(COMPANIES_COLLECTION).findOne({ _id: companyId });
  if (!company) return { ok: false, error: "That company no longer exists." };
  if (company.isPlatformOwner) return { ok: false, error: "The platform owner company can't be deleted." };
  return { ok: true, company };
}

const ownRows = (companyId: string): Filter<Document> => ({ $or: [{ companyId }, { _id: { $regex: `^${companyId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${KEY_SEPARATOR}` } }] } as unknown as Filter<Document>);

/** What deleting this company would remove (counts only — nothing is changed). */
export async function previewDeletion(companyId: string): Promise<({ ok: true } & DeletionPreview) | { ok: false; error: string }> {
  const found = await loadDeletable(companyId);
  if (!found.ok) return found;
  const db = await getPlatformDb();
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !NEVER_PURGE.has(n) && !n.startsWith("system."));
  const counts = await Promise.all(
    names.map(async (name) => ({ name, rows: await db.collection(name).countDocuments(name === COMPANY_DOMAINS_COLLECTION ? { companyId } : ownRows(companyId)).catch(() => 0) })),
  );
  const collections = counts.filter((c) => c.rows > 0).sort((a, b) => b.rows - a.rows);
  const domains = (await db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).find({ companyId }).toArray()).map((d) => d._id);
  return { ok: true, companyId, name: found.company.name, slug: found.company.slug, domains, collections, totalRows: collections.reduce((s, c) => s + c.rows, 0) };
}

/** Step 1: records a challenge the final step must present. Returns its id. */
export async function requestDeletion(companyId: string, actorId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const found = await loadDeletable(companyId);
  if (!found.ok) return found;
  const db = await getPlatformDb();
  const token = randomBytes(24).toString("hex");
  const now = new Date();
  await db.collection<DeletionRequest>(REQUESTS).insertOne({ _id: token, companyId, actorId, createdAt: now, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS) });
  return { ok: true, token };
}

export type PurgeResult = { ok: true; domainsRemoved: string[]; filesRemoved: number; rowsRemoved: number } | { ok: false; error: string };

/** The final step. Verifies the challenge, the typed name and the phrase again, then deletes everything. */
export async function purgeCompany(input: { companyId: string; actorId: string; token: string; typedName: string; phrase: string }): Promise<PurgeResult> {
  const { companyId } = input;
  const found = await loadDeletable(companyId);
  if (!found.ok) return found;
  const company = found.company;
  const db = await getPlatformDb();

  const req = await db.collection<DeletionRequest>(REQUESTS).findOne({ _id: input.token });
  if (!req || req.companyId !== companyId || req.actorId !== input.actorId || req.expiresAt.getTime() < Date.now()) return { ok: false, error: "This confirmation expired. Start the deletion again." };
  if (input.typedName.trim() !== company.name.trim()) return { ok: false, error: "The company name you typed doesn't match." };
  if (input.phrase.trim() !== DELETE_PHRASE) return { ok: false, error: `Type ${DELETE_PHRASE} exactly to confirm.` };
  // One use only.
  const used = await db.collection<DeletionRequest>(REQUESTS).deleteOne({ _id: input.token });
  if (used.deletedCount !== 1) return { ok: false, error: "This confirmation was already used. Start the deletion again." };

  return purgeCompanyNow(companyId);
}

/**
 * The deletion itself, with no confirmation of its own: only callers that have already confirmed it (the Platform Console's multi-step flow, or
 * the daily sweep for a company whose 30-day period has ended) may call this.
 */
export async function purgeCompanyNow(companyId: string): Promise<PurgeResult> {
  const found = await loadDeletable(companyId);
  if (!found.ok) return found;
  const db = await getPlatformDb();
  // 1. Domains at the hosting provider. If any can't be detached, stop before touching data so it can be retried.
  const domainDocs = await db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).find({ companyId }).toArray();
  const hosts = [...new Set(domainDocs.flatMap((d) => (d.kind === "custom" ? [d._id, appHostOf(d._id)] : [d._id])))];
  const removed: string[] = [];
  if (hosts.length) {
    let provider;
    try {
      provider = await activeDomainProvider();
    } catch (err) {
      return { ok: false, error: `Couldn't reach the domain provider: ${err instanceof Error ? err.message : "unknown error"}. Nothing was deleted.` };
    }
    const failed: string[] = [];
    for (const h of hosts) {
      const r = await provider.remove(h).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "failed" }));
      if (r.ok) removed.push(h);
      else failed.push(`${h} (${r.error})`);
    }
    if (failed.length) return { ok: false, error: `Couldn't remove from Vercel: ${failed.join("; ")}. Nothing else was deleted — fix this and try again.` };
  }

  // 2. Uploaded files: every stored key (a UUID file name under a folder) found in the company's rows.
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !NEVER_PURGE.has(n) && !n.startsWith("system."));
  const keys = new Set<string>();
  const walk = (v: unknown, depth = 0) => {
    if (depth > 12 || v == null) return;
    if (typeof v === "string") {
      if (UUID_KEY.test(v)) keys.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === "object" && !(v instanceof Date)) Object.values(v as Record<string, unknown>).forEach((x) => walk(x, depth + 1));
  };
  for (const name of names) {
    const cur = db.collection(name).find(name === COMPANY_DOMAINS_COLLECTION ? { companyId } : ownRows(companyId));
    for await (const doc of cur) walk(doc);
  }
  let filesRemoved = 0;
  const all = [...keys];
  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100);
    try {
      await del(batch, await blobAuth());
      filesRemoved += batch.length;
    } catch (err) {
      console.error("[delete-company] file removal failed", err instanceof Error ? err.message : err);
    }
  }

  // 3. Every row the company owns, in every collection.
  let rowsRemoved = 0;
  for (const name of names) {
    const r = await db.collection(name).deleteMany(name === COMPANY_DOMAINS_COLLECTION ? { companyId } : ownRows(companyId));
    rowsRemoved += r.deletedCount;
  }
  // Open deletion challenges for this company, then the company itself.
  await db.collection<DeletionRequest>(REQUESTS).deleteMany({ companyId });
  await db.collection<Company>(COMPANIES_COLLECTION).deleteOne({ _id: companyId });
  forgetCompanyRouting();
  forgetCompanySiteUrls();
  return { ok: true, domainsRemoved: removed, filesRemoved, rowsRemoved };
}
