import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { PLATFORM_AUDIT_COLLECTION, type PlatformAuditEntry } from "@/lib/platform/audit";

/**
 * Reading `platform_audit_log` for the Audit log page: server-side filters,
 * text search and pagination over indexed fields (`at`, `action`,
 * `companyId`, `actorId`). Actor emails are resolved from the owner company's
 * `admin_users` (call on the owner's host); company names from `companies`.
 */

export const AUDIT_PAGE_SIZE = 25;
export const AUDIT_EXPORT_LIMIT = 5000;

export interface AuditFilters {
  actorId?: string;
  /** "company" matches company.suspend, company.activate …; "company.suspend" exactly that and its children. */
  actionPrefix?: string;
  companyId?: string;
  /** YYYY-MM-DD, inclusive, UTC days. */
  from?: string;
  to?: string;
  q?: string;
  page?: number;
}

export interface AuditRow {
  id: string;
  at: Date;
  actorId: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  companyId: string | null;
  companyName: string | null;
  details: Record<string, unknown> | null;
}

let indexed = false;
async function col() {
  const c = (await getPlatformDb()).collection<PlatformAuditEntry>(PLATFORM_AUDIT_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ at: -1 }), c.createIndex({ action: 1, at: -1 }), c.createIndex({ companyId: 1, at: -1 }), c.createIndex({ actorId: 1, at: -1 })]).catch(() => {});
  }
  return c;
}

/** Test hook. */
export async function ensureAuditIndexes(): Promise<void> {
  indexed = false;
  await col();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function actorsMatching(q: string): Promise<string[]> {
  try {
    const users = await (await getDb()).collection("admin_users").find({ $or: [{ email: { $regex: escapeRe(q), $options: "i" } }, { name: { $regex: escapeRe(q), $options: "i" } }] }, { projection: { _id: 1 } }).limit(50).toArray();
    return users.map((u) => String(u._id));
  } catch {
    return [];
  }
}

async function companiesMatching(q: string): Promise<string[]> {
  const docs = await (await getPlatformDb()).collection("companies").find({ $or: [{ name: { $regex: escapeRe(q), $options: "i" } }, { slug: { $regex: escapeRe(q), $options: "i" } }] }, { projection: { _id: 1 } }).limit(50).toArray();
  return docs.map((d) => String(d._id));
}

export async function buildAuditQuery(f: AuditFilters): Promise<Filter<PlatformAuditEntry>> {
  const and: Filter<PlatformAuditEntry>[] = [];
  if (f.actorId) and.push({ actorId: f.actorId });
  if (f.actionPrefix) {
    const p = f.actionPrefix.replace(/\.$/, "");
    and.push({ action: { $regex: `^${escapeRe(p)}(\\.|$)` } });
  }
  if (f.companyId) and.push({ companyId: f.companyId });
  const at: Record<string, Date> = {};
  if (f.from && DAY_RE.test(f.from)) at.$gte = new Date(`${f.from}T00:00:00.000Z`);
  if (f.to && DAY_RE.test(f.to)) at.$lt = new Date(new Date(`${f.to}T00:00:00.000Z`).getTime() + 86_400_000);
  if (Object.keys(at).length) and.push({ at } as Filter<PlatformAuditEntry>);
  const q = f.q?.trim();
  if (q) {
    const re = { $regex: escapeRe(q), $options: "i" };
    const [actorIds, companyIds] = await Promise.all([actorsMatching(q), companiesMatching(q)]);
    and.push({
      $or: [
        { action: re },
        { "target.type": re },
        { "target.id": re },
        { actorId: re },
        { companyId: re },
        // The human names of what changed (role, plan, coupon, add-on, domain) live in the details.
        { "details.name": re },
        { "details.code": re },
        { "details.domain": re },
        ...(actorIds.length ? [{ actorId: { $in: actorIds } }] : []),
        ...(companyIds.length ? [{ companyId: { $in: companyIds } }] : []),
      ],
    } as Filter<PlatformAuditEntry>);
  }
  return and.length ? { $and: and } : {};
}

async function labelRows(docs: (PlatformAuditEntry & { _id: unknown })[]): Promise<AuditRow[]> {
  const actorIds = [...new Set(docs.map((d) => d.actorId).filter((id) => id && id !== "system"))];
  const companyIds = [...new Set(docs.map((d) => d.companyId).filter((id): id is string => Boolean(id)))];
  const [actors, companies] = await Promise.all([actorLabels(actorIds), companyNames(companyIds)]);
  return docs.map((d) => ({
    id: String(d._id),
    at: d.at,
    actorId: d.actorId,
    actorLabel: d.actorId === "system" ? "System" : (actors.get(d.actorId) ?? d.actorId),
    action: d.action,
    targetType: d.target?.type ?? "",
    targetId: d.target?.id ?? "",
    companyId: d.companyId ?? null,
    companyName: d.companyId ? (companies.get(d.companyId) ?? null) : null,
    details: d.details ?? null,
  }));
}

export async function actorLabels(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const oids = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (!oids.length) return out;
  try {
    const users = await (await getDb()).collection("admin_users").find({ _id: { $in: oids } }, { projection: { email: 1 } }).toArray();
    for (const u of users) out.set(String(u._id), String(u.email));
  } catch {
    /* outside a company scope: fall back to raw ids */
  }
  return out;
}

async function companyNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const docs = await (await getPlatformDb()).collection<{ _id: string; name: string }>("companies").find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray();
  return new Map(docs.map((d) => [String(d._id), d.name]));
}

