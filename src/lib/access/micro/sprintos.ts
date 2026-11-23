import type { MicroFeature } from "./types";

const P = "sprintos";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all" | "team"];

/** What everybody given SprintOS gets: their own dashboard. */
const BASELINE = new Set(["dashboard.view"]);

/** Everyone with a SprintOS role (the old employee level); the staff tier is the old manager/admin level. */
const ANY = ["pms.hasPmsAccess"];
const STAFF = ["pms.hasPmsStaffRole"];

/**
 * SprintOS in micro features. Whose work: a person's OWN (projects they manage or belong to, their tasks and timesheets), their TEAM ("team": the staff tier's
 * dashboards and calendar over their own projects) or EVERYONE'S ("all": `canViewAllProjects`). One page serves everyone; the "Me" pages are gone.
 */
const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the SprintOS dashboard with the person's own projects, tasks and timesheet.", "read", ANY],
  ["dashboard.team", "Dashboard", "section", "See the project dashboard numbers", "Dashboard numbers for the projects the person manages or belongs to.", "read", STAFF, "team"],
  ["dashboard.all", "Dashboard", "section", "See every project's dashboard numbers", "Dashboard numbers across every project.", "read", ["pms.canViewAllProjects"], "all"],
  ["projects.view", "Projects", "page", "Open my projects", "Open the projects the person manages or belongs to, their tasks, board and timeline.", "read", ANY],
  ["projects.all", "Projects", "page", "Open every project", "Open any project, not only the ones the person manages or belongs to.", "read", ["pms.canViewAllProjects"], "all"],
  ["projects.manage", "Projects", "button", "Create and manage projects", "Create, edit and delete projects, tasks and milestones, and manage a project's team.", "write", ["pms.canManageProjects"]],
  ["tasks.update", "Projects", "action", "Update my tasks", "Change the status and progress of tasks assigned to the person.", "write", ANY],
  ["documents.view", "Documents", "page", "Open project documents", "Open and download the documents and attachments of a project the person may open.", "read", ANY],
  ["documents.manage", "Documents", "button", "Manage project documents", "Upload and delete project documents.", "write", ["pms.canManageProjects"]],
  ["clients.view", "Clients", "page", "Open clients", "Open the client list and a client's projects.", "read", STAFF],
  ["clients.manage", "Clients", "button", "Manage clients", "Create, edit and archive clients.", "write", ["pms.canManageClients"]],
  ["clients.export", "Clients", "export", "Download clients and projects", "Download the client and project lists.", "read", STAFF],
  ["timesheets.view", "Timesheets", "page", "Open my timesheet", "Open the person's own timesheet.", "read", ANY],
  ["timesheets.submit", "Timesheets", "action", "Log and submit my time", "Log time against tasks and submit the person's own timesheet.", "write", ANY],
  ["timesheets.review", "Timesheets", "button", "Review timesheets", "Open submitted timesheets, approve and reject them.", "write", ["pms.canReviewTimesheets"]],
  ["costing.view", "Costing", "page", "Open project costing", "Open project costing, margins and financial dashboards.", "read", ["pms.canViewCosting"]],
  ["costing.manage", "Costing", "button", "Manage project costing", "Edit costing figures and rates.", "write", ["pms.canViewCosting"]],
  ["reports.export", "Costing", "export", "Download project reports", "Download a project's report.", "read", ["pms.canViewCosting"]],
  ["calendar.view", "Calendar", "page", "Open the project calendar", "Open the calendar of the projects the person's scope covers.", "read", STAFF],
  ["analytics.view", "Analytics", "page", "Open analytics", "Open project analytics for the projects the person's scope covers.", "read", STAFF],
  ["settings.view", "Settings", "page", "Open settings", "Open the SprintOS settings.", "read", STAFF],
  ["settings.manage", "Settings", "button", "Manage settings", "Edit categories, default currency and technology suggestions.", "write", ["pms.canManageSettings"]],
  ["activity.view", "Settings", "page", "Read the activity log", "Read the SprintOS activity log.", "read", ["pms.canViewActivityLog"]],
];

export const SPRINTOS_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
