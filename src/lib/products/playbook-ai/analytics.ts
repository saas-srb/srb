import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, todayIso, notDeleted } from "@/lib/products/playbook-ai/db";
import { canViewCompliance } from "@/lib/products/playbook-ai/access";
import { daysBetween, isExpiringSoon, isReviewOverdue, isLive } from "@/lib/products/playbook-ai/lifecycle";
import { assignmentState, checklistProgress } from "@/lib/products/playbook-ai/assignments";
import { listVisibleSummaries } from "@/lib/products/playbook-ai/sops";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { getSettings } from "@/lib/products/playbook-ai/settings";
import { SOP_STATUSES } from "@/lib/products/playbook-ai/constants";
import type { AssignmentDoc, AssignmentState, SopDoc, SopSummary, SopViewer, SopVersionDoc } from "@/lib/products/playbook-ai/types";

/**
 * Dashboard, compliance and report numbers. Everything is computed from the
 * viewer's permission-filtered SOP set (`listVisibleSummaries`), so an
 * employee's dashboard only counts what they can read and a manager's
 * compliance view only covers their own departments.
 */

export interface ChartDatum {
  key: string;
  label: string;
  value: number;
  href?: string;
  color?: string;
}

export interface AckSummary {
  assigned: number;
  acknowledged: number;
  pending: number;
  overdue: number;
  rate: number | null;
}

function ackSummary(rows: Pick<AssignmentDoc, "acknowledgedAt" | "dueDate">[], today: string): AckSummary {
  let acknowledged = 0;
  let pending = 0;
  let overdue = 0;
  for (const r of rows) {
    const s: AssignmentState = assignmentState(r, today);
    if (s === "acknowledged") acknowledged++;
    else if (s === "overdue") overdue++;
    else pending++;
  }
  const assigned = rows.length;
  return { assigned, acknowledged, pending, overdue, rate: assigned ? Math.round((acknowledged / assigned) * 100) : null };
}

/** Assignments the viewer may see stats for: all (admin), their departments (manager), or only their own. */
async function scopedAssignments(v: SopViewer, byId: Map<string, SopSummary>): Promise<AssignmentDoc[]> {
  const db = await getDb();
  const col = db.collection<AssignmentDoc>(COLLECTIONS.assignments);
  const ids = Array.from(byId.keys());
  if (ids.length === 0) return [];
  let filter: Record<string, unknown>;
  if (v.isAdmin) {
    filter = { sopId: { $in: ids } };
  } else if (v.manageDepartmentIds.length && canViewCompliance(v)) {
    const inScopeSops = ids.filter((id) => v.manageDepartmentIds.includes(byId.get(id)?.departmentId ?? ""));
    filter = { sopId: { $in: ids }, $or: [{ userId: v.userId }, { departmentId: { $in: v.manageDepartmentIds } }, { sopId: { $in: inScopeSops } }] };
  } else {
    filter = { sopId: { $in: ids }, userId: v.userId };
  }
  const rows = await col.find(filter).toArray();
  return rows.filter((r) => {
    const s = byId.get(r.sopId);
    return !!s && s.status !== "archived" && s.status !== "draft";
  });
}

function monthKeys(count: number): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    });
  }
  return out;
}
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardData {
  kpis: {
    total: number;
    published: number;
    draft: number;
    active: number;
    expiring: number;
    overdueReviews: number;
    mandatory: number;
    ack: AckSummary;
    coverage: { covered: number; total: number; pct: number };
  };
  byDepartment: ChartDatum[];
  byStatus: ChartDatum[];
  byCategory: ChartDatum[];
  creationTrend: { label: string; value: number }[];
  updateTrend: { label: string; value: number }[];
  acknowledgement: ChartDatum[];
  compliance: ChartDatum[];
  expiringByMonth: { label: string; value: number }[];
  expiringList: { id: string; code: string; title: string; expiryDate: string; daysLeft: number }[];
  mine: { pending: number; overdue: number };
  canSeeCompliance: boolean;
  expiringSoonDays: number;
}