export async function queryAuditLog(f: AuditFilters): Promise<{ rows: AuditRow[]; total: number; page: number; totalPages: number }> {
  const c = await col();
  const filter = await buildAuditQuery(f);
  const total = await c.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1)), totalPages);
  const docs = await c
    .find(filter)
    .sort({ at: -1, _id: -1 })
    .skip((page - 1) * AUDIT_PAGE_SIZE)
    .limit(AUDIT_PAGE_SIZE)
    .toArray();
  return { rows: await labelRows(docs as never), total, page, totalPages };
}

/** Distinct action prefixes ("company", "company.suspend", …) for the filter list. */
export async function listActionPrefixes(): Promise<string[]> {
  const actions = (await (await col()).distinct("action")) as string[];
  const set = new Set<string>();
  for (const a of actions) {
    const parts = a.split(".");
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join("."));
  }
  return [...set].sort();
}

/** Distinct actors that appear in the log, labelled. */
export async function listAuditActors(): Promise<{ id: string; label: string }[]> {
  const ids = ((await (await col()).distinct("actorId")) as string[]).filter(Boolean);
  const labels = await actorLabels(ids.filter((i) => i !== "system"));
  return ids.map((id) => ({ id, label: id === "system" ? "System" : (labels.get(id) ?? id) })).sort((a, b) => a.label.localeCompare(b.label));
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
  // Neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportAuditCsv(f: AuditFilters): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const c = await col();
  const filter = await buildAuditQuery(f);
  const docs = await c.find(filter).sort({ at: -1, _id: -1 }).limit(AUDIT_EXPORT_LIMIT + 1).toArray();
  const truncated = docs.length > AUDIT_EXPORT_LIMIT;
  const rows = await labelRows(docs.slice(0, AUDIT_EXPORT_LIMIT) as never);
  const header = ["At (UTC)", "Actor", "Actor ID", "Action", "Target type", "Target ID", "Company", "Company ID", "Details"];
  const lines = [header.join(","), ...rows.map((r) => [r.at, r.actorLabel, r.actorId, r.action, r.targetType, r.targetId, r.companyName ?? "", r.companyId ?? "", r.details ?? ""].map(csvCell).join(","))];
  return { csv: lines.join("\n") + "\n", rows: rows.length, truncated };
}
