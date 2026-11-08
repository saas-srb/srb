/** Types and validation shared by the custom-role builder (server and client). */

export const MAX_CUSTOM_ROLES = 2000;
export const MAX_ROLES_PER_USER = 10;

export interface CustomRoleInput {
  name: string;
  description: string;
  /** Built-in product roles this role includes (never `super_admin`). */
  baseRoles: string[];
  /** Permission-catalog key → true (always allow) / false (always deny); absent = the role's default. */
  permissions: Record<string, boolean>;
}

export interface CustomRoleView {
  id: string;
  name: string;
  description: string;
  baseRoles: string[];
  permissions: Record<string, boolean>;
  userCount: number;
  updatedAt: string;
  /** Set on the designations the platform created for every company (they can be edited but not deleted). */
  builtinKey: string | null;
  /** Which part of the business the designation belongs to. */
  department: string;
}

export function validateCustomRoleInput(
  input: CustomRoleInput,
  known: { knownRoles: readonly string[]; knownPermissions: readonly string[] },
): { ok: true; value: CustomRoleInput } | { ok: false; error: string } {
  const name = typeof input?.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 40) return { ok: false, error: "Give the role a name of 2–40 characters." };
  if (/[<>]/.test(name)) return { ok: false, error: "The name can't contain < or >." };
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 300) : "";
  const baseRoles = Array.isArray(input.baseRoles) ? [...new Set(input.baseRoles.map(String))] : [];
  if (baseRoles.length === 0) return { ok: false, error: "Pick at least one product role — it decides which products this role can open." };
  if (baseRoles.length > 40) return { ok: false, error: "Too many roles selected." };
  const unknown = baseRoles.find((r) => r === "super_admin" || !known.knownRoles.includes(r));
  if (unknown) return { ok: false, error: unknown === "super_admin" ? "A custom role can never include Director." : `Unknown role: ${unknown}.` };
  const permissions: Record<string, boolean> = {};
  const raw = input.permissions && typeof input.permissions === "object" ? input.permissions : {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "boolean") continue;
    if (!known.knownPermissions.includes(k)) return { ok: false, error: `Unknown permission: ${k}.` };
    permissions[k] = v;
  }
  return { ok: true, value: { name, description, baseRoles, permissions } };
}

/** Which product (Product Registry key) each permission-catalog group belongs to — the builder uses it to mark permissions that matter for the products a role opens. */
export const PERMISSION_MODULE_PANEL: Record<string, string> = {
  "Huddle": "messenger", "Cohort AI": "tms", TalentOS: "hrms", "SprintOS": "pms", "SpendIQ": "prms", "CashFlow": "fms",
  "DealFlow": "lms", "ClientOS": "portal", "Playbook": "sop", "RankMax": "seo", "CyberVault": "dlms", "AgentOS": "aibots",
  "DataBrain": "intelligence", "ViralPulse": "smms", "EvalIQ": "ots", "SiteCraft": "cms", "CommandOS": "workspace",
  "CommandOS management": "workspace", "ContractFlow": "lpms",
};