export async function getDashboard(v: SopViewer, filters: { q?: string; departmentId?: string } = {}): Promise<DashboardData> {
  const [visible, tax, settings] = await Promise.all([listVisibleSummaries(v), getTaxonomy(), getSettings()]);
  // Search & department filters narrow every number and chart on the dashboard.
  const needle = filters.q?.trim().toLowerCase();
  const summaries = visible.filter(
    (s) => (!filters.departmentId || s.departmentId === filters.departmentId) && (!needle || s.title.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle)),
  );
  const today = todayIso();
  const byId = new Map(summaries.map((s) => [s._id, s]));
  const deptName = new Map(tax.departments.map((d) => [d._id, d.name]));
  const catName = new Map(tax.categories.map((c) => [c._id, c]));

  const live = summaries.filter((s) => isLive(s.status));
  const notArchived = summaries.filter((s) => s.status !== "archived");
  const expiring = summaries.filter((s) => isExpiringSoon(s, today, settings.expiringSoonDays));
  const overdueReviews = summaries.filter((s) => isReviewOverdue(s, today));

  const assignments = await scopedAssignments(v, byId);
  const ack = ackSummary(assignments, today);
  const mineRows = assignments.filter((a) => a.userId === v.userId);
  const mineAck = ackSummary(mineRows, today);

  // Coverage: departments with at least one SOP in force.
  const activeDepts = tax.departments.filter((d) => d.active);
  const coveredIds = new Set(summaries.filter((s) => s.status === "active" || s.status === "published").map((s) => s.departmentId));
  const covered = activeDepts.filter((d) => coveredIds.has(d._id)).length;

  // Charts
  const deptCounts = new Map<string, number>();
  for (const s of notArchived) deptCounts.set(s.departmentId, (deptCounts.get(s.departmentId) ?? 0) + 1);
  const byDepartment: ChartDatum[] = Array.from(deptCounts, ([id, n]) => ({ key: id, label: deptName.get(id) ?? "Unknown", value: n, href: `/playbook-ai/library?department=${id}` })).sort((a, b) => b.value - a.value);

  const byStatus: ChartDatum[] = SOP_STATUSES.map((st) => ({
    key: st.value,
    label: st.label,
    value: summaries.filter((s) => s.status === st.value).length,
    href: `/playbook-ai/library?status=${st.value}`,
    color: st.chartColor,
  })).filter((d) => d.value > 0);

  const catCounts = new Map<string, number>();
  for (const s of notArchived) catCounts.set(s.categoryId ?? "none", (catCounts.get(s.categoryId ?? "none") ?? 0) + 1);
  const byCategory: ChartDatum[] = Array.from(catCounts, ([id, n]) => ({
    key: id,
    label: id === "none" ? "Uncategorised" : catName.get(id)?.name ?? "Unknown",
    value: n,
    href: id === "none" ? undefined : `/playbook-ai/library?category=${id}`,
    color: id === "none" ? "#94a3b8" : catName.get(id)?.color,
  })).sort((a, b) => b.value - a.value);

  const months = monthKeys(12);
  const created = new Map<string, number>();
  for (const s of summaries) created.set(monthOf(s.createdAt), (created.get(monthOf(s.createdAt)) ?? 0) + 1);
  const creationTrend = months.map((m) => ({ label: m.label, value: created.get(m.key) ?? 0 }));

  const db = await getDb();
  const since = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
  const versionRows = summaries.length
    ? await db
        .collection<SopVersionDoc>(COLLECTIONS.versions)
        .find({ sopId: { $in: Array.from(byId.keys()) }, publishedAt: { $gte: since }, changeType: { $ne: "initial" } }, { projection: { publishedAt: 1 } })
        .toArray()
    : [];
  const updated = new Map<string, number>();
  for (const r of versionRows) updated.set(monthOf(r.publishedAt), (updated.get(monthOf(r.publishedAt)) ?? 0) + 1);
  const updateTrend = months.map((m) => ({ label: m.label, value: updated.get(m.key) ?? 0 }));

  const acknowledgement: ChartDatum[] = [
    { key: "acknowledged", label: "Acknowledged", value: ack.acknowledged, color: "#22c55e", href: "/playbook-ai/compliance" },
    { key: "pending", label: "Pending", value: ack.pending, color: "#3b82f6", href: "/playbook-ai/compliance" },
    { key: "overdue", label: "Overdue", value: ack.overdue, color: "#ef4444", href: "/playbook-ai/compliance" },
  ].filter((d) => d.value > 0);

  // Compliance by department (of the assignee) — only for people who can monitor it.
  const canSeeCompliance = canViewCompliance(v);
  const compliance: ChartDatum[] = [];
  if (canSeeCompliance) {
    const groups = new Map<string, AssignmentDoc[]>();
    for (const a of assignments) groups.set(a.departmentId ?? "none", [...(groups.get(a.departmentId ?? "none") ?? []), a]);
    for (const [id, rows] of groups) {
      const s = ackSummary(rows, today);
      compliance.push({ key: id, label: id === "none" ? "No department" : deptName.get(id) ?? "Unknown", value: s.rate ?? 0, href: "/playbook-ai/compliance" });
    }
    compliance.sort((a, b) => a.value - b.value);
  }

  // Expiring SOPs: next six months + the soonest ones as a list.
  const nowMonth = new Date();
  const futureMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(nowMonth.getFullYear(), nowMonth.getMonth() + i, 1);
    return { key: monthOf(d), label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) };
  });
  const expiryCount = new Map<string, number>();
  for (const s of live) if (s.expiryDate && s.status !== "expired") expiryCount.set(s.expiryDate.slice(0, 7), (expiryCount.get(s.expiryDate.slice(0, 7)) ?? 0) + 1);
  const expiringByMonth = futureMonths.map((m) => ({ label: m.label, value: expiryCount.get(m.key) ?? 0 }));
  const expiringList = live
    .filter((s) => s.expiryDate && s.status !== "expired" && daysBetween(today, s.expiryDate as string) >= 0)
    .sort((a, b) => (a.expiryDate as string).localeCompare(b.expiryDate as string))
    .slice(0, 8)
    .map((s) => ({ id: s._id, code: s.code, title: s.title, expiryDate: s.expiryDate as string, daysLeft: daysBetween(today, s.expiryDate as string) }));

  return {
    kpis: {
      total: notArchived.length,
      published: summaries.filter((s) => s.status === "published" || s.status === "active").length,
      draft: summaries.filter((s) => s.status === "draft").length,
      active: summaries.filter((s) => s.status === "active").length,
      expiring: expiring.length,
      overdueReviews: overdueReviews.length,
      mandatory: notArchived.filter((s) => s.mandatory).length,
      ack,
      coverage: { covered, total: activeDepts.length, pct: activeDepts.length ? Math.round((covered / activeDepts.length) * 100) : 0 },
    },
    byDepartment,
    byStatus,
    byCategory,
    creationTrend,
    updateTrend,
    acknowledgement,
    compliance,
    expiringByMonth,
    expiringList,
    mine: { pending: mineAck.pending, overdue: mineAck.overdue },
    canSeeCompliance,
    expiringSoonDays: settings.expiringSoonDays,
  };
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export interface DepartmentCompliance extends AckSummary {
  departmentId: string;
  name: string;
  liveSops: number;
}
export interface SopCompliance extends AckSummary {
  sopId: string;
  code: string;
  title: string;
  departmentName: string;
  mandatory: boolean;
  version: string | null;
  nextDue: string | null;
}
export interface OverdueAssignment {
  userId: string;
  userName: string;
  sopId: string;
  sopCode: string;
  sopTitle: string;
  dueDate: string;
  daysOverdue: number;
  departmentName: string;
}
export interface ComplianceData {
  overall: AckSummary;
  byDepartment: DepartmentCompliance[];
  bySop: SopCompliance[];
  overdue: OverdueAssignment[];
  reviewOverdue: SopSummary[];
  expiringSoon: SopSummary[];
  unassignedMandatory: SopSummary[];
  scopeLabel: string;
}

