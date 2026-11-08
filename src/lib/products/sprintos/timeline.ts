import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/sprintos/db";
import { TASKS_COLLECTION } from "@/lib/products/sprintos/tasks";
import { MILESTONES_COLLECTION } from "@/lib/products/sprintos/milestones";
import { PROJECTS_COLLECTION } from "@/lib/products/sprintos/projects";

/**
 * Timeline / calendar aggregation. Everything here is date-string maths on
 * `yyyy-mm-dd` — no timezone handling needed.
 */

export interface TimelineBar {
  id: string;
  kind: "task" | "milestone";
  title: string;
  code: string | null;
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd
  status: string;
  progressPercent: number;
  href: string;
}

export interface ProjectTimeline {
  from: string;
  to: string;
  bars: TimelineBar[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysStr(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00`);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}

export async function getProjectTimeline(projectId: string): Promise<ProjectTimeline> {
  const db = await getDb();
  const tasks = db.collection(TASKS_COLLECTION);
  const milestones = db.collection(MILESTONES_COLLECTION);
  const projects = db.collection<{ _id: string; startDate: string | null; endDate: string | null }>(PROJECTS_COLLECTION);

  const [project, taskRows, milestoneRows] = await Promise.all([
    projects.findOne({ _id: projectId }),
    tasks
      .find({ projectId, parentTaskId: null, ...notDeleted }, {
        projection: { title: 1, taskCode: 1, startDate: 1, dueDate: 1, status: 1 },
      })
      .toArray(),
    milestones
      .find({ projectId, ...notDeleted }, { projection: { name: 1, dueDate: 1, status: 1 } })
      .toArray(),
  ]);

  const bars: TimelineBar[] = [];
  const today = todayStr();

  for (const t of taskRows) {
    const start = (t.startDate as string | null) ?? (t.dueDate as string | null);
    const end = (t.dueDate as string | null) ?? (t.startDate as string | null);
    if (!start || !end) continue;
    bars.push({
      id: String(t._id),
      kind: "task",
      title: t.title as string,
      code: (t.taskCode as string) ?? null,
      start: start <= end ? start : end,
      end: end >= start ? end : start,
      status: t.status as string,
      progressPercent: t.status === "done" ? 100 : 0,
      href: `/sprintos/projects/${projectId}/tasks/${t._id}`,
    });
  }
  for (const m of milestoneRows) {
    const due = m.dueDate as string | null;
    if (!due) continue;
    bars.push({
      id: String(m._id),
      kind: "milestone",
      title: m.name as string,
      code: null,
      start: due,
      end: due,
      status: m.status as string,
      progressPercent: m.status === "completed" ? 100 : 0,
      href: `/sprintos/projects/${projectId}`,
    });
  }

  const allDates = [
    ...bars.flatMap((b) => [b.start, b.end]),
    project?.startDate ?? null,
    project?.endDate ?? null,
  ].filter((d): d is string => Boolean(d));

  const from = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : addDaysStr(today, -7);
  const to = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : addDaysStr(today, 30);

  bars.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return { from, to, bars };
}

export interface DeadlineItem {
  id: string;
  kind: "task" | "milestone" | "project";
  title: string;
  projectId: string;
  projectName: string;
  date: string;
  status: string;
  overdue: boolean;
  href: string;
}

/** Upcoming + overdue deadlines across all projects (or one employee's work). */
export async function getUpcomingDeadlines(opts: { restrictToEmployeeId?: string; days?: number } = {}): Promise<DeadlineItem[]> {
  const db = await getDb();
  const days = opts.days ?? 45;
  const today = todayStr();
  const horizon = addDaysStr(today, days);

  const projectsCol = db.collection<{ _id: string; name: string; status: string; endDate: string | null; projectManagerId: string | null }>(PROJECTS_COLLECTION);

  // Scope to relevant projects.
  let projectIds: string[] | null = null;
  if (opts.restrictToEmployeeId) {
    const memberCol = db.collection("pms_project_members");
    const [mine, managed] = await Promise.all([
      memberCol.distinct("projectId", { employeeId: opts.restrictToEmployeeId, active: true, deletedAt: null }),
      projectsCol.distinct("_id", { projectManagerId: opts.restrictToEmployeeId, deletedAt: null }),
    ]);
    projectIds = Array.from(new Set([...(mine as string[]), ...(managed as string[])]));
  }

  const projectFilter: Record<string, unknown> = { deletedAt: null };
  if (projectIds) projectFilter._id = { $in: projectIds };

  const projects = await projectsCol.find(projectFilter).toArray();
  const projById = new Map(projects.map((p) => [p._id, p]));
  const scopedIds = projects.map((p) => p._id);

  const tasksCol = db.collection(TASKS_COLLECTION);
  const milestonesCol = db.collection(MILESTONES_COLLECTION);

  const taskFilter: Record<string, unknown> = {
    projectId: { $in: scopedIds },
    deletedAt: null,
    dueDate: { $ne: null, $lte: horizon },
    status: { $ne: "done" },
  };
  if (opts.restrictToEmployeeId) taskFilter.assigneeId = opts.restrictToEmployeeId;

  const [taskRows, milestoneRows] = await Promise.all([
    tasksCol.find(taskFilter, { projection: { title: 1, dueDate: 1, status: 1, projectId: 1 } }).toArray(),
    milestonesCol
      .find(
        { projectId: { $in: scopedIds }, deletedAt: null, dueDate: { $ne: null, $lte: horizon }, status: { $ne: "completed" } },
        { projection: { name: 1, dueDate: 1, status: 1, projectId: 1 } }
      )
      .toArray(),
  ]);

  const items: DeadlineItem[] = [];

  for (const t of taskRows) {
    const proj = projById.get(String(t.projectId));
    const date = t.dueDate as string;
    items.push({
      id: String(t._id),
      kind: "task",
      title: t.title as string,
      projectId: String(t.projectId),
      projectName: proj?.name ?? "Unknown",
      date,
      status: t.status as string,
      overdue: date < today,
      href: `/sprintos/projects/${t.projectId}/tasks/${t._id}`,
    });
  }
  for (const m of milestoneRows) {
    const proj = projById.get(String(m.projectId));
    const date = m.dueDate as string;
    items.push({
      id: String(m._id),
      kind: "milestone",
      title: m.name as string,
      projectId: String(m.projectId),
      projectName: proj?.name ?? "Unknown",
      date,
      status: m.status as string,
      overdue: date < today,
      href: `/sprintos/projects/${m.projectId}`,
    });
  }
  if (!opts.restrictToEmployeeId) {
    for (const p of projects) {
      if (!p.endDate || p.endDate > horizon) continue;
      if (p.status === "completed" || p.status === "cancelled") continue;
      items.push({
        id: p._id,
        kind: "project",
        title: `${p.name} — project deadline`,
        projectId: p._id,
        projectName: p.name,
        date: p.endDate,
        status: p.status,
        overdue: p.endDate < today,
        href: `/sprintos/projects/${p._id}`,
      });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}
