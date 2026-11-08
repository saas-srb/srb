import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { currentCompanyIdOrNull, runAsCompany } from "@/lib/platform/tenancy/context";
import { PDF_BY_KEY } from "@/lib/pdf/catalog";

/**
 * What each company has actually done with its PDFs: one row every time a document is made (`pdf_activity`, company-scoped, kept 180 days).
 * The Documents & PDFs page reads it for "last made", "how often" and the recent list. Recording never affects the document: it is
 * best-effort and silent.
 */

const COLLECTION = "pdf_activity";
const KEEP_DAYS = 180;

interface Row {
  _id: string;
  at: Date;
  type: string;
  variant: string;
  ref: string;
  /** Who opened it: an email address, or a short label. */
  by: string;
  /** What kind of person: staff, client, student, candidate, employee or platform. */
  role: string;
  expiresAt: Date;
}

let indexed = false;
async function col() {
  const c = (await getDb()).collection<Row>(COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ at: -1 }).catch(() => {}), c.createIndex({ type: 1, at: -1 }).catch(() => {}), c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {})]);
  }
  return c;
}

export interface PdfEvent {
  type: string;
  variant?: string | null;
  /** The document's own number or id ("INV-0042"). */
  ref?: string | null;
  by?: string | null;
  role?: "staff" | "client" | "student" | "candidate" | "employee" | "platform";
  /** For documents made on a company's behalf by someone outside it (SelfRun staff opening a company's invoice). */
  companyId?: string;
}

/** Records that a PDF was made. Never throws. */
export async function recordPdf(e: PdfEvent): Promise<void> {
  try {
    if (!PDF_BY_KEY.has(e.type)) return;
    const write = async () => {
      const now = new Date();
      await (await col()).insertOne({ _id: randomUUID(), at: now, type: e.type, variant: (e.variant ?? "").slice(0, 60), ref: (e.ref ?? "").slice(0, 80), by: (e.by ?? "").slice(0, 120), role: e.role ?? "staff", expiresAt: new Date(now.getTime() + KEEP_DAYS * 86_400_000) });
    };
    if (e.companyId && (await currentCompanyIdOrNull()) !== e.companyId) await runAsCompany(e.companyId, write);
    else if (await currentCompanyIdOrNull()) await write();
  } catch {
    /* a log problem never affects the document */
  }
}

export interface PdfStat {
  type: string;
  total: number;
  last30: number;
  lastAt: string | null;
  byVariant: Record<string, number>;
}

export async function pdfStats(): Promise<Record<string, PdfStat>> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await (await col())
    .aggregate<{ _id: { t: string; v: string }; n: number; recent: number; last: Date }>([
      { $group: { _id: { t: "$type", v: "$variant" }, n: { $sum: 1 }, recent: { $sum: { $cond: [{ $gte: ["$at", since] }, 1, 0] } }, last: { $max: "$at" } } },
    ])
    .toArray();
  const out: Record<string, PdfStat> = {};
  for (const r of rows) {
    const s = (out[r._id.t] ??= { type: r._id.t, total: 0, last30: 0, lastAt: null, byVariant: {} });
    s.total += r.n;
    s.last30 += r.recent;
    if (r._id.v) s.byVariant[r._id.v] = (s.byVariant[r._id.v] ?? 0) + r.n;
    if (!s.lastAt || r.last.toISOString() > s.lastAt) s.lastAt = r.last.toISOString();
  }
  return out;
}

export interface PdfActivityEntry {
  id: string;
  at: string;
  type: string;
  variant: string;
  ref: string;
  by: string;
  role: string;
}

export async function recentPdfActivity(opts: { type?: string; before?: string; limit?: number } = {}): Promise<{ entries: PdfActivityEntry[]; next: string | null }> {
  const filter: Record<string, unknown> = {};
  if (opts.type && PDF_BY_KEY.has(opts.type)) filter.type = opts.type;
  if (opts.before) {
    const d = new Date(opts.before);
    if (!Number.isNaN(d.getTime())) filter.at = { $lt: d };
  }
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const rows = await (await col()).find(filter).sort({ at: -1, _id: -1 }).limit(limit + 1).toArray();
  const page = rows.slice(0, limit);
  return { entries: page.map((r) => ({ id: r._id, at: r.at.toISOString(), type: r.type, variant: r.variant, ref: r.ref, by: r.by, role: r.role })), next: rows.length > limit ? page[page.length - 1].at.toISOString() : null };
}