export async function getCompliance(v: SopViewer): Promise<ComplianceData> {
  const [summaries, tax, settings] = await Promise.all([listVisibleSummaries(v), getTaxonomy(), getSettings()]);
  const today = todayIso();
  const deptName = new Map(tax.departments.map((d) => [d._id, d.name]));
  const inScope = (s: SopSummary) => v.isAdmin || v.manageDepartmentIds.includes(s.departmentId);
  const scopedSops = summaries.filter((s) => inScope(s));
  const byId = new Map(summaries.map((s) => [s._id, s]));
  const assignments = (await scopedAssignments(v, byId)).filter((a) => {
    const s = byId.get(a.sopId);
    return !!s && (v.isAdmin || inScope(s) || v.manageDepartmentIds.includes(a.departmentId ?? ""));
  });

  const groups = new Map<string, AssignmentDoc[]>();
  for (const a of assignments) groups.set(a.departmentId ?? "none", [...(groups.get(a.departmentId ?? "none") ?? []), a]);
  const liveByDept = new Map<string, number>();
  for (const s of scopedSops) if (s.status === "active" || s.status === "published") liveByDept.set(s.departmentId, (liveByDept.get(s.departmentId) ?? 0) + 1);

  const deptIds = new Set<string>([...groups.keys(), ...liveByDept.keys()]);
  const byDepartment: DepartmentCompliance[] = Array.from(deptIds)
    .map((id) => ({
      departmentId: id,
      name: id === "none" ? "No department" : deptName.get(id) ?? "Unknown",
      liveSops: liveByDept.get(id) ?? 0,
      ...ackSummary(groups.get(id) ?? [], today),
    }))
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.name.localeCompare(b.name));

  const perSop = new Map<string, AssignmentDoc[]>();
  for (const a of assignments) perSop.set(a.sopId, [...(perSop.get(a.sopId) ?? []), a]);
  const bySop: SopCompliance[] = scopedSops
    .filter((s) => perSop.has(s._id))
    .map((s) => {
      const rows = perSop.get(s._id) ?? [];
      const open = rows.filter((r) => !r.acknowledgedAt && r.dueDate).map((r) => r.dueDate as string).sort();
      return {
        sopId: s._id,
        code: s.code,
        title: s.title,
        departmentName: deptName.get(s.departmentId) ?? "Unknown",
        mandatory: s.mandatory,
        version: s.version,
        nextDue: open[0] ?? null,
        ...ackSummary(rows, today),
      };
    })
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));

  const overdue: OverdueAssignment[] = assignments
    .filter((a) => assignmentState(a, today) === "overdue")
    .map((a) => ({
      userId: a.userId,
      userName: a.userName,
      sopId: a.sopId,
      sopCode: a.sopCode,
      sopTitle: byId.get(a.sopId)?.title ?? a.sopCode,
      dueDate: a.dueDate as string,
      daysOverdue: daysBetween(a.dueDate as string, today),
      departmentName: a.departmentId ? deptName.get(a.departmentId) ?? "Unknown" : "No department",
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    overall: ackSummary(assignments, today),
    byDepartment,
    bySop,
    overdue,
    reviewOverdue: scopedSops.filter((s) => isReviewOverdue(s, today)),
    expiringSoon: scopedSops.filter((s) => isExpiringSoon(s, today, settings.expiringSoonDays)),
    unassignedMandatory: scopedSops.filter((s) => s.mandatory && (s.status === "active" || s.status === "published") && !perSop.has(s._id)),
    scopeLabel: v.isAdmin ? "All departments" : v.manageDepartmentIds.map((d) => deptName.get(d) ?? "").filter(Boolean).join(", ") || "Your departments",
  };
}

// ---------------------------------------------------------------------------
// Per-SOP assignment stats (library "compliance" filter / SOP page)
// ---------------------------------------------------------------------------

export async function assignmentStatsBySop(v: SopViewer, summaries: SopSummary[]): Promise<Map<string, AckSummary>> {
  const out = new Map<string, AckSummary>();
  const monitorable = summaries.filter((s) => (v.isAdmin || v.manageDepartmentIds.includes(s.departmentId)) && (s.status === "active" || s.status === "published"));
  if (monitorable.length === 0) return out;
  const db = await getDb();
  const rows = await db
    .collection<AssignmentDoc>(COLLECTIONS.assignments)
    .find({ sopId: { $in: monitorable.map((s) => s._id) } }, { projection: { sopId: 1, acknowledgedAt: 1, dueDate: 1 } })
    .toArray();
  const today = todayIso();
  const grouped = new Map<string, AssignmentDoc[]>();
  for (const r of rows) grouped.set(r.sopId, [...(grouped.get(r.sopId) ?? []), r]);
  for (const s of monitorable) out.set(s._id, ackSummary(grouped.get(s._id) ?? [], today));
  return out;
}

// ---------------------------------------------------------------------------
// "Assigned to me"
// ---------------------------------------------------------------------------

export interface AssignedRow {
  assignment: AssignmentDoc;
  sop: SopSummary;
  state: AssignmentState;
  checklist: { done: number; total: number };
  daysUntilDue: number | null;
}

export async function getAssignedToMe(v: SopViewer): Promise<AssignedRow[]> {
  const db = await getDb();
  const mine = await db.collection<AssignmentDoc>(COLLECTIONS.assignments).find({ userId: v.userId }).sort({ assignedAt: -1 }).toArray();
  if (mine.length === 0) return [];
  const summaries = await listVisibleSummaries(v);
  const byId = new Map(summaries.map((s) => [s._id, s]));
  const liveDocs = await db
    .collection<SopDoc>(COLLECTIONS.sops)
    .find({ _id: { $in: mine.map((m) => m.sopId) }, ...notDeleted }, { projection: { live: 1 } })
    .toArray();
  const liveById = new Map(liveDocs.map((d) => [d._id, d.live]));
  const today = todayIso();
  const rows: AssignedRow[] = [];
  for (const a of mine) {
    const sop = byId.get(a.sopId);
    if (!sop || sop.status === "archived" || sop.status === "draft") continue;
    rows.push({
      assignment: a,
      sop,
      state: assignmentState(a, today),
      checklist: checklistProgress(liveById.get(a.sopId) ?? null, a.checklist),
      daysUntilDue: a.dueDate ? daysBetween(today, a.dueDate) : null,
    });
  }
  const order: Record<AssignmentState, number> = { overdue: 0, pending: 1, acknowledged: 2 };
  return rows.sort((a, b) => order[a.state] - order[b.state] || (a.assignment.dueDate ?? "9999").localeCompare(b.assignment.dueDate ?? "9999"));
}

// ---------------------------------------------------------------------------
// Acknowledgement detail (reports / export)
// ---------------------------------------------------------------------------

export interface AckDetailRow {
  sopCode: string;
  sopTitle: string;
  version: string | null;
  department: string;
  person: string;
  personDepartment: string;
  assignedBy: string;
  assignedVia: string;
  assignedAt: Date;
  dueDate: string | null;
  viewedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedVersion: string | null;
  state: AssignmentState;
}

/** Every assignment the viewer may monitor, joined with its SOP — one row per person per SOP. */
export async function getAckDetail(v: SopViewer): Promise<AckDetailRow[]> {
  const [summaries, tax] = await Promise.all([listVisibleSummaries(v), getTaxonomy()]);
  const byId = new Map(summaries.map((s) => [s._id, s]));
  const deptName = new Map(tax.departments.map((d) => [d._id, d.name]));
  const today = todayIso();
  const rows = await scopedAssignments(v, byId);
  return rows
    .filter((a) => v.isAdmin || v.manageDepartmentIds.includes(byId.get(a.sopId)?.departmentId ?? "") || v.manageDepartmentIds.includes(a.departmentId ?? "") || a.userId === v.userId)
    .map((a) => {
      const s = byId.get(a.sopId) as SopSummary;
      return {
        sopCode: a.sopCode,
        sopTitle: s.title,
        version: s.version,
        department: deptName.get(s.departmentId) ?? "Unknown",
        person: a.userName,
        personDepartment: a.departmentId ? deptName.get(a.departmentId) ?? "Unknown" : "—",
        assignedBy: a.assignedByName,
        assignedVia: a.source.label,
        assignedAt: a.assignedAt,
        dueDate: a.dueDate,
        viewedAt: a.viewedAt,
        acknowledgedAt: a.acknowledgedAt,
        acknowledgedVersion: a.acknowledgedVersion,
        state: assignmentState(a, today),
      };
    });
}
