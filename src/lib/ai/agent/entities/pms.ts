import "server-only";
import { getClient, createClient, updateClient, deleteClient, type Client } from "@/lib/products/sprintos/clients";
import { getProject, createProject, updateProject, deleteProject, changeProjectStatus } from "@/lib/products/sprintos/projects";
import { getTask, createTask, updateTask, deleteTask, recomputeProjectProgress } from "@/lib/products/sprintos/tasks";
import { getMilestone, createMilestone, updateMilestone, deleteMilestone } from "@/lib/products/sprintos/milestones";
import { getMember, upsertMember, updateMember, removeMember, projectIdsForEmployee } from "@/lib/products/sprintos/project-members";
import { createEntry, updateEntry, deleteEntry, getEntry, submitEntries, reviewEntry, listEntries, isDuplicate, hasOverlap, dayHoursTotal } from "@/lib/products/sprintos/timesheets";
import { addComment, deleteComment } from "@/lib/products/sprintos/task-comments";
import { computeProjectFinancials, getPortfolioCosting, updateCostingConfig } from "@/lib/products/sprintos/costing";
import { buildProjectReport } from "@/lib/products/sprintos/reports";
import { getPmsDashboardStats } from "@/lib/products/sprintos/dashboard";
import { getPmsSettings, normalizeSettingsInput, updatePmsSettings } from "@/lib/products/sprintos/settings";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { recordActivity, diffSummary } from "@/lib/products/sprintos/activity";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";
import { validateClient, validateProject, validateTask, validateMilestone, validateMember, validateTimesheet, validateCostingConfig } from "@/lib/products/sprintos/validation";
import { isTaskDone, getTaskStatusMeta, getProjectStatusMeta, getMemberRoleLabel, EDITABLE_TIMESHEET_STATUSES, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES, PROJECT_MEMBER_ROLES, CLIENT_STATUSES, MILESTONE_STATUSES } from "@/lib/products/sprintos/constants";
import { hasLevel } from "@/lib/ai/agent/access";
import { canManageClients, canManageProjects, canReviewTimesheets, canViewCosting, canManageSettings } from "@/lib/pms-roles";
import { check, fail, formInput, str } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * PMS for the agent. Every write goes through the product's own validators and functions and repeats what its screens do around
 * them: activity log, notifications, project progress, messenger channel sync. Employees (pms_employee) see and change only
 * their own work, exactly as in the product's "My work" screens.
 */

const soft = { deletedAt: null };
const PRIORITY: string[] = PRIORITIES.map((x) => x.value);
const PROJECT_STATUS: string[] = PROJECT_STATUSES.map((x) => x.value);
const TASK_STATUS: string[] = TASK_STATUSES.map((x) => x.value);
const MEMBER_ROLES: string[] = PROJECT_MEMBER_ROLES.map((x) => x.value);
const CLIENT_STATUS: string[] = CLIENT_STATUSES.map((x) => x.value);
const MILESTONE_STATUS: string[] = MILESTONE_STATUSES.map((x) => x.value);

const isStaff = (u: AgentUser) => hasLevel(u.roles, "pms", "staff");
const isAdmin = (u: AgentUser) => hasLevel(u.roles, "pms", "admin");

async function syncMessenger(projectId: string): Promise<void> {
  try {
    const { syncProjectChannel } = await import("@/lib/products/huddle-ai/projects");
    await syncProjectChannel(projectId);
  } catch { /* the messenger link is optional */ }
}

/** Projects an employee takes part in: ones they manage or are an active member of. */
async function myProjectFilter(u: AgentUser): Promise<Json | null> {
  if (!u.employeeId) return null;
  const ids = await projectIdsForEmployee(u.employeeId);
  return { $or: [{ _id: { $in: ids } }, { projectManagerId: u.employeeId }] };
}
async function myProjectIds(u: AgentUser): Promise<string[]> {
  if (!u.employeeId) return [];
  const mine = await projectIdsForEmployee(u.employeeId);
  const db = await (await import("@/lib/mongodb")).getDb();
  const managed = await db.collection<{ _id: string }>("pms_projects").find({ projectManagerId: u.employeeId, deletedAt: null }, { projection: { _id: 1 } }).toArray();
  return Array.from(new Set([...mine, ...managed.map((p) => p._id)]));
}
const inMyProjects = (field: string) => async (u: AgentUser): Promise<Json | null> => (u.employeeId ? { [field]: { $in: await myProjectIds(u) } } : null);

const clientInput = (c: Client): Json => ({
  companyName: c.companyName, industry: c.industry, website: c.website, status: c.status, contactName: c.primaryContact.name, contactEmail: c.primaryContact.email, contactPhone: c.primaryContact.phone,
  contactDesignation: c.primaryContact.designation, billingAddress: c.billing.addressLine, billingCity: c.billing.city, billingCountry: c.billing.country, billingGstin: c.billing.gstin,
  billingCurrency: c.billing.currency, paymentTermsDays: c.billing.paymentTermsDays, notes: c.notes, tags: c.tags,
});

