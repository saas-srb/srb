import type { MicroFeature } from "./types";

const P = "spendiq";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all" | "team"];

/** What everybody given SpendIQ gets: their own dashboard. */
const BASELINE = new Set(["dashboard.view"]);

const ANY = ["prms.hasPrmsAccess"];
const STAFF = ["prms.hasPrmsStaffRole"];
const PROC = ["prms.canManageProcurement"];
const FIN = ["prms.canManageFinance"];

const rows: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the SpendIQ dashboard with the person's own requisitions and expense claims.", "read", ANY],
  ["dashboard.all", "Dashboard", "section", "See the spend dashboard", "Spend, requisition and approval numbers across the company.", "read", STAFF, "all"],
  ["requisitions.view", "Requisitions", "page", "Open my requisitions", "Open and track the purchase requisitions the person raised.", "read", ANY],
  ["requisitions.all", "Requisitions", "page", "Open every requisition", "Open any requisition and its attachments, not only the person's own.", "read", STAFF, "all"],
  ["requisitions.submit", "Requisitions", "action", "Raise and edit my requisitions", "Raise, edit, submit and cancel the person's own purchase requisitions.", "write", ANY],
  ["requisitions.manage", "Requisitions", "button", "Change other people's requisitions", "Edit, submit, cancel and delete requisitions raised by other people.", "write", PROC],
  ["requisitions.approve", "Requisitions", "button", "Approve requisitions", "Approve or reject requisitions at the person's approval level.", "write", ["prms.canApproveRequisitions"]],
  ["expenses.view", "Expenses", "page", "Open my expense claims", "Open and track the expense claims the person raised.", "read", ANY],
  ["expenses.all", "Expenses", "page", "Open every expense claim", "Open any expense claim, not only the person's own.", "read", STAFF, "all"],
  ["expenses.submit", "Expenses", "action", "Raise and edit my expense claims", "Raise, edit, submit and cancel the person's own expense claims.", "write", ANY],
  ["expenses.manage", "Expenses", "button", "Create and approve expenses", "Create operational expenses and approve or reject claims.", "write", ["prms.canManageExpenses"]],
  ["procurement.view", "Procurement", "page", "Open the procurement hub", "Open the hub that lists requisitions, purchase orders and vendors.", "read", STAFF],
];
const area = (mod: string, names: [string, string][], legacy: string[], extra = "") => {
  for (const [short, label] of names) {
    rows.push([`${short}.view`, mod, "page", `Open ${label}`, `Open ${label}${extra}.`, "read", STAFF]);
    rows.push([`${short}.manage`, mod, "button", `Manage ${label}`, `Create, edit and delete ${label}.`, "write", legacy]);
  }
};
area("Vendors", [["vendors", "vendors"]], PROC);
area("Purchasing", [["rfq", "quotation requests (RFQ)"], ["purchaseorders", "purchase orders"], ["grn", "goods received notes"]], PROC);
area("Assets and contracts", [["assets", "assets"], ["inventory", "inventory"], ["subscriptions", "subscriptions"], ["contracts", "contracts"], ["infrastructure", "infrastructure"], ["thirdparty", "third-party services"]], PROC);
area("Finance", [["invoices", "vendor invoices"], ["payments", "payments"], ["budgets", "budgets"]], FIN);
rows.push(
  ["analytics.view", "Reports", "page", "Open analytics", "Open spend analytics.", "read", ["prms.canViewReports"]],
  ["reports.view", "Reports", "page", "Open reports", "Open the report pages.", "read", ["prms.canViewReports"]],
  ["reports.export", "Reports", "export", "Download reports and exports", "Download reports and data exports.", "read", ["prms.canViewReports"]],
  ["settings.view", "Settings", "page", "Open settings", "Open the SpendIQ settings.", "read", STAFF],
  ["settings.manage", "Settings", "button", "Manage settings", "Edit company identity, approval thresholds and category suggestions.", "write", ["prms.canManageSettings"]],
  ["audit.view", "Settings", "page", "Read the activity log", "Read the SpendIQ audit log.", "read", ["prms.canViewAuditLog"]],
);

export const SPENDIQ_MICRO: MicroFeature[] = rows.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
