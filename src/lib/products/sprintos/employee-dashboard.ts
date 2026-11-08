import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/sprintos/db";
import { PROJECTS_COLLECTION, type Project } from "@/lib/products/sprintos/projects";
import { MEMBERS_COLLECTION } from "@/lib/products/sprintos/project-members";
import { TASKS_COLLECTION, type Task } from "@/lib/products/sprintos/tasks";
import {
  hoursSummary,
  hoursTrend,
  hoursByProject,
  listEntries,
  employeeProjectHours,
} from "@/lib/products/sprintos/timesheets";
import { getClient } from "@/lib/products/sprintos/clients";
import { ACTIVE_PROJECT_STATUSES, computeProjectHealth } from "@/lib/products/sprintos/constants";
import { employeeFullName, EMPLOYEES_COLLECTION, type Employee } from "@/lib/products/talentos/employees";

export interface EmployeeProjectRow {
  _id: string;
  projectCode: string;
  name: string;
  clientName: string;
  managerName: string;
  status: string;
  priority: string;
  progressPercent: number;
  startDate: string | null;
  endDate: string | null;
  estimatedHours: number | null;
  myLoggedHours: number;
  remainingHours: number | null;
  health: string;
}

export interface EmployeeDashboard {
  assignedProjects: number;
  activeTasks: number;
  completedTasks: number;
  pendingTasks: number;
  todayHours: number;
  weekHours: number;
  monthHours: number;
  /** completed / (completed + open) tasks, %. */
  productivity: number;
  hoursTrend: { date: string; count: number }[];
  hoursByProject: { label: string; value: number }[];
  projects: EmployeeProjectRow[];
  upcomingDeadlines: { id: string; title: string; projectId: string; date: string; overdue: boolean }[];
  recentTasks: { id: string; title: string; projectId: string; status: string; updatedAt: string }[];
  recentEntries: {
    id: string;
    date: string;
    hours: number;
    projectId: string;
    status: string;
    billable: boolean;
    description: string | null;
  }[];
}

export async function getEmployeeDashboard(
  employeeId: string,
  range: { dateFrom: string; dateTo: string }
): Promise<EmployeeDashboard> {
  const db = await getDb();
  const projectsCol = db.collection<Project>(PROJECTS_COLLECTION);
  const tasksCol = db.collection<Task>(TASKS_COLLECTION);
  const membersCol = db.collection(MEMBERS_COLLECTION);
  const employeesCol = db.collection<Employee>(EMPLOYEES_COLLECTION);

  const [memberProjectIds, managedIds] = await Promise.all([
    membersCol.distinct("projectId", { employeeId, active: true, ...notDeleted }),
    projectsCol.distinct("_id", { projectManagerId: employeeId, ...notDeleted }),
  ]);
  const projectIds = Array.from(new Set([...(memberProjectIds as string[]), ...(managedIds as string[])]));

  const [projectDocs, myTasks, summary, trend, byProject, recentEntryDocs] = await Promise.all([
    projectsCol.find({ _id: { $in: projectIds }, ...notDeleted }).toArray(),
    tasksCol.find({ assigneeId: employeeId, ...notDeleted }).sort({ updatedAt: -1 }).toArray(),
    hoursSummary(employeeId, range),
    hoursTrend(employeeId, range),
    hoursByProject(employeeId, range),
    listEntries({ employeeId, limit: 8 }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const done = myTasks.filter((t) => t.status === "done");
  const open = myTasks.filter((t) => t.status !== "done");
  const inProgress = myTasks.filter((t) => t.status === "in_progress" || t.status === "review" || t.status === "testing");
  const pending = myTasks.filter((t) => t.status === "todo");

  // Resolve client + manager names for project rows.
  const clientIds = Array.from(new Set(projectDocs.map((p) => p.clientId)));
  const managerIds = Array.from(new Set(projectDocs.map((p) => p.projectManagerId).filter((x): x is string => Boolean(x))));
  const [clients, managers, myHoursPerProject] = await Promise.all([
    Promise.all(clientIds.map((id) => getClient(id))),
    employeesCol.find({ _id: { $in: managerIds } }, { projection: { firstName: 1, lastName: 1 } }).toArray(),
    Promise.all(projectDocs.map((p) => employeeProjectHours(employeeId, p._id))),
  ]);
  const clientNameById = new Map(clients.filter(Boolean).map((c) => [c!._id, c!.companyName]));
  const managerNameById = new Map(managers.map((m) => [m._id, employeeFullName(m)]));

  const projects: EmployeeProjectRow[] = projectDocs
    .map((p, i): EmployeeProjectRow => {
      const myLoggedHours = myHoursPerProject[i];
      return {
        _id: p._id,
        projectCode: p.projectCode,
        name: p.name,
        clientName: clientNameById.get(p.clientId) ?? "—",
        managerName: p.projectManagerId ? managerNameById.get(p.projectManagerId) ?? "—" : "—",
        status: p.status,
        priority: p.priority,
        progressPercent: p.progressPercent,
        startDate: p.startDate,
        endDate: p.endDate,
        estimatedHours: p.estimatedHours ?? null,
        myLoggedHours,
        remainingHours: p.estimatedHours != null ? Math.round((p.estimatedHours - myLoggedHours) * 10) / 10 : null,
        health: computeProjectHealth(p),
      };
    })
    .sort((a, b) => {
      const aActive = (ACTIVE_PROJECT_STATUSES as string[]).includes(a.status) ? 0 : 1;
      const bActive = (ACTIVE_PROJECT_STATUSES as string[]).includes(b.status) ? 0 : 1;
      return aActive - bActive || a.name.localeCompare(b.name);
    });

  const upcomingDeadlines = open
    .filter((t) => t.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 6)
    .map((t) => ({
      id: t._id,
      title: t.title,
      projectId: t.projectId,
      date: t.dueDate as string,
      overdue: (t.dueDate as string) < today,
    }));

  return {
    assignedProjects: projectDocs.filter((p) => (ACTIVE_PROJECT_STATUSES as string[]).includes(p.status)).length,
    activeTasks: inProgress.length,
    completedTasks: done.length,
    pendingTasks: pending.length,
    todayHours: summary.today,
    weekHours: summary.week,
    monthHours: summary.month,
    productivity: myTasks.length > 0 ? Math.round((done.length / myTasks.length) * 100) : 0,
    hoursTrend: trend,
    hoursByProject: byProject,
    projects,
    upcomingDeadlines,
    recentTasks: myTasks.slice(0, 6).map((t) => ({
      id: t._id,
      title: t.title,
      projectId: t.projectId,
      status: t.status,
      updatedAt: new Date(t.updatedAt).toISOString(),
    })),
    recentEntries: recentEntryDocs.map((e) => ({
      id: e._id,
      date: e.date,
      hours: e.hours,
      projectId: e.projectId,
      status: e.status,
      billable: e.billable,
      description: e.description,
    })),
  };
}