export const PMS_ENTITIES: EntityDef[] = [
  {
    key: "pms.client", panel: "pms", label: "Client", description: "Customers you run projects for (company, contact, billing details, status).", collection: "pms_clients", idType: "string", baseFilter: soft,
    titleField: "companyName", search: ["companyName", "clientCode", "industry", "primaryContact.name", "primaryContact.email"], read: "staff", write: "staff", allow: canManageClients, canDelete: true,
    fields: [
      { key: "companyName", label: "Company name", type: "string", required: true },
      { key: "industry", label: "Industry", type: "string" },
      { key: "website", label: "Website (https://…)", type: "string" },
      { key: "status", label: "Status", type: "enum", options: CLIENT_STATUS },
      { key: "contactName", label: "Primary contact name", type: "string", required: true },
      { key: "contactEmail", label: "Contact email", type: "email" },
      { key: "contactPhone", label: "Contact phone", type: "string" },
      { key: "contactDesignation", label: "Contact designation", type: "string" },
      { key: "billingAddress", label: "Billing address", type: "string" },
      { key: "billingCity", label: "City", type: "string" },
      { key: "billingCountry", label: "Country", type: "string" },
      { key: "billingGstin", label: "GSTIN / tax id", type: "string" },
      { key: "billingCurrency", label: "Billing currency (e.g. INR)", type: "string" },
      { key: "paymentTermsDays", label: "Payment terms (days)", type: "number" },
      { key: "notes", label: "Notes", type: "text" },
      { key: "tags", label: "Tags", type: "stringList" },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateClient(v));
        if (!c.ok) return c.error;
        const created = await createClient(c.data, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "create", entity: "client", entityId: created._id, entityLabel: c.data.companyName });
        return { ok: true, id: created._id, record: created };
      },
      update: async (id, v, u) => {
        const before = await getClient(id);
        if (!before) return fail("Client not found.");
        const c = check(validateClient(formInput(clientInput(before), v)));
        if (!c.ok) return c.error;
        const updated = await updateClient(id, c.data, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "update", entity: "client", entityId: id, entityLabel: c.data.companyName, summary: diffSummary({ name: before.companyName, status: before.status, industry: before.industry }, { name: c.data.companyName, status: c.data.status, industry: c.data.industry }, ["name", "status", "industry"]) });
        return { ok: true, id, record: updated };
      },
      remove: async (id, u) => {
        const before = await getClient(id);
        const r = await deleteClient(id, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not delete the client.");
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "delete", entity: "client", entityId: id, entityLabel: before?.companyName ?? null });
        return { ok: true, id };
      },
    },
  },
  {
    key: "pms.project", panel: "pms", label: "Project", description: "Projects: client, status, priority, dates, budget, manager, progress.", collection: "pms_projects", idType: "string", baseFilter: soft,
    titleField: "name", search: ["name", "projectCode", "category", "description"], read: "staff", write: "staff", allow: canManageProjects, canDelete: true, self: myProjectFilter,
    fields: [
      { key: "name", label: "Project name", type: "string", required: true },
      { key: "clientId", label: "Client (pms.client id)", type: "ref", ref: "pms.client", required: true },
      { key: "category", label: "Category", type: "string" },
      { key: "description", label: "Description", type: "text" },
      { key: "priority", label: "Priority", type: "enum", options: PRIORITY },
      { key: "status", label: "Status", type: "enum", options: PROJECT_STATUS },
      { key: "startDate", label: "Start date", type: "dateString" },
      { key: "endDate", label: "End date", type: "dateString" },
      { key: "estimatedBudget", label: "Estimated budget", type: "number" },
      { key: "estimatedHours", label: "Estimated hours", type: "number" },
      { key: "currency", label: "Currency", type: "string" },
      { key: "projectManagerId", label: "Project manager (hrms.employee id)", type: "ref", ref: "hrms.employee" },
      { key: "technologies", label: "Technologies", type: "stringList" },
      { key: "progressPercent", label: "Progress % (0-100)", type: "number" },
    ],
    ops: {
      create: async (v, u) => {
        const c = check(validateProject(v));
        if (!c.ok) return c.error;
        if (!(await getClient(c.data.clientId))) return fail("That client doesn't exist. Look it up with find_records on pms.client.");
        const created = await createProject(c.data, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "create", entity: "project", entityId: created._id, entityLabel: `${created.projectCode} · ${c.data.name}`, projectId: created._id });
        await syncMessenger(created._id);
        return { ok: true, id: created._id, record: created };
      },
      update: async (id, v, u) => {
        const before = await getProject(id);
        if (!before) return fail("Project not found.");
        const c = check(validateProject(formInput(before as unknown as Json, v)));
        if (!c.ok) return c.error;
        const { status, ...rest } = c.data;
        if (status !== before.status) {
          const res = await changeProjectStatus(id, status, u.id);
          if (!res.ok) return fail(res.reason);
        }
        const updated = await updateProject(id, rest, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "update", entity: "project", entityId: id, entityLabel: c.data.name, projectId: id, summary: diffSummary({ name: before.name, priority: before.priority, progress: before.progressPercent, pm: before.projectManagerId }, { name: c.data.name, priority: c.data.priority, progress: c.data.progressPercent, pm: c.data.projectManagerId }, ["name", "priority", "progress", "pm"]) });
        await syncMessenger(id);
        return { ok: true, id, record: updated };
      },
      remove: async (id, u) => {
        const before = await getProject(id);
        const r = await deleteProject(id, u.id);
        if (!r.ok) return fail("Could not delete the project.");
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "delete", entity: "project", entityId: id, entityLabel: before?.name ?? null, projectId: id });
        await syncMessenger(id);
        return { ok: true, id };
      },
    },
  },
  {
    key: "pms.task", panel: "pms", label: "Task", description: "Tasks inside projects (todo → in_progress → review → testing → done) with assignee, priority, dates.", collection: "pms_tasks", idType: "string", baseFilter: soft,
    titleField: "title", search: ["title", "taskCode", "description"], read: "staff", write: "staff", allow: canManageProjects, canDelete: true,
    self: async (u) => {
      if (!u.employeeId) return null;
      return { $or: [{ assigneeId: u.employeeId }, { projectId: { $in: await myProjectIds(u) } }] };
    },
    fields: [
      { key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true, createOnly: true },
      { key: "title", label: "Title", type: "string", required: true },
      { key: "description", label: "Description", type: "text" },
      { key: "status", label: "Status", type: "enum", options: TASK_STATUS },
      { key: "priority", label: "Priority", type: "enum", options: PRIORITY },
      { key: "assigneeId", label: "Assignee (hrms.employee id)", type: "ref", ref: "hrms.employee" },
      { key: "labels", label: "Labels", type: "stringList" },
      { key: "startDate", label: "Start date", type: "dateString" },
      { key: "dueDate", label: "Due date", type: "dateString" },
      { key: "estimateHours", label: "Estimate (hours)", type: "number" },
      { key: "parentTaskId", label: "Parent task id (for a subtask)", type: "ref", ref: "pms.task" },
    ],
    ops: {
      create: async (v, u) => {
        const project = await getProject(String(v.projectId));
        if (!project) return fail("Project not found.");
        const { projectId: _p, ...rest } = v;
        void _p;
        const c = check(validateTask(rest));
        if (!c.ok) return c.error;
        const created = await createTask(project._id, c.data, u.id);
        if (created.assigneeId) {
          await notifyEmployees([created.assigneeId], (uid) => ({ recipientUserId: uid, type: "task_assigned", title: `You were assigned: ${created.title}`, body: `${project.name} · ${created.taskCode}`, link: `/sprintos/projects/${project._id}/tasks/${created._id}`, projectId: project._id }), u.id);
        }
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "create", entity: "task", entityId: created._id, entityLabel: `${created.taskCode} · ${c.data.title}`, projectId: project._id });
        await recomputeProjectProgress(project._id);
        return { ok: true, id: created._id, record: created };
      },
      update: async (id, v, u) => {
        const before = await getTask(id);
        if (!before) return fail("Task not found.");
        const project = await getProject(before.projectId);
        const c = check(validateTask(formInput(before as unknown as Json, v)));
        if (!c.ok) return c.error;
        const updated = await updateTask(id, c.data, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "update", entity: "task", entityId: id, entityLabel: c.data.title, projectId: before.projectId, summary: diffSummary({ status: before.status, assignee: before.assigneeId, priority: before.priority, due: before.dueDate }, { status: c.data.status, assignee: c.data.assigneeId, priority: c.data.priority, due: c.data.dueDate }, ["status", "assignee", "priority", "due"]) });
        await recomputeProjectProgress(before.projectId);
        if (c.data.assigneeId && c.data.assigneeId !== before.assigneeId) {
          await notifyEmployees([c.data.assigneeId], (uid) => ({ recipientUserId: uid, type: "task_assigned", title: `You were assigned: ${c.data.title}`, body: `${project?.name ?? ""} · ${before.taskCode}`, link: `/sprintos/projects/${before.projectId}/tasks/${id}`, projectId: before.projectId }), u.id);
        }
        if (isTaskDone(c.data.status) && !isTaskDone(before.status) && project?.projectManagerId) {
          await notifyEmployees([project.projectManagerId], (uid) => ({ recipientUserId: uid, type: "task_completed", title: `Task completed: ${c.data.title}`, body: `${project.name} · ${before.taskCode}`, link: `/sprintos/projects/${before.projectId}/tasks/${id}`, projectId: before.projectId }), u.id);
        }
        return { ok: true, id, record: updated };
      },
      remove: async (id, u) => {
        const before = await getTask(id);
        if (!before) return fail("Task not found.");
        await deleteTask(id, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "delete", entity: "task", entityId: id, entityLabel: before.title, projectId: before.projectId });
        await recomputeProjectProgress(before.projectId);
        return { ok: true, id };
      },
    },
  },
  {
    key: "pms.milestone", panel: "pms", label: "Milestone", description: "Project milestones with due date, status and progress.", collection: "pms_milestones", idType: "string", baseFilter: soft,
    titleField: "name", search: ["name", "description"], read: "staff", write: "staff", allow: canManageProjects, canDelete: true, self: inMyProjects("projectId"),
    fields: [
      { key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true, createOnly: true },
      { key: "name", label: "Name", type: "string", required: true },
      { key: "description", label: "Description", type: "text" },
      { key: "dueDate", label: "Due date", type: "dateString" },
      { key: "status", label: "Status", type: "enum", options: MILESTONE_STATUS },
      { key: "manualProgressPercent", label: "Progress % (0-100)", type: "number" },
      { key: "linkedTaskIds", label: "Linked task ids", type: "stringList" },
    ],
    ops: {
      create: async (v, u) => {
        const project = await getProject(String(v.projectId));
        if (!project) return fail("Project not found.");
        const c = check(validateMilestone(v));
        if (!c.ok) return c.error;
        const created = await createMilestone(project._id, c.data, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "create", entity: "milestone", entityId: created._id, entityLabel: c.data.name, projectId: project._id });
        return { ok: true, id: created._id, record: created };
      },
      update: async (id, v, u) => {
        const before = await getMilestone(id);
        if (!before) return fail("Milestone not found.");
        const project = await getProject(before.projectId);
        const c = check(validateMilestone(formInput(before as unknown as Json, v)));
        if (!c.ok) return c.error;
        const updated = await updateMilestone(id, c.data, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "update", entity: "milestone", entityId: id, entityLabel: c.data.name, projectId: before.projectId, summary: diffSummary({ name: before.name, status: before.status, due: before.dueDate, links: before.linkedTaskIds.length }, { name: c.data.name, status: c.data.status, due: c.data.dueDate, links: c.data.linkedTaskIds.length }, ["name", "status", "due", "links"]) });
        if (c.data.status === "completed" && before.status !== "completed" && project?.projectManagerId) {
          await notifyEmployees([project.projectManagerId], (uid) => ({ recipientUserId: uid, type: "milestone_completed", title: `Milestone completed: ${c.data.name}`, body: project.name, link: `/sprintos/projects/${before.projectId}`, projectId: before.projectId }), u.id);
        }
        return { ok: true, id, record: updated };
      },
      remove: async (id, u) => {
        const before = await getMilestone(id);
        if (!before) return fail("Milestone not found.");
        await deleteMilestone(id, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "delete", entity: "milestone", entityId: id, entityLabel: before.name, projectId: before.projectId });
        return { ok: true, id };
      },
    },
  },
  {
    key: "pms.member", panel: "pms", label: "Project member", description: "Who is on a project: role, allocation %, billable and cost rate.", collection: "pms_project_members", idType: "string", baseFilter: soft,
    read: "staff", write: "staff", allow: canManageProjects, canDelete: true, self: inMyProjects("projectId"),
    fields: [
      { key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true, createOnly: true },
      { key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee", required: true, createOnly: true },
      { key: "role", label: "Role", type: "enum", options: MEMBER_ROLES },
      { key: "allocationPercent", label: "Allocation % (0-100)", type: "number" },
      { key: "billableRate", label: "Billable rate per hour", type: "number" },
      { key: "costRate", label: "Cost rate per hour", type: "number" },
      { key: "active", label: "Active", type: "boolean" },
    ],
    ops: {
      create: async (v, u) => {
        const project = await getProject(String(v.projectId));
        if (!project) return fail("Project not found.");
        const c = check(validateMember(v));
        if (!c.ok) return c.error;
        const res = await upsertMember(project._id, c.data, u.id);
        if (!res.ok) return fail(res.reason);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: res.created ? "member_add" : "member_update", entity: "project_member", entityId: `${project._id}:${c.data.employeeId}`, entityLabel: getMemberRoleLabel(c.data.role), projectId: project._id });
        await syncMessenger(project._id);
        return { ok: true, id: `${project._id}:${c.data.employeeId}`, result: res.created ? "Member added." : "Member updated." };
      },
      update: async (id, v, u) => {
        const before = await getMember(id);
        if (!before) return fail("Member not found.");
        const c = check(validateMember(formInput(before as unknown as Json, v)));
        if (!c.ok) return c.error;
        const updated = await updateMember(id, c.data, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "member_update", entity: "project_member", entityId: id, entityLabel: getMemberRoleLabel(c.data.role), projectId: before.projectId });
        await syncMessenger(before.projectId);
        return { ok: true, id, record: updated };
      },
      remove: async (id, u) => {
        const before = await getMember(id);
        if (!before) return fail("Member not found.");
        await removeMember(id, u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "member_remove", entity: "project_member", entityId: id, projectId: before.projectId });
        await syncMessenger(before.projectId);
        return { ok: true, id };
      },
    },
  },
  {
    key: "pms.timesheet", panel: "pms", label: "Timesheet entry", description: "Hours logged on projects and tasks (draft → submitted → approved/rejected). Employees see and log only their own.", collection: "pms_timesheets", idType: "string", baseFilter: soft,
    search: ["description", "date", "status"], read: "staff", write: "staff", canDelete: true, selfWrite: true,
    self: (u) => (u.employeeId ? { employeeId: u.employeeId } : null),
    fields: [
      { key: "employeeId", label: "Employee (hrms.employee id) — leave out to log for yourself", type: "ref", ref: "hrms.employee", createOnly: true },
      { key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true },
      { key: "taskId", label: "Task (pms.task id)", type: "ref", ref: "pms.task" },
      { key: "date", label: "Date", type: "dateString", required: true },
      { key: "startTime", label: "Start time HH:MM", type: "string" },
      { key: "endTime", label: "End time HH:MM", type: "string" },
      { key: "hours", label: "Hours (if no start/end time)", type: "number" },
      { key: "description", label: "What was done", type: "text" },
      { key: "billable", label: "Billable", type: "boolean" },
    ],
    ops: {
      create: async (v, u) => {
        const staffOnBehalf = isStaff(u) && typeof v.employeeId === "string" && v.employeeId;
        const employeeId = staffOnBehalf ? String(v.employeeId) : u.employeeId;
        if (!employeeId) return fail("Your login isn't linked to an employee record, so hours can't be logged for you. Ask HR to link it.");
        const { employeeId: _e, ...rest } = v;
        void _e;
        const c = check(validateTimesheet(rest));
        if (!c.ok) return c.error;
        if (!staffOnBehalf && !(await checkProjectAccess({ id: u.id, roles: u.roles as never, employeeId }, c.data.projectId)).allowed) return fail("You're not assigned to that project.");
        if (c.data.taskId) {
          const task = await getTask(c.data.taskId);
          if (!task || task.projectId !== c.data.projectId) return fail("That task isn't in the selected project.");
        }
        if (await isDuplicate(employeeId, c.data)) return fail("This project/task is already logged at this time on this date.");
        if (await hasOverlap(employeeId, c.data)) return fail("This overlaps another entry on the same day.");
        if ((await dayHoursTotal(employeeId, c.data.date)) + c.data.hours > 24) return fail(`That would put ${c.data.date} over 24 logged hours.`);
        const created = await createEntry(employeeId, c.data, u.id);
        return { ok: true, id: created._id, record: created };
      },
      update: async (id, v, u) => {
        const existing = await getEntry(id);
        if (!existing) return fail("Entry not found.");
        if (existing.employeeId !== u.employeeId && !isStaff(u)) return fail("Entry not found.");
        if (!(EDITABLE_TIMESHEET_STATUSES as string[]).includes(existing.status)) return fail("Submitted or approved entries can't be edited.");
        const { employeeId: _e, ...rest } = v;
        void _e;
        const c = check(validateTimesheet(formInput(existing as unknown as Json, rest)));
        if (!c.ok) return c.error;
        if (await isDuplicate(existing.employeeId, c.data, id)) return fail("This project/task is already logged at this time on this date.");
        if (await hasOverlap(existing.employeeId, c.data, id)) return fail("This overlaps another entry on the same day.");
        if ((await dayHoursTotal(existing.employeeId, c.data.date, id)) + c.data.hours > 24) return fail(`That would put ${c.data.date} over 24 logged hours.`);
        const updated = await updateEntry(id, c.data, u.id);
        return { ok: true, id, record: updated };
      },
      remove: async (id, u) => {
        const existing = await getEntry(id);
        if (!existing || (existing.employeeId !== u.employeeId && !isStaff(u))) return fail("Entry not found.");
        if (!(EDITABLE_TIMESHEET_STATUSES as string[]).includes(existing.status)) return fail("Submitted or approved entries can't be deleted.");
        await deleteEntry(id, u.id);
        return { ok: true, id };
      },
    },
  },
  {
    key: "pms.comment", panel: "pms", label: "Task comment", description: "Comments on tasks.", collection: "pms_task_comments", idType: "string", baseFilter: soft,
    search: ["body"], read: "staff", write: "staff", canDelete: true, selfWrite: true, self: inMyProjects("projectId"),
    fields: [
      { key: "taskId", label: "Task (pms.task id)", type: "ref", ref: "pms.task", required: true, createOnly: true },
      { key: "body", label: "Comment", type: "text", required: true },
    ],
    ops: {
      create: async (v, u) => {
        const task = await getTask(String(v.taskId));
        if (!task) return fail("Task not found.");
        if (!(await checkProjectAccess({ id: u.id, roles: u.roles as never, employeeId: u.employeeId ?? null }, task.projectId)).allowed) return fail("You're not on that project.");
        const text = String(v.body ?? "").trim();
        if (!text || text.length > 4000) return fail("A comment must be 1–4000 characters.");
        const comment = await addComment({ taskId: task._id, projectId: task.projectId, authorId: u.id, authorEmail: u.email, body: text });
        const project = await getProject(task.projectId);
        const targets = [task.assigneeId, project?.projectManagerId ?? null].filter((x): x is string => Boolean(x));
        if (targets.length) await notifyEmployees(targets, (uid) => ({ recipientUserId: uid, type: "comment_added", title: `New comment on ${task.taskCode}`, body: `${u.email}: ${text.slice(0, 120)}`, link: `/sprintos/projects/${task.projectId}/tasks/${task._id}`, projectId: task.projectId }), u.id);
        await recordActivity({ actorId: u.id, actorEmail: u.email, action: "comment", entity: "task_comment", entityId: task._id, entityLabel: task.title, projectId: task.projectId });
        return { ok: true, id: comment._id, record: comment };
      },
      remove: async (id, u) => {
        const r = await deleteComment(id, u.id, isAdmin(u));
        return r.ok ? { ok: true, id } : fail("You can only delete your own comments.");
      },
    },
  },
  { key: "pms.costing", panel: "pms", label: "Project costing inputs", description: "Per-project contract value, other costs and default rates (the figures themselves come from the project_financials report).", collection: "pms_project_costing", idType: "string", read: "staff" },
  { key: "pms.activity", panel: "pms", label: "Activity log", description: "Who changed what in SprintOS, and when.", collection: "pms_activity_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin" },
  { key: "pms.notification", panel: "pms", label: "Notification", description: "SprintOS notifications.", collection: "pms_notifications", idType: "string", read: "admin" },
];

