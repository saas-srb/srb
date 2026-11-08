import "server-only";
import type { Filter } from "mongodb";
import { COLLECTIONS, escapeRegex, newId, seoCollection } from "@/lib/products/rankmax-ai/db";
import { CHECKS, ISSUE_STATUSES, SEVERITIES, CATEGORIES, type CheckId, type IssueStatus, type Severity, type Category } from "@/lib/products/rankmax-ai/checks";
import type { SeoIssue } from "@/lib/products/rankmax-ai/types";

/**
 * Centralised SEO issue store. Audit/PageSpeed findings are upserted by a
 * stable fingerprint (`checkId|path`), so each problem is ONE issue with a
 * history rather than a new row per crawl:
 *   - found again  → lastSeen updated; a resolved issue re-opens (regression),
 *                    an ignored one stays ignored;
 *   - not found    → an open/in-progress issue on a page this run covered is
 *                    auto-resolved (`resolvedBy: "audit"`), i.e. the fix is verified.
 * Manual issues are never touched by reconciliation.
 */

export interface IssueFinding {
  path: string;
  checkId: CheckId;
  details: string[];
}

let indexesEnsured = false;
async function col() {
  const c = await seoCollection<SeoIssue>(COLLECTIONS.issues);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ fingerprint: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ status: 1, severity: 1 }).catch(() => {}),
      c.createIndex({ path: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

export async function reconcileIssues(
  findings: IssueFinding[],
  scope: { source: "audit" | "pagespeed"; runId: string | null; paths: string[]; checkIds: CheckId[] }
): Promise<{ created: number; reopened: number; resolved: number }> {
  const c = await col();
  const now = new Date();
  const existing = await c.find({ source: scope.source, path: { $in: scope.paths }, checkId: { $in: scope.checkIds } }).toArray();
  const byFp = new Map(existing.map((i) => [i.fingerprint, i]));
  const found = new Set<string>();
  let created = 0;
  let reopened = 0;
  let resolved = 0;

  for (const f of findings) {
    const fp = `${f.checkId}|${f.path}`;
    if (found.has(fp)) continue;
    found.add(fp);
    const def = CHECKS[f.checkId];
    const prev = byFp.get(fp);
    if (!prev) {
      await c.insertOne({
        _id: newId(),
        fingerprint: fp,
        checkId: f.checkId,
        title: def.title,
        severity: def.severity,
        category: def.category,
        path: f.path,
        description: def.description,
        recommendation: def.recommendation,
        details: f.details.slice(0, 30),
        status: "open",
        assigneeId: null,
        source: scope.source,
        notes: "",
        firstSeenAt: now,
        lastSeenAt: now,
        lastRunId: scope.runId,
        occurrences: 1,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
        resolvedBy: null,
        createdBy: null,
      }).catch(async () => {
        // Fingerprint race or a same-fingerprint issue from another source — update it instead.
        await c.updateOne({ fingerprint: fp }, { $set: { lastSeenAt: now, details: f.details.slice(0, 30) } });
      });
      created++;
      continue;
    }
    const set: Partial<SeoIssue> = { lastSeenAt: now, lastRunId: scope.runId, details: f.details.slice(0, 30), severity: def.severity, title: def.title, updatedAt: now };
    if (prev.status === "resolved") {
      Object.assign(set, { status: "open" as IssueStatus, resolvedAt: null, resolvedBy: null });
      reopened++;
    }
    await c.updateOne({ _id: prev._id }, { $set: set, $inc: { occurrences: 1 } });
  }

  for (const prev of existing) {
    if (found.has(prev.fingerprint)) continue;
    if (prev.status === "open" || prev.status === "in_progress") {
      await c.updateOne({ _id: prev._id }, { $set: { status: "resolved", resolvedAt: now, resolvedBy: "audit", updatedAt: now } });
      resolved++;
    }
  }
  return { created, reopened, resolved };
}

export interface IssueListOptions {
  status?: string;
  severity?: string;
  category?: string;
  checkId?: string;
  path?: string;
  assignee?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function issueFilter(o: IssueListOptions): Filter<SeoIssue> {
  const f: Filter<SeoIssue> = {};
  if (o.status === "active") f.status = { $in: ["open", "in_progress"] };
  else if (o.status && (ISSUE_STATUSES as readonly string[]).includes(o.status)) f.status = o.status as IssueStatus;
  if (o.severity && (SEVERITIES as readonly string[]).includes(o.severity)) f.severity = o.severity as Severity;
  if (o.category && (CATEGORIES as readonly string[]).includes(o.category)) f.category = o.category as Category;
  if (o.checkId) f.checkId = o.checkId as CheckId;
  if (o.path) f.path = o.path;
  if (o.assignee === "unassigned") f.assigneeId = null;
  else if (o.assignee) f.assigneeId = o.assignee;
  if (o.search) {
    const rx = new RegExp(escapeRegex(o.search), "i");
    f.$or = [{ title: rx }, { path: rx }, { notes: rx }];
  }
  return f;
}

export async function listIssues(o: IssueListOptions) {
  const c = await col();
  const filter = issueFilter(o);
  const page = Math.max(o.page ?? 1, 1);
  const pageSize = Math.min(Math.max(o.pageSize ?? 30, 1), 200);
  const dir = o.sortDir === "asc" ? 1 : -1;
  const all = await c.find(filter).toArray();
  const key = o.sortBy ?? "severity";
  all.sort((a, b) => {
    if (key === "severity") return (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) * -dir || b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
    if (key === "path") return a.path.localeCompare(b.path) * dir;
    if (key === "firstSeenAt") return (a.firstSeenAt.getTime() - b.firstSeenAt.getTime()) * dir;
    return (a.lastSeenAt.getTime() - b.lastSeenAt.getTime()) * dir;
  });
  return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, totalPages: Math.max(Math.ceil(all.length / pageSize), 1) };
}

export async function getIssue(id: string): Promise<SeoIssue | null> {
  return (await col()).findOne({ _id: id });
}

export async function updateIssue(id: string, patch: Partial<Pick<SeoIssue, "status" | "assigneeId" | "notes">>, actorId: string): Promise<{ before: SeoIssue; after: SeoIssue } | null> {
  const c = await col();
  const before = await c.findOne({ _id: id });
  if (!before) return null;
  const set: Partial<SeoIssue> = { ...patch, updatedAt: new Date() };
  if (patch.status && patch.status !== before.status) {
    if (patch.status === "resolved") Object.assign(set, { resolvedAt: new Date(), resolvedBy: actorId });
    else Object.assign(set, { resolvedAt: null, resolvedBy: null });
  }
  await c.updateOne({ _id: id }, { $set: set });
  return { before, after: { ...before, ...set } as SeoIssue };
}

export async function createManualIssue(input: { title: string; path: string; severity: Severity; category: Category; description: string; recommendation: string; assigneeId: string | null }, actorId: string): Promise<SeoIssue> {
  const c = await col();
  const now = new Date();
  const id = newId();
  const doc: SeoIssue = {
    _id: id,
    fingerprint: `manual|${id}`,
    checkId: "manual",
    title: input.title,
    severity: input.severity,
    category: input.category,
    path: input.path,
    description: input.description,
    recommendation: input.recommendation,
    details: [],
    status: "open",
    assigneeId: input.assigneeId,
    source: "manual",
    notes: "",
    firstSeenAt: now,
    lastSeenAt: now,
    lastRunId: null,
    occurrences: 1,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolvedBy: null,
    createdBy: actorId,
  };
  await c.insertOne(doc);
  return doc;
}

export async function issueStats() {
  const c = await col();
  const rows = await c.aggregate<{ _id: { status: IssueStatus; severity: Severity; category: Category }; n: number }>([
    { $group: { _id: { status: "$status", severity: "$severity", category: "$category" }, n: { $sum: 1 } } },
  ]).toArray();
  const active = rows.filter((r) => r._id.status === "open" || r._id.status === "in_progress");
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, active.filter((r) => r._id.severity === s).reduce((a, r) => a + r.n, 0)])) as Record<Severity, number>;
  const byCategory = Object.fromEntries(CATEGORIES.map((cat) => [cat, active.filter((r) => r._id.category === cat).reduce((a, r) => a + r.n, 0)])) as Record<Category, number>;
  const byStatus = Object.fromEntries(ISSUE_STATUSES.map((s) => [s, rows.filter((r) => r._id.status === s).reduce((a, r) => a + r.n, 0)])) as Record<IssueStatus, number>;
  return { bySeverity, byCategory, byStatus, active: active.reduce((a, r) => a + r.n, 0) };
}
