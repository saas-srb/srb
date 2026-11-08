import "server-only";
import JSZip from "jszip";
import { EJSON } from "bson";
import type { Document, Filter } from "mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { KEY_SEPARATOR, isGlobalCollection } from "@/lib/platform/tenancy/collections";

/**
 * The archive format of a company's workspace: one JSON-lines file per kind of record (Extended JSON, so dates, ids and numbers come back
 * exactly as they went in), a manifest and a README. A backup, an export and a restore all read and write this one format.
 *
 * Left out on purpose: passwords and their hashes, session and sign-in tokens, rate-limit counters, the keys saved under Integrations and every
 * other secret or encrypted value (any field whose name says password, hash, secret, token, key or encrypted is removed), the platform's own
 * records about other companies, and uploaded files (they live in private storage; download them from their product).
 */

export const ARCHIVE_FORMAT = 2;
export const MAX_ROWS = 750_000;

/** Platform-level collections that never belong in a company's archive. */
const SKIP = new Set<string>([
  COMPANIES_COLLECTION, "pending_signups", "signup_attempts", "login_handoffs", "platform_settings", "platform_audit_log", "platform_roles", "platform_panels",
  "billing_plans", "billing_webhook_events", "billing_coupons", "billing_coupon_redemptions", "billing_addons", "game_scores", "app_builds",
  "support_counters", "support_config", "support_articles", "saas_inquiries", "company_deletion_requests", "security_rate_limits", "session_bindings", "status_incidents",
]);
/** Sign-in state, keys and throttles, rather than the company's records. */
const SKIP_NAME = /(^|_)(sessions?|login_sessions|login_events|tokens?|otp|challenges?|handoffs?|rate_?limits?|locks?|idempotency|connections|secrets?|credentials?)(_|$)|^hub_sessions$|_session$/i;
/** The history of backups, restores and data events is not itself part of a backup. */
const META = /^(company_backups|company_restores|company_exports|company_data_events|danger_challenges|upload_blocks)$/;
/** Kept as they are on a restore: the accounts (their passwords are not in a backup) and the usage meters. */
const NEVER_RESTORED = /^(admin_users|billing_usage|usage_events|ai_usage_events|ai_agent_proposals)$/;
const SECRET_KEY = /password|passwd|hash|secret|token|api_?key|private_?key|encrypted|ciphertext|\biv\b|salt|otp/i;

export const ownRows = (companyId: string): Filter<Document> =>
  ({ $or: [{ companyId }, { _id: { $regex: `^${companyId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${KEY_SEPARATOR}` } }] }) as unknown as Filter<Document>;

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

/** The record without its secrets and with a plain id. Dates, ids and other value types are kept as they are. */
export function cleanRecord(value: unknown, prefix: string, depth = 0): unknown {
  if (depth > 20) return value;
  if (Array.isArray(value)) return value.map((v) => cleanRecord(v, prefix, depth + 1));
  if (!isPlain(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = k === "_id" && typeof v === "string" && v.startsWith(prefix) ? v.slice(prefix.length) : cleanRecord(v, prefix, depth + 1);
  }
  return out;
}

/** The collections the archive can hold, for this company, with how many records it has in each. */
export async function companyCollections(companyId: string, opts: { forRestore?: boolean } = {}): Promise<{ name: string; rows: number }[]> {
  const db = await getPlatformDb();
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !SKIP.has(n) && !SKIP_NAME.test(n) && !META.test(n) && !n.startsWith("system.") && (!opts.forRestore || (!NEVER_RESTORED.test(n) && !isGlobalCollection(n))));
  return Promise.all(names.map(async (name) => ({ name, rows: await db.collection(name).countDocuments(ownRows(companyId)).catch(() => 0) })));
}

export type ArchiveResult = { ok: true; data: Buffer; collections: number; rows: number; list: { name: string; records: number }[] } | { ok: false; error: string };

export async function buildArchive(companyId: string, actor: { email: string }): Promise<ArchiveResult> {
  const db = await getPlatformDb();
  const company = await db.collection<{ _id: string; name: string; slug: string }>(COMPANIES_COLLECTION).findOne({ _id: companyId });
  const present = (await companyCollections(companyId)).filter((c) => c.rows > 0).sort((a, b) => a.name.localeCompare(b.name));
  const total = present.reduce((n, c) => n + c.rows, 0);
  if (total > MAX_ROWS) return { ok: false, error: `This workspace holds ${total.toLocaleString("en-IN")} records, more than one archive can carry. Write to us through the contact page and we will prepare it for you.` };
  const prefix = `${companyId}${KEY_SEPARATOR}`;
  const zip = new JSZip();
  for (const { name } of present) {
    const lines: string[] = [];
    for await (const doc of db.collection(name).find(ownRows(companyId))) lines.push(EJSON.stringify(cleanRecord(doc, prefix) as Document, { relaxed: true }));
    zip.file(`data/${name}.jsonl`, lines.join("\n") + "\n");
  }
  const at = new Date();
  const list = present.map((c) => ({ name: c.name, records: c.rows }));
  zip.file("manifest.json", JSON.stringify({ format: ARCHIVE_FORMAT, companyId, company: company?.name ?? null, workspace: company?.slug ?? null, createdAt: at, createdBy: actor.email, collections: list, totalRecords: total }, null, 2));
  zip.file(
    "README.txt",
    [
      `Everything ${company?.name ?? "your company"} keeps in its workspace, saved ${at.toISOString()} (${actor.email}).`,
      "",
      "data/<name>.jsonl   one file per kind of record; every line is one record in Extended JSON (open it with any JSON tool).",
      "manifest.json       what is in the archive and how many records.",
      "",
      "To go back to this point, open Settings → Backups & data and restore it from the list (the same file you download here).",
      "",
      "Not included: passwords and their hashes, sign-in sessions and tokens, API keys saved under Integrations and every other secret or",
      "encrypted value. Uploaded files (documents, images, attachments) are kept in private storage and are not inside this archive: download",
      "them from the product they belong to. Dates are in UTC.",
      "",
    ].join("\n"),
  );
  const data = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { ok: true, data, collections: present.length, rows: total, list };
}

export interface ReadArchive { manifest: { format?: number; companyId?: string; workspace?: string | null; createdAt?: string; totalRecords?: number }; files: Map<string, string> }

/** Opens an archive made by `buildArchive` (or the older export). Never trusts it: bad files come back as an error. */
export async function readArchive(data: Buffer): Promise<{ ok: true; archive: ReadArchive } | { ok: false; error: string }> {
  try {
    const zip = await JSZip.loadAsync(data);
    const mf = zip.file("manifest.json");
    if (!mf) return { ok: false, error: "This backup is invalid: manifest.json is missing." };
    const manifest = JSON.parse(await mf.async("string")) as ReadArchive["manifest"];
    const files = new Map<string, string>();
    for (const [path, f] of Object.entries(zip.files)) {
      const m = /^data\/([a-z0-9_.-]+)\.jsonl$/i.exec(path);
      if (m && !f.dir) files.set(m[1], await f.async("string"));
    }
    return { ok: true, archive: { manifest, files } };
  } catch {
    return { ok: false, error: "That backup file can't be read." };
  }
}

export function parseRecords(text: string): Document[] {
  return text.split("\n").filter((l) => l.trim()).map((l) => EJSON.parse(l, { relaxed: true }) as Document);
}