const taskAccess = async (u: AgentUser, projectId: string) => (await checkProjectAccess({ id: u.id, roles: u.roles as never, employeeId: u.employeeId ?? null }, projectId)).allowed;

export const PMS_ACTIONS: ActionDef[] = [
  {
    key: "pms.set_task_status", panel: "pms", label: "Move a task to another status", description: "Change a task's status (todo, in_progress, review, testing, done). Employees can do this on tasks in their own projects.", level: "any",
    params: [{ key: "taskId", label: "Task (pms.task id)", type: "ref", ref: "pms.task", required: true }, { key: "status", label: "New status", type: "enum", options: TASK_STATUS, required: true }],
    run: async (v, u) => {
      const task = await getTask(String(v.taskId));
      if (!task) return fail("Task not found.");
      if (!(await taskAccess(u, task.projectId))) return fail("You're not assigned to this project.");
      const status = String(v.status);
      if (task.status === status) return { ok: true, id: task._id, result: "Already in that status." };
      await updateTask(task._id, { status: status as never }, u.id);
      await recordActivity({ actorId: u.id, actorEmail: u.email, action: "status_change", entity: "task", entityId: task._id, entityLabel: task.title, projectId: task.projectId, summary: `${getTaskStatusMeta(task.status).label} → ${getTaskStatusMeta(status).label}` });
      await recomputeProjectProgress(task.projectId);
      if (isTaskDone(status) && !isTaskDone(task.status)) {
        const project = await getProject(task.projectId);
        if (project?.projectManagerId) await notifyEmployees([project.projectManagerId], (uid) => ({ recipientUserId: uid, type: "task_completed", title: `Task completed: ${task.title}`, body: `${project.name} · ${task.taskCode}`, link: `/sprintos/projects/${task.projectId}/tasks/${task._id}`, projectId: task.projectId }), u.id);
      }
      return { ok: true, id: task._id, result: `Task is now ${getTaskStatusMeta(status).label}.` };
    },
  },
  {
    key: "pms.change_project_status", panel: "pms", label: "Change a project's status", description: "Move a project through its life (planning → in progress → review → testing → completed, on hold, cancelled). Notifies the team.", level: "staff", allow: canManageProjects,
    params: [{ key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true }, { key: "status", label: "New status", type: "enum", options: PROJECT_STATUS, required: true }],
    run: async (v, u) => {
      const before = await getProject(String(v.projectId));
      if (!before) return fail("Project not found.");
      const res = await changeProjectStatus(before._id, v.status as never, u.id);
      if (!res.ok) return fail(res.reason);
      await recordActivity({ actorId: u.id, actorEmail: u.email, action: "status_change", entity: "project", entityId: before._id, entityLabel: res.project.name, projectId: before._id, summary: `status: ${before.status} → ${String(v.status)}` });
      const { listProjectMembers } = await import("@/lib/products/sprintos/project-members");
      const members = await listProjectMembers(before._id);
      const recipients = Array.from(new Set([...members.map((m) => m.employeeId), res.project.projectManagerId].filter((x): x is string => Boolean(x))));
      if (recipients.length) await notifyEmployees(recipients, (uid) => ({ recipientUserId: uid, type: "project_status_changed", title: `${res.project.name} is now ${getProjectStatusMeta(String(v.status)).label}`, body: `Changed by ${u.email}`, link: `/sprintos/projects/${before._id}`, projectId: before._id }), u.id);
      await syncMessenger(before._id);
      return { ok: true, id: before._id, result: `Project is now ${getProjectStatusMeta(String(v.status)).label}.` };
    },
  },
  {
    key: "pms.update_progress", panel: "pms", label: "Set a project's progress %", description: "Set the manual progress percentage of a project.", level: "staff", allow: canManageProjects,
    params: [{ key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true }, { key: "progressPercent", label: "Progress % (0-100)", type: "number", required: true }],
    run: async (v, u) => {
      const before = await getProject(String(v.projectId));
      if (!before) return fail("Project not found.");
      const pct = Math.min(100, Math.max(0, Math.round(Number(v.progressPercent))));
      await updateProject(before._id, { progressPercent: pct }, u.id);
      await recordActivity({ actorId: u.id, actorEmail: u.email, action: "progress_update", entity: "project", entityId: before._id, entityLabel: before.name, projectId: before._id, summary: `progress: ${before.progressPercent}% → ${pct}%` });
      return { ok: true, id: before._id, result: `Progress is now ${pct}%.` };
    },
  },
  {
    key: "pms.submit_timesheet", panel: "pms", label: "Submit timesheet entries for review", description: "Send your draft or rejected entries to your project manager for approval.", level: "any",
    params: [{ key: "entryIds", label: "Entry ids (pms.timesheet)", type: "stringList", required: true }],
    run: async (v, u) => {
      if (!u.employeeId) return fail("Your login isn't linked to an employee record.");
      const ids = (v.entryIds as string[]).filter(Boolean);
      const n = await submitEntries(ids, u.employeeId);
      if (!n) return fail("Nothing to submit: only your own draft or rejected entries can be submitted.");
      const submitted = await listEntries({ employeeId: u.employeeId, status: "submitted" });
      const pmIds = new Set<string>();
      for (const pid of Array.from(new Set(submitted.filter((e) => ids.includes(e._id)).map((e) => e.projectId)))) {
        const project = await getProject(pid);
        if (project?.projectManagerId) pmIds.add(project.projectManagerId);
      }
      if (pmIds.size) await notifyEmployees(Array.from(pmIds), (uid) => ({ recipientUserId: uid, type: "timesheet_submitted", title: `${u.email} submitted ${n} timesheet ${n === 1 ? "entry" : "entries"}`, body: "Awaiting your review", link: "/sprintos/timesheets" }), u.id);
      return { ok: true, result: `${n} ${n === 1 ? "entry" : "entries"} submitted.` };
    },
  },
  {
    key: "pms.review_timesheet", panel: "pms", label: "Approve or reject timesheet entries", description: "Review submitted timesheet entries (one or many) and tell the employee.", level: "staff", allow: canReviewTimesheets,
    params: [
      { key: "entryIds", label: "Entry ids (pms.timesheet, status submitted)", type: "stringList", required: true },
      { key: "decision", label: "Decision", type: "enum", options: ["approved", "rejected"], required: true },
      { key: "note", label: "Note to the employee", type: "string" },
    ],
    run: async (v, u) => {
      let done = 0;
      const problems: string[] = [];
      for (const id of (v.entryIds as string[]).slice(0, 100)) {
        const before = await getEntry(id);
        if (!before) { problems.push(`${id}: not found`); continue; }
        const updated = await reviewEntry(id, v.decision as "approved", str(v.note), u.id);
        if (!updated) { problems.push(`${id}: no longer awaiting review`); continue; }
        done += 1;
        await notifyEmployees([updated.employeeId], (uid) => ({ recipientUserId: uid, type: "timesheet_reviewed", title: `Timesheet ${String(v.decision)}: ${updated.hours}h on ${updated.date}`, body: str(v.note), link: "/sprintos/me/timesheet", projectId: updated.projectId }), u.id);
      }
      return done ? { ok: true, result: `${done} entr${done === 1 ? "y" : "ies"} ${String(v.decision)}.`, ...(problems.length ? { skipped: problems } : {}) } : fail("Nothing was reviewed.", { problems });
    },
  },
  {
    key: "pms.update_costing", panel: "pms", label: "Set a project's costing inputs", description: "Contract value, other costs and default cost/billing rates used to compute project profit.", level: "staff", allow: canViewCosting,
    params: [
      { key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true },
      { key: "contractValue", label: "Contract value", type: "number" },
      { key: "otherCosts", label: "Other fixed costs", type: "number" },
      { key: "defaultCostRate", label: "Default cost rate / hour", type: "number" },
      { key: "defaultBillRate", label: "Default billing rate / hour", type: "number" },
    ],
    run: async (v, u) => {
      const project = await getProject(String(v.projectId));
      if (!project) return fail("Project not found.");
      const c = check(validateCostingConfig(v));
      if (!c.ok) return c.error;
      await updateCostingConfig(project._id, c.data, u.id);
      await recordActivity({ actorId: u.id, actorEmail: u.email, action: "update", entity: "project", entityId: project._id, entityLabel: `Costing · ${project.name}`, projectId: project._id, summary: "Updated costing inputs" });
      return { ok: true, id: project._id, result: "Costing inputs saved." };
    },
  },
  {
    key: "pms.update_settings", panel: "pms", label: "Change SprintOS settings", description: "Project categories, technology suggestions and the default currency.", level: "admin", allow: canManageSettings,
    params: [
      { key: "categories", label: "Project categories", type: "stringList" },
      { key: "technologySuggestions", label: "Technology suggestions", type: "stringList" },
      { key: "defaultCurrency", label: "Default currency (e.g. INR)", type: "string" },
    ],
    run: async (v, u) => {
      const current = await getPmsSettings();
      const data = normalizeSettingsInput({ categories: current.categories, technologySuggestions: current.technologySuggestions, defaultCurrency: current.defaultCurrency, ...v });
      await updatePmsSettings(data, u.id);
      await recordActivity({ actorId: u.id, actorEmail: u.email, action: "update", entity: "settings", entityId: "config", entityLabel: "PMS settings", summary: `${data.categories.length} categories · default ${data.defaultCurrency}` });
      return { ok: true, result: "PMS settings saved." };
    },
  },
];

