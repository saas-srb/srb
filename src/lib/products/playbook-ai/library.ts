import "server-only";
import { todayIso } from "@/lib/products/playbook-ai/db";
import { CONFIDENTIALITY_LEVELS, SOP_PRIORITIES, SOP_STATUSES, isConfidentiality, isSopModule, isSopPriority, isSopStatus, type SopStatus } from "@/lib/products/playbook-ai/constants";
import { isExpiringSoon, isReviewOverdue } from "@/lib/products/playbook-ai/lifecycle";
import { listVisibleSummaries } from "@/lib/products/playbook-ai/sops";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { getSettings } from "@/lib/products/playbook-ai/settings";
import { userNames } from "@/lib/products/playbook-ai/people";
import { assignmentStatsBySop, type AckSummary } from "@/lib/products/playbook-ai/analytics";
import type { SopSummary, SopViewer } from "@/lib/products/playbook-ai/types";

/**
 * SOP Library search + filter + sort + paginate. Runs over the viewer's
 * permission-filtered summaries, so no search or filter can surface an SOP
 * the viewer isn't allowed to open.
 */

export interface LibraryQuery {
  q: string;
  status: SopStatus[];
  department: string;
  functionId: string;
  process: string;
  category: string;
  priority: string;
  confidentiality: string;
  owner: string;
  author: string;
  module: string;
  compliance: string;
  attention: string;
  updated: string;
  mandatory: boolean;
  expiring: boolean;
  overdueReview: boolean;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

const SORTS = ["updated", "title", "code", "department", "status", "version", "review", "expiry", "priority"] as const;
type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseLibraryQuery(sp: Sp): LibraryQuery {
  const statusRaw = one(sp.status).split(",").map((s) => s.trim()).filter(isSopStatus);
  const sortBy = (SORTS as readonly string[]).includes(one(sp.sortBy)) ? one(sp.sortBy) : "updated";
  return {
    q: (one(sp.search) || one(sp.q)).slice(0, 100).trim(),
    status: Array.from(new Set(statusRaw)),
    department: one(sp.department).slice(0, 64),
    functionId: one(sp.function).slice(0, 64),
    process: one(sp.process).slice(0, 64),
    category: one(sp.category).slice(0, 64),
    priority: isSopPriority(one(sp.priority)) ? one(sp.priority) : "",
    confidentiality: isConfidentiality(one(sp.confidentiality)) ? one(sp.confidentiality) : "",
    owner: one(sp.owner).slice(0, 64),
    author: one(sp.author).slice(0, 64),
    module: isSopModule(one(sp.module)) ? one(sp.module) : "",
    compliance: ["complete", "pending", "overdue", "unassigned"].includes(one(sp.compliance)) ? one(sp.compliance) : "",
    attention: ["expiring", "overdue_review", "mandatory", "unpublished_changes"].includes(one(sp.attention)) ? one(sp.attention) : "",
    updated: ["7", "30", "90", "365"].includes(one(sp.updated)) ? one(sp.updated) : "",
    mandatory: one(sp.mandatory) === "1",
    expiring: one(sp.expiring) === "1",
    overdueReview: one(sp.overdueReview) === "1",
    sortBy,
    sortDir: one(sp.sortDir) === "asc" ? "asc" : "desc",
    page: Math.max(Number(one(sp.page)) || 1, 1),
    pageSize: 20,
  };
}

export interface LibraryRow extends SopSummary {
  departmentName: string;
  functionName: string;
  processName: string;
  categoryName: string;
  categoryColor: string | null;
  ownerName: string;
  authorName: string;
  ack: AckSummary | null;
}

export interface LibraryResult {
  items: LibraryRow[];
  total: number;
  page: number;
  totalPages: number;
  /** Filter options built only from SOPs this viewer can see. */
  facets: {
    departments: { value: string; label: string }[];
    functions: { value: string; label: string }[];
    processes: { value: string; label: string }[];
    categories: { value: string; label: string }[];
    owners: { value: string; label: string }[];
    authors: { value: string; label: string }[];
  };
  showCompliance: boolean;
}

export async function queryLibrary(v: SopViewer, q: LibraryQuery, opts: { all?: boolean; scope?: "mine" } = {}): Promise<LibraryResult> {
  const [visible, tax, settings] = await Promise.all([listVisibleSummaries(v), getTaxonomy(), getSettings()]);
  const scoped = opts.scope === "mine" ? visible.filter((s) => s.ownerId === v.userId || s.authorId === v.userId || s.createdBy === v.userId) : visible;
  const today = todayIso();

  const deptName = new Map(tax.departments.map((d) => [d._id, d.name]));
  const fnName = new Map(tax.functions.map((f) => [f._id, f.name]));
  const procName = new Map(tax.processes.map((p) => [p._id, p.name]));
  const cat = new Map(tax.categories.map((c) => [c._id, c]));
  const names = await userNames(scoped.flatMap((s) => [s.ownerId, s.authorId]));
  const stats = await assignmentStatsBySop(v, scoped);
  const showCompliance = stats.size > 0 || v.isAdmin || v.manageDepartmentIds.length > 0;

  const rows: LibraryRow[] = scoped.map((s) => ({
    ...s,
    departmentName: deptName.get(s.departmentId) ?? "Unknown",
    functionName: s.functionId ? fnName.get(s.functionId) ?? "" : "",
    processName: [s.processId ? procName.get(s.processId) : "", s.subProcessId ? procName.get(s.subProcessId) : ""].filter(Boolean).join(" › "),
    categoryName: s.categoryId ? cat.get(s.categoryId)?.name ?? "" : "",
    categoryColor: s.categoryId ? cat.get(s.categoryId)?.color ?? null : null,
    ownerName: names.get(s.ownerId) ?? "—",
    authorName: names.get(s.authorId) ?? "—",
    ack: stats.get(s._id) ?? null,
  }));

  const tokens = q.q.toLowerCase().split(/\s+/).filter(Boolean);
  const since = q.updated ? new Date(Date.now() - Number(q.updated) * 86_400_000) : null;
  const statusLabel = new Map(SOP_STATUSES.map((s) => [s.value, s.label]));
  const confLabel = new Map(CONFIDENTIALITY_LEVELS.map((c) => [c.value, c.label]));
  const prioLabel = new Map(SOP_PRIORITIES.map((p) => [p.value, p.label]));

  const filtered = rows.filter((r) => {
    if (q.status.length && !q.status.includes(r.status)) return false;
    if (q.department && r.departmentId !== q.department) return false;
    if (q.functionId && r.functionId !== q.functionId) return false;
    if (q.process && r.processId !== q.process && r.subProcessId !== q.process) return false;
    if (q.category && r.categoryId !== q.category) return false;
    if (q.priority && r.priority !== q.priority) return false;
    if (q.confidentiality && r.confidentiality !== q.confidentiality) return false;
    if (q.owner && r.ownerId !== q.owner) return false;
    if (q.author && r.authorId !== q.author) return false;
    if (q.module && !r.moduleTags.includes(q.module)) return false;
    if (since && r.updatedAt < since) return false;
    if (q.mandatory && !r.mandatory) return false;
    if (q.expiring && !isExpiringSoon(r, today, settings.expiringSoonDays)) return false;
    if (q.overdueReview && !isReviewOverdue(r, today)) return false;
    if (q.attention === "expiring" && !isExpiringSoon(r, today, settings.expiringSoonDays)) return false;
    if (q.attention === "overdue_review" && !isReviewOverdue(r, today)) return false;
    if (q.attention === "mandatory" && !r.mandatory) return false;
    if (q.attention === "unpublished_changes" && !(r.hasUnpublishedChanges && r.version)) return false;
    if (q.compliance) {
      const a = r.ack;
      if (!a) return false;
      if (q.compliance === "complete" && !(a.assigned > 0 && a.acknowledged === a.assigned)) return false;
      if (q.compliance === "pending" && !(a.pending > 0)) return false;
      if (q.compliance === "overdue" && !(a.overdue > 0)) return false;
      if (q.compliance === "unassigned" && a.assigned !== 0) return false;
    }
    if (tokens.length) {
      const hay = [
        r.code, r.title, r.description, r.tags.join(" "), r.departmentName, r.functionName, r.processName, r.categoryName,
        r.ownerName, r.authorName, r.version ? `v${r.version} ${r.version}` : "", statusLabel.get(r.status), confLabel.get(r.confidentiality),
        prioLabel.get(r.priority), r.effectiveDate, r.reviewDate, r.expiryDate, r.mandatory ? "mandatory" : "",
      ].join(" ").toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  const dir = q.sortDir === "asc" ? 1 : -1;
  const cmpStr = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const cmpVer = (a: string | null, b: string | null) => {
    const pa = (a ?? "0.0").split(".").map(Number);
    const pb = (b ?? "0.0").split(".").map(Number);
    return pa[0] - pb[0] || (pa[1] ?? 0) - (pb[1] ?? 0);
  };
  const prioRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  filtered.sort((a, b) => {
    let c = 0;
    switch (q.sortBy) {
      case "title": c = cmpStr(a.title, b.title); break;
      case "code": c = cmpStr(a.code, b.code); break;
      case "department": c = cmpStr(a.departmentName, b.departmentName); break;
      case "status": c = cmpStr(a.status, b.status); break;
      case "version": c = cmpVer(a.version, b.version); break;
      case "review": c = (a.reviewDate ?? "9999").localeCompare(b.reviewDate ?? "9999"); break;
      case "expiry": c = (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"); break;
      case "priority": c = prioRank[a.priority] - prioRank[b.priority]; break;
      default: c = a.updatedAt.getTime() - b.updatedAt.getTime();
    }
    return c * dir;
  });

  const total = filtered.length;
  const pageSize = opts.all ? Math.max(total, 1) : q.pageSize;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(q.page, totalPages);
  const items = opts.all ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);

  const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
  const facets: LibraryResult["facets"] = {
    departments: tax.departments.filter((d) => uniq(scoped.map((s) => s.departmentId)).includes(d._id)).map((d) => ({ value: d._id, label: d.name })),
    functions: tax.functions
      .filter((f) => uniq(scoped.map((s) => s.functionId)).includes(f._id) && (!q.department || f.departmentId === q.department))
      .map((f) => ({ value: f._id, label: q.department ? f.name : `${deptName.get(f.departmentId) ?? ""} · ${f.name}` })),
    processes: tax.processes
      .filter((p) => uniq(scoped.flatMap((s) => [s.processId, s.subProcessId])).includes(p._id) && (!q.functionId || p.functionId === q.functionId))
      .map((p) => ({ value: p._id, label: p.name })),
    categories: tax.categories.filter((c) => uniq(scoped.map((s) => s.categoryId)).includes(c._id)).map((c) => ({ value: c._id, label: c.name })),
    owners: uniq(scoped.map((s) => s.ownerId)).map((id) => ({ value: id, label: names.get(id) ?? id })).sort((a, b) => a.label.localeCompare(b.label)),
    authors: uniq(scoped.map((s) => s.authorId)).map((id) => ({ value: id, label: names.get(id) ?? id })).sort((a, b) => a.label.localeCompare(b.label)),
  };

  return { items, total, page, totalPages, facets, showCompliance };
}
