import type { MicroFeature } from "./types";

const P = "talentos";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all" | "team"];

/** What everybody given TalentOS gets: their own dashboard, profile, the colleague directory and the holiday list. */
const BASELINE = new Set(["dashboard.view", "profile.view", "directory.view", "holidays.view"]);

/** Every person with a TalentOS role (the old employee level) holds these; the staff tier is the old manager/HR/Director level. */
const ANY = ["hrms.hasAnyHrmsRole"];
const STAFF = ["hrms.hasStaffRole"];
const ALL = ["hrms.canViewAllEmployees"];

/**
 * TalentOS in micro features, with the three scopes the old model had: the person's OWN records (the baseline every person has), the reporting line
 * (a manager's team: scope "team") and everyone ("all"). One page serves everyone; what it shows follows the scope. The "Me" pages are gone.
 */
const ROWS: Row[] = [
  // Dashboard and analytics
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the TalentOS dashboard with the person's own summary: today, leave balance, requests.", "read", ANY],
  ["dashboard.team", "Dashboard", "section", "See the team's dashboard numbers", "Dashboard numbers for the person's reporting line.", "read", STAFF, "team"],
  ["dashboard.all", "Dashboard", "section", "See company-wide dashboard numbers", "Headcount, joiners, exits and attendance for everyone.", "read", ALL, "all"],
  ["analytics.view", "Dashboard", "page", "Open HR analytics", "Open attendance and leave analytics for the people the person's scope covers.", "read", STAFF],
  // People
  ["directory.view", "Employees", "page", "Open the colleague directory", "Find colleagues, their titles and contact details.", "read", ANY],
  ["profile.view", "Employees", "page", "Open my profile", "Open the person's own employee profile.", "read", ANY],
  ["profile.edit", "Employees", "action", "Edit my own contact details", "Change the person's own contact and emergency details.", "write", ANY],
  ["employees.team", "Employees", "page", "Open employees in my reporting line", "The employee list and profiles of the people who report to the person.", "read", STAFF, "team"],
  ["employees.all", "Employees", "page", "Open every employee", "The full employee list and every profile.", "read", ALL, "all"],
  ["employees.manage", "Employees", "button", "Create and edit employees", "Create, edit and delete employees, change employment status, convert hires.", "write", ["hrms.canManageEmployees"]],
  ["employees.export", "Employees", "export", "Download the employee list", "Download the whole employee roster (personal details and contacts).", "read", ALL],
  ["masters.view", "Employees", "page", "Open departments and designations", "Open the departments, designations and teams.", "read", STAFF],
  ["masters.manage", "Employees", "button", "Manage departments and designations", "Create, edit and delete departments, designations and teams.", "write", ["hrms.canManageMasters"]],
  // Documents
  ["documents.view", "Documents", "page", "Open my documents", "Open the person's own documents.", "read", ANY],
  ["documents.upload", "Documents", "action", "Upload my own documents", "Upload documents to the person's own record.", "write", ANY],
  ["documents.manage", "Documents", "button", "Manage anyone's documents", "Upload, replace and delete documents on any employee the person can open.", "write", ["hrms.canManageEmployeeDocuments"]],
  // Attendance
  ["attendance.view", "Attendance", "page", "Open attendance", "Open attendance: the person's own days.", "read", ANY],
  ["attendance.punch", "Attendance", "action", "Check in and out", "Record the person's own check-in and check-out.", "write", ANY],
  ["attendance.team", "Attendance", "page", "See my team's attendance", "Attendance of the people in the person's reporting line.", "read", STAFF, "team"],
  ["attendance.all", "Attendance", "page", "See everyone's attendance", "Attendance of every employee.", "read", ALL, "all"],
  ["attendance.manage", "Attendance", "button", "Record and correct attendance", "Mark, correct and regularise attendance for the people the person's scope covers.", "write", ["hrms.canManageAttendance"]],
  // Leave
  ["leave.view", "Leave", "page", "Open leave", "Open the person's own leave balance and history.", "read", ANY],
  ["leave.apply", "Leave", "action", "Apply for leave", "Apply for and cancel the person's own leave.", "write", ANY],
  ["leave.team", "Leave", "page", "See my team's leave", "Leave requests and balances of the person's reporting line.", "read", STAFF, "team"],
  ["leave.all", "Leave", "page", "See everyone's leave", "Leave requests and balances of every employee.", "read", ALL, "all"],
  ["leave.approve", "Leave", "button", "Approve and file leave", "Approve, reject and file leave for the people the person's scope covers.", "write", ["hrms.canApproveLeave"]],
  // Requests (work requests)
  ["requests.view", "Requests", "page", "Open requests", "Open the person's own requests (regularisation, work from home and similar).", "read", ANY],
  ["requests.submit", "Requests", "action", "Submit requests", "Raise and withdraw the person's own requests.", "write", ANY],
  ["requests.team", "Requests", "page", "See my team's requests", "Requests of the person's reporting line.", "read", STAFF, "team"],
  ["requests.all", "Requests", "page", "See everyone's requests", "Requests of every employee.", "read", ALL, "all"],
  ["requests.decide", "Requests", "button", "Decide requests", "Approve or reject requests for the people the person's scope covers.", "write", ["hrms.canApproveLeave"]],
  // Holidays
  ["holidays.view", "Holidays", "page", "Open holidays", "Open the holiday calendar.", "read", ANY],
  ["holidays.manage", "Holidays", "button", "Manage holidays", "Create, edit and delete holidays.", "write", ["hrms.canManageHolidays"]],
  // Pay
  ["salary.view", "Payroll", "page", "Open my payslips", "Open and download the person's own payslips and salary details.", "read", ANY],
  ["tax.view", "Payroll", "page", "Open my tax declaration", "Open the person's own tax declaration and projected tax.", "read", ANY],
  ["tax.declare", "Payroll", "action", "Submit my tax declaration", "Submit and change the person's own tax declaration.", "write", ANY],
  ["payroll.view", "Payroll", "page", "Open payroll runs", "Open payroll runs, items, payouts, government payments and tax declarations of everyone.", "read", ["hrms.canRunPayroll"]],
  ["payroll.run", "Payroll", "button", "Run payroll", "Run, approve and pay payroll, record statutory payments, export payroll files.", "write", ["hrms.canRunPayroll"]],
  ["salary.manage", "Payroll", "button", "Manage salary structure and bank details", "View and edit an employee's salary structure, revisions and bank details.", "write", ["hrms.canManagePayroll"]],
  ["payrollrates.manage", "Payroll", "button", "Manage statutory rates and tax configuration", "Edit statutory payroll rates and the tax configuration.", "write", ["hrms.canManagePayrollConfig"]],
  // Recruitment
  ["recruitment.view", "Recruitment", "page", "Open recruitment", "Open job openings, candidates and offers.", "read", STAFF],
  ["recruitment.manage", "Recruitment", "button", "Manage recruitment", "Create openings, move candidates, send offers and convert a hire to an employee.", "write", ["hrms.canManageEmployees"]],
  // Settings
  ["settings.view", "Settings", "page", "Open settings", "Open the work schedule, leave types and other TalentOS settings.", "read", STAFF],
  ["settings.manage", "Settings", "button", "Manage settings", "Edit the work schedule and the leave-type configuration.", "write", ["hrms.canManageSettings"]],
  ["audit.view", "Settings", "page", "Read the activity log", "Read the TalentOS audit trail.", "read", ["hrms.canViewAuditLog"]],
];

export const TALENTOS_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