export const PMS_REPORTS: ReportDef[] = [
  {
    key: "pms.dashboard", panel: "pms", label: "Portfolio dashboard numbers", description: "Totals of projects (active, completed, on hold, overdue), clients, team utilisation, status/priority split, deadlines.", level: "staff", allow: (u) => hasLevel(u.roles, "pms", "staff"),
    params: [{ key: "dateFrom", label: "From (YYYY-MM-DD)", type: "dateString" }, { key: "dateTo", label: "To (YYYY-MM-DD)", type: "dateString" }],
    run: async (v) => ({ ...(await getPmsDashboardStats({ dateFrom: v.dateFrom ? new Date(String(v.dateFrom)) : undefined, dateTo: v.dateTo ? new Date(`${String(v.dateTo)}T23:59:59`) : undefined })) }),
  },
  {
    key: "pms.project_report", panel: "pms", label: "Full report of one project", description: "Client, team, financials, hours, task progress and each person's contribution.", level: "staff", allow: canViewCosting,
    params: [{ key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true }, { key: "dateFrom", label: "From", type: "dateString" }, { key: "dateTo", label: "To", type: "dateString" }],
    run: async (v) => ((await buildProjectReport(String(v.projectId), { dateFrom: str(v.dateFrom) ?? undefined, dateTo: str(v.dateTo) ?? undefined })) as unknown as Json) ?? fail("Project not found."),
  },
  {
    key: "pms.project_financials", panel: "pms", label: "Project profit / cost", description: "Revenue, resource cost, other costs, profit and margin of one project, from logged hours and rates.", level: "staff", allow: canViewCosting,
    params: [{ key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project", required: true }, { key: "dateFrom", label: "From", type: "dateString" }, { key: "dateTo", label: "To", type: "dateString" }],
    run: async (v) => ((await computeProjectFinancials(String(v.projectId), { dateFrom: str(v.dateFrom) ?? undefined, dateTo: str(v.dateTo) ?? undefined })) as unknown as Json) ?? fail("Project not found."),
  },
  {
    key: "pms.portfolio_costing", panel: "pms", label: "Profit / loss across all projects", description: "Total revenue, cost, profit and loss over every project.", level: "staff", allow: canViewCosting,
    params: [{ key: "dateFrom", label: "From", type: "dateString" }, { key: "dateTo", label: "To", type: "dateString" }],
    run: async (v) => (await getPortfolioCosting({ dateFrom: str(v.dateFrom) ?? undefined, dateTo: str(v.dateTo) ?? undefined })) as unknown as Json,
  },
];
