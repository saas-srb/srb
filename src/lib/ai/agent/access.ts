import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyIdOrNull, isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import type { AgentUser, Level } from "@/lib/ai/agent/types";

/**
 * Who may use the agent in which product. Products keep their own role vocabularies; this maps them onto three levels:
 * `any` (can open the product), `staff` (runs the product's records) and `admin` (configures it). `super_admin` is everything.
 */
interface PanelRoles { any: string[]; staff: string[]; admin: string[] }

const r = (any: string[], staff: string[], admin: string[]): PanelRoles => ({ any, staff, admin });

export const PANEL_ROLES: Record<string, PanelRoles> = {
  pms: r(["pms_admin", "pms_manager", "pms_employee"], ["pms_admin", "pms_manager"], ["pms_admin"]),
  hrms: r(["hr", "manager", "employee"], ["hr", "manager"], ["hr"]),
  fms: r(["fms_admin", "finance_manager", "accountant", "finance_executive", "payroll_accountant", "accounts_receivable", "accounts_payable", "auditor", "finance_read_only"], ["fms_admin", "finance_manager", "accountant", "finance_executive", "payroll_accountant", "accounts_receivable", "accounts_payable", "auditor", "finance_read_only"], ["fms_admin", "finance_manager", "accountant", "accounts_receivable", "accounts_payable"]),
  lms: r(["lms_admin", "lms_manager", "lms_agent"], ["lms_admin", "lms_manager", "lms_agent"], ["lms_admin", "lms_manager"]),
  tms: r(["tms_admin", "tms_manager", "mentor", "training_student"], ["tms_admin", "tms_manager", "mentor"], ["tms_admin"]),
  prms: r(["prms_admin", "procurement_manager", "finance", "dept_manager", "prms_employee"], ["prms_admin", "procurement_manager", "finance", "dept_manager"], ["prms_admin", "procurement_manager"]),
  smms: r(["smms_admin", "smms_manager", "smms_specialist", "smms_employee"], ["smms_admin", "smms_manager", "smms_specialist"], ["smms_admin", "smms_manager"]),
  sop: r(["sop_admin", "sop_manager", "sop_author", "sop_employee"], ["sop_admin", "sop_manager", "sop_author"], ["sop_admin", "sop_manager"]),
  dlms: r(["dlms_admin", "dlms_manager", "dlms_employee"], ["dlms_admin", "dlms_manager"], ["dlms_admin"]),
  seo: r(["seo_admin", "seo_manager", "seo_specialist", "seo_employee"], ["seo_admin", "seo_manager", "seo_specialist"], ["seo_admin", "seo_manager"]),
  ots: r(["ots_admin", "ots_manager", "ots_author", "ots_evaluator", "ots_candidate"], ["ots_admin", "ots_manager", "ots_author", "ots_evaluator"], ["ots_admin", "ots_manager"]),
  lpms: r(["lpms_admin", "lpms_manager", "lpms_author", "lpms_viewer"], ["lpms_admin", "lpms_manager", "lpms_author"], ["lpms_admin", "lpms_manager"]),
  aibots: r(["aibots_admin", "aibots_manager", "aibots_user"], ["aibots_admin", "aibots_manager"], ["aibots_admin"]),
  messenger: r(["chat_admin", "chat_pm", "chat_hr", "chat_employee"], ["chat_admin", "chat_pm", "chat_hr"], ["chat_admin"]),
  intelligence: r(["intelligence_admin", "intelligence_user"], ["intelligence_admin", "intelligence_user"], ["intelligence_admin"]),
  cms: r(["cms_admin", "cms_editor", "cms_viewer"], ["cms_admin", "cms_editor"], ["cms_admin"]),
  support: r([], [], []),
  portal: r([], [], []),
  workspace: r(["workspace_admin", "workspace_member"], ["workspace_admin"], ["workspace_admin"]),
};

/** Products the workspace-wide assistant spans (everything with records). */
export const DATA_PANELS = ["pms", "hrms", "fms", "lms", "tms", "prms", "smms", "sop", "dlms", "seo", "ots", "lpms", "aibots", "messenger", "intelligence"];

export function hasLevel(roles: readonly string[], panel: string, level: Level): boolean {
  if (roles.includes("super_admin")) return true;
  // The Platform Console has its own permission model; the route gates entry and every tool checks its platform permission.
  if (panel === "platform" || panel === "support" || panel === "portal") return true;
  const def = PANEL_ROLES[panel];
  if (!def) return false;
  return def[level].some((x) => roles.includes(x));
}

/** The signed-in workspace account, or null. Platform-owner hosts are served by their own (read-only) mode. */
export async function currentAgentUser(): Promise<AgentUser | null> {
  const u = await getCurrentHubUser();
  if (!u) return null;
  let employeeId: string | null = null;
  let studentId: string | null = null;
  try {
    const doc = await (await getDb()).collection<{ employeeId?: string | null; studentId?: string | null }>("admin_users").findOne({ _id: new ObjectId(u.id) }, { projection: { employeeId: 1, studentId: 1 } });
    employeeId = doc?.employeeId ? String(doc.employeeId) : null;
    studentId = doc?.studentId ? String(doc.studentId) : null;
  } catch {
    employeeId = null;
  }
  return { id: u.id, email: u.email, roles: u.roles ?? [], employeeId, studentId, permissionOverrides: u.permissionOverrides };
}

export async function onPlatformOwnerHost(): Promise<boolean> {
  return isPlatformOwnerContext();
}

/** Row filter for people who can open a product but aren't staff: only rows tied to their own employee record. */
export function ownRows(field: string) {
  return (user: AgentUser): Record<string, unknown> | null => (user.employeeId ? { [field]: user.employeeId } : null);
}

/**
 * Products disabled in the Product Registry are blocked. A suspended or
 * canceled subscription remains read-only, while products are available across plans.
 */
export async function agentPlanState(): Promise<{ blockedPanels: string[]; readOnly: boolean }> {
  const companyId = await currentCompanyIdOrNull();
  if (!companyId) return { blockedPanels: [], readOnly: false };
  const [e, unavailable] = await Promise.all([getEntitlements(), unavailablePanelKeys(companyId)]);
  const blocked = [...DATA_PANELS, "cms"].filter((p) => unavailable.has(p));
  return { blockedPanels: blocked, readOnly: e.readOnly };
}
