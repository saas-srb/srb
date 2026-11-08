import { canSignIn, type AccountStatus } from "@/lib/security/account-status";
import { normalizeAdminRoles } from "@/lib/admin-roles";
import { normalizeRoles } from "@/lib/hrms-roles";
import { normalizePmsRoles } from "@/lib/pms-roles";
import { normalizePrmsRoles } from "@/lib/prms-roles";
import { normalizeFmsRoles } from "@/lib/fms-roles";
import { effectiveSopRoles, hasSopAccess } from "@/lib/sop-roles";
import { normalizeSeoRoles } from "@/lib/seo-roles";
import { normalizeDlmsRoles } from "@/lib/dlms-roles";
import { normalizeAibotsRoles } from "@/lib/aibots-roles";
import { normalizeIntelligenceRoles } from "@/lib/intelligence-roles";
import { normalizeSmmsRoles } from "@/lib/smms-roles";
import { effectiveOtsRoles, hasOtsAccess } from "@/lib/ots-roles";
import { normalizeTmsRoles } from "@/lib/tms-roles";
import { normalizeChatRoles } from "@/lib/messenger-roles";
import { normalizeLmsRoles } from "@/lib/lms-roles";
import { normalizeLpmsRoles } from "@/lib/lpms-roles";
import { normalizeWorkspaceRoles } from "@/lib/workspace-roles";

export interface AdminUserRow {
  _id: string;
  email: string;
  roles: string[];
  permissionOverrides: Record<string, boolean>;
  /** What the Director set by hand; `roles` / `permissionOverrides` also include everything custom roles add. */
  manualRoles: string[];
  manualOverrides: Record<string, boolean>;
  customRoleIds: string[];
  employeeId: string | null;
  mustChangePassword: boolean;
  locked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  status: AccountStatus;
  /** Why the status is what it is (suspension / termination reasons) and the last working day, when set. */
  statusReason: string;
  statusChangedAt: string | null;
  lastWorkingDay: string | null;
  name: string;
  /** The designation the person holds ("Director", "HR Manager" …). */
  designation: string;
  designationId: string | null;
  savedRoles: string[];
  userType: "employee" | "contractor" | "partner" | "system";
  notes: string;
}

export interface PanelAccessSummaryItem {
  key: string;
  name: string;
  hasAccess: boolean;
  roles: string[];
  isSuperAdmin: boolean;
}

export function getPanelAccessSummary(user: AdminUserRow): PanelAccessSummaryItem[] {
  const roles = user.roles;
  const isSuperAdmin = roles.includes("super_admin");

  return [
    {
      key: "admin",
      name: "Director Product",
      hasAccess: isSuperAdmin || normalizeAdminRoles(roles).length > 0,
      roles: normalizeAdminRoles(roles),
      isSuperAdmin,
    },
    {
      key: "hrms",
      name: "TalentOS",
      hasAccess: isSuperAdmin || normalizeRoles(roles).length > 0,
      roles: normalizeRoles(roles),
      isSuperAdmin,
    },
    {
      key: "pms",
      name: "SprintOS",
      hasAccess: isSuperAdmin || normalizePmsRoles(roles).length > 0,
      roles: normalizePmsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "prms",
      name: "SpendIQ",
      hasAccess: isSuperAdmin || normalizePrmsRoles(roles).length > 0,
      roles: normalizePrmsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "tms",
      name: "Cohort AI",
      hasAccess: isSuperAdmin || normalizeTmsRoles(roles).length > 0,
      roles: normalizeTmsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "fms",
      name: "CashFlow",
      hasAccess: isSuperAdmin || normalizeFmsRoles(roles).length > 0,
      roles: normalizeFmsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "sop",
      name: "Playbook",
      hasAccess: isSuperAdmin || hasSopAccess(roles),
      // Explicit sop_* roles plus what the account's HRMS role implies (employee → reader, manager/hr → manager).
      roles: effectiveSopRoles(roles),
      isSuperAdmin,
    },
    {
      key: "seo",
      name: "RankMax",
      hasAccess: isSuperAdmin || normalizeSeoRoles(roles).length > 0,
      roles: normalizeSeoRoles(roles),
      isSuperAdmin,
    },
    {
      key: "dlms",
      name: "CyberVault",
      hasAccess: isSuperAdmin || normalizeDlmsRoles(roles).length > 0,
      roles: normalizeDlmsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "aibots",
      name: "AgentOS",
      hasAccess: isSuperAdmin || normalizeAibotsRoles(roles).length > 0,
      roles: normalizeAibotsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "intelligence",
      name: "DataBrain",
      hasAccess: isSuperAdmin || normalizeIntelligenceRoles(roles).length > 0,
      roles: normalizeIntelligenceRoles(roles),
      isSuperAdmin,
    },
    {
      key: "smms",
      name: "ViralPulse",
      hasAccess: isSuperAdmin || normalizeSmmsRoles(roles).length > 0,
      roles: normalizeSmmsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "ots",
      name: "EvalIQ",
      hasAccess: isSuperAdmin || hasOtsAccess(roles),
      // Explicit ots_* roles plus what HRMS / TMS roles imply (employee → test taker, hr / TMS admin → manager, mentor → evaluator).
      roles: effectiveOtsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "messenger",
      name: "Huddle",
      hasAccess: isSuperAdmin || normalizeChatRoles(roles).length > 0,
      roles: normalizeChatRoles(roles),
      isSuperAdmin,
    },
    {
      key: "lms",
      name: "DealFlow",
      hasAccess: isSuperAdmin || normalizeLmsRoles(roles).length > 0 || canSignIn({ status: user.status, roles: user.roles }),
      roles: normalizeLmsRoles(roles).length > 0
        ? normalizeLmsRoles(roles)
        : (canSignIn({ status: user.status, roles: user.roles }) ? ["lms_user"] : []),
      isSuperAdmin,
    },
    {
      key: "lpms",
      name: "ContractFlow",
      hasAccess: isSuperAdmin || normalizeLpmsRoles(roles).length > 0,
      roles: normalizeLpmsRoles(roles),
      isSuperAdmin,
    },
    {
      key: "portal",
      name: "ClientOS",
      hasAccess: isSuperAdmin || roles.some((r) => r.startsWith("portal_")),
      roles: roles.filter((r) => r.startsWith("portal_")),
      isSuperAdmin,
    },
    {
      key: "workspace",
      name: "CommandOS",
      hasAccess: isSuperAdmin || normalizeWorkspaceRoles(roles).length > 0 || canSignIn({ status: user.status, roles: user.roles }),
      roles: normalizeWorkspaceRoles(roles).length > 0
        ? normalizeWorkspaceRoles(roles)
        : (canSignIn({ status: user.status, roles: user.roles }) ? ["workspace_member"] : []),
      isSuperAdmin,
    },
  ];
}
