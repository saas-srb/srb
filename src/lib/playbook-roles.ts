/**
 * Playbook DOCUMENT permissions (templates, AI drafting, editor, versions, approval, export, handoff to ContractFlow).
 *
 * Roles are NOT duplicated: the product keeps the existing `sop_*` roles in `admin_users.roles` (`sop-roles.ts`), so nobody needs a new role
 * grant. This file only adds the finer capabilities the document features need and maps each existing role tier onto them. Every predicate
 * is Director-override-aware through `resolvePermission` and the keys are listed in `commandos/permission-catalog.ts`.
 *
 * Pure (no server-only imports) so client components can hide buttons, but hiding a button is never the security boundary: every server
 * action and route re-checks with `playbookCan`.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";
import { effectiveSopRoles, type SopRole } from "@/lib/sop-roles";

export const PLAYBOOK_PERMISSIONS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "COMMENT",
  "SUBMIT",
  "APPROVE",
  "ISSUE",
  "EXPORT",
  "SHARE",
  "SEND_FOR_SIGNATURE",
  "USE_AI",
  "MANAGE_TEMPLATES",
  "REVIEW_TEMPLATES",
  "MANAGE_BRAND",
  "MANAGE_VARIABLES",
  "MANAGE_RETENTION",
  "VIEW_AUDIT",
  "SETTINGS",
] as const;
export type PlaybookPermission = (typeof PLAYBOOK_PERMISSIONS)[number];

/** Key under which the Director stores an override: must match `permission-catalog.ts`. */
export const PLAYBOOK_PERMISSION_KEY: Record<PlaybookPermission, string> = {
  VIEW: "playbookdoc.canView",
  CREATE: "playbookdoc.canCreate",
  EDIT: "playbookdoc.canEdit",
  COMMENT: "playbookdoc.canComment",
  SUBMIT: "playbookdoc.canSubmit",
  APPROVE: "playbookdoc.canApprove",
  ISSUE: "playbookdoc.canIssue",
  EXPORT: "playbookdoc.canExport",
  SHARE: "playbookdoc.canShare",
  SEND_FOR_SIGNATURE: "playbookdoc.canSendForSignature",
  USE_AI: "playbookdoc.canUseAi",
  MANAGE_TEMPLATES: "playbookdoc.canManageTemplates",
  REVIEW_TEMPLATES: "playbookdoc.canReviewTemplates",
  MANAGE_BRAND: "playbookdoc.canManageBrand",
  MANAGE_VARIABLES: "playbookdoc.canManageVariables",
  MANAGE_RETENTION: "playbookdoc.canManageRetention",
  VIEW_AUDIT: "playbookdoc.canViewAudit",
  SETTINGS: "playbookdoc.canManageSettings",
};

export const PLAYBOOK_PERMISSION_META: Record<PlaybookPermission, { label: string; description: string }> = {
  VIEW: { label: "View documents", description: "Open the documents their type, confidentiality and scope allow." },
  CREATE: { label: "Create documents", description: "Start a document from a template, with or without AI." },
  EDIT: { label: "Edit documents", description: "Edit drafts within their scope." },
  COMMENT: { label: "Comment", description: "Comment on documents they can open." },
  SUBMIT: { label: "Submit for review", description: "Submit a draft for approval." },
  APPROVE: { label: "Approve", description: "Approve or reject documents sent for review." },
  ISSUE: { label: "Issue", description: "Issue an approved document: assigns its number and freezes the version." },
  EXPORT: { label: "Export PDF and Word", description: "Download a document as PDF or DOCX." },
  SHARE: { label: "Share", description: "Share a document internally or by a read-only link." },
  SEND_FOR_SIGNATURE: { label: "Send for signature", description: "Create a clone in ContractFlow so it can be signed." },
  USE_AI: { label: "Use AI drafting", description: "Generate, rewrite and improve sections with AI." },
  MANAGE_TEMPLATES: { label: "Manage templates", description: "Clone, edit and create the company's own templates." },
  REVIEW_TEMPLATES: { label: "Review templates", description: "Set a template's reviewed-by and reviewed-on stamp (legal review)." },
  MANAGE_BRAND: { label: "Manage brand and letterhead", description: "Change logo, colours, fonts, header, footer and page margins." },
  MANAGE_VARIABLES: { label: "Manage variables", description: "Define the company's own document variables." },
  MANAGE_RETENTION: { label: "Retention, purge and legal hold", description: "Set retention periods, place or lift a legal hold, and purge documents." },
  VIEW_AUDIT: { label: "View audit", description: "Read the document audit trail." },
  SETTINGS: { label: "Manage settings", description: "Numbering, approval rules, AI and other document settings." },
};

const READER: PlaybookPermission[] = ["VIEW", "COMMENT"];
const AUTHOR: PlaybookPermission[] = [...READER, "CREATE", "EDIT", "SUBMIT", "EXPORT", "USE_AI"];
const MANAGER: PlaybookPermission[] = [...AUTHOR, "APPROVE", "ISSUE", "SHARE", "SEND_FOR_SIGNATURE"];
const ADMIN: PlaybookPermission[] = [...PLAYBOOK_PERMISSIONS];

export const PLAYBOOK_ROLE_PERMISSIONS: Record<SopRole, readonly PlaybookPermission[]> = {
  super_admin: ADMIN,
  sop_admin: ADMIN,
  sop_manager: MANAGER,
  sop_author: AUTHOR,
  sop_employee: READER,
};

/** The single permission check every Playbook document action, route and page uses. */
export function playbookCan(user: RoleContext, permission: PlaybookPermission): boolean {
  return resolvePermission(user, PLAYBOOK_PERMISSION_KEY[permission], () =>
    effectiveSopRoles(user.roles).some((r) => PLAYBOOK_ROLE_PERMISSIONS[r].includes(permission))
  );
}
