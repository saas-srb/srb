/**
 * LPMS Product role + permission model. Client-safe (no server-only imports).
 * Mirrors sop-roles.ts exactly but for the Legal Policy Maker System (LPMS).
 *
 * Access is gated on the shared admin_users.roles array. HRMS stays the source
 * of truth for employee/manager tiers; their HRMS roles imply an LPMS tier.
 *
 * Every predicate is Super-Admin-override-aware (resolvePermission).
 */

import { resolvePermission, type RoleContext } from '@/lib/permission-overrides';

export const LPMS_ROLES = [
  'super_admin',
  'lpms_admin',
  'lpms_manager',
  'lpms_author',
  'lpms_viewer',
] as const;
export type LpmsRole = (typeof LPMS_ROLES)[number];

export const LPMS_ROLE_META: Record<LpmsRole, { label: string; description: string }> = {
  super_admin: {
    label: 'Director',
    description: 'Every ContractFlow operation across all document types, templates, workflows, signatures, and audit.',
  },
  lpms_admin: {
    label: 'ContractFlow Admin',
    description: 'Manage every document, maker type, template, workflow, approval, signature and audit log.',
  },
  lpms_manager: {
    label: 'ContractFlow Manager',
    description: 'Create, edit, approve, publish and archive documents; manage templates, policies, workflows.',
  },
  lpms_author: {
    label: 'ContractFlow Author',
    description: 'Create and edit documents using available templates and maker types. Cannot approve or publish.',
  },
  lpms_viewer: {
    label: 'ContractFlow Viewer',
    description: 'Read and download permitted documents.',
  },
};

export const LPMS_PERMISSIONS = [
  'VIEW',
  'CREATE',
  'EDIT',
  'DELETE',
  'GENERATE',
  'APPROVE',
  'PUBLISH',
  'DOWNLOAD',
  'EXPORT',
  'SHARE',
  'SIGN',
  'ARCHIVE',
  'MANAGE_TEMPLATES',
  'MANAGE_MAKERS',
  'MANAGE_POLICIES',
  'MANAGE_DOCUMENTS',
  'VIEW_AUDIT',
] as const;
export type LpmsPermission = (typeof LPMS_PERMISSIONS)[number];

export const LPMS_PERMISSION_KEY: Record<LpmsPermission, string> = {
  VIEW: 'lpms.canView',
  CREATE: 'lpms.canCreate',
  EDIT: 'lpms.canEdit',
  DELETE: 'lpms.canDelete',
  GENERATE: 'lpms.canGenerate',
  APPROVE: 'lpms.canApprove',
  PUBLISH: 'lpms.canPublish',
  DOWNLOAD: 'lpms.canDownload',
  EXPORT: 'lpms.canExport',
  SHARE: 'lpms.canShare',
  SIGN: 'lpms.canSign',
  ARCHIVE: 'lpms.canArchive',
  MANAGE_TEMPLATES: 'lpms.canManageTemplates',
  MANAGE_MAKERS: 'lpms.canManageMakers',
  MANAGE_POLICIES: 'lpms.canManagePolicies',
  MANAGE_DOCUMENTS: 'lpms.canManageDocuments',
  VIEW_AUDIT: 'lpms.canViewAudit',
};

export const LPMS_PERMISSION_META: Record<LpmsPermission, { label: string; description: string }> = {
  VIEW: { label: 'View', description: 'Open and read documents their access level permits.' },
  CREATE: { label: 'Create', description: 'Start new document drafts from templates and maker types.' },
  EDIT: { label: 'Edit', description: 'Edit document drafts, blocks, variables and metadata.' },
  DELETE: { label: 'Delete', description: 'Permanently delete draft documents.' },
  GENERATE: { label: 'AI Generate', description: 'Use AI to generate or improve document content.' },
  APPROVE: { label: 'Approve', description: 'Approve documents moving through the approval workflow.' },
  PUBLISH: { label: 'Publish', description: 'Publish an approved document and make it active.' },
  DOWNLOAD: { label: 'Download', description: 'Download documents as PDF or DOCX.' },
  EXPORT: { label: 'Export', description: 'Export document lists and audit reports as CSV.' },
  SHARE: { label: 'Share', description: 'Share document links and control access.' },
  SIGN: { label: 'Request Signatures', description: 'Request digital signatures on documents.' },
  ARCHIVE: { label: 'Archive', description: 'Archive and restore documents.' },
  MANAGE_TEMPLATES: { label: 'Manage templates', description: 'Create, edit and delete document templates and blocks.' },
  MANAGE_MAKERS: { label: 'Manage maker types', description: 'Create, configure and delete document maker types.' },
  MANAGE_POLICIES: { label: 'Manage policies', description: 'Configure company-wide document policies and numbering.' },
  MANAGE_DOCUMENTS: { label: 'Manage all documents', description: 'Full CRUD over every document regardless of department.' },
  VIEW_AUDIT: { label: 'View audit log', description: 'Read the ContractFlow audit trail.' },
};

const VIEWER_PERMS: LpmsPermission[] = ['VIEW', 'DOWNLOAD'];
const AUTHOR_PERMS: LpmsPermission[] = [...VIEWER_PERMS, 'CREATE', 'EDIT', 'GENERATE'];
const MANAGER_PERMS: LpmsPermission[] = [
  ...AUTHOR_PERMS,
  'DELETE',
  'APPROVE',
  'PUBLISH',
  'EXPORT',
  'SHARE',
  'SIGN',
  'ARCHIVE',
  'MANAGE_TEMPLATES',
  'MANAGE_POLICIES',
  'MANAGE_DOCUMENTS',
];
const ADMIN_PERMS: LpmsPermission[] = [...LPMS_PERMISSIONS];

export const LPMS_ROLE_PERMISSIONS: Record<LpmsRole, readonly LpmsPermission[]> = {
  super_admin: ADMIN_PERMS,
  lpms_admin: ADMIN_PERMS,
  lpms_manager: MANAGER_PERMS,
  lpms_author: AUTHOR_PERMS,
  lpms_viewer: VIEWER_PERMS,
};

export function isLpmsRole(value: unknown): value is LpmsRole {
  return typeof value === 'string' && (LPMS_ROLES as readonly string[]).includes(value);
}

export function normalizeLpmsRoles(value: unknown): LpmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isLpmsRole)));
}

/** HRMS roles imply an LPMS tier — employees get viewer access, managers get manager access. */
function impliedFromHrms(roles: readonly string[]): LpmsRole[] {
  const out: LpmsRole[] = [];
  if (roles.some((r) => r === 'super_admin' || r === 'admin' || r === 'workspace_admin' || r === 'owner')) {
    out.push('super_admin');
  }
  if (roles.includes('employee')) out.push('lpms_viewer');
  if (roles.includes('manager') || roles.includes('hr')) out.push('lpms_manager');
  return out;
}

/** Explicit lpms_* roles plus what the account's HRMS role implies. */
export function effectiveLpmsRoles(roles: readonly string[] | undefined | null): LpmsRole[] {
  const raw = roles ?? [];
  return Array.from(new Set([...normalizeLpmsRoles(raw), ...impliedFromHrms(raw)]));
}

/** Can open the LPMS product at /contractflow-ai/*. */
export function hasLpmsAccess(roles: readonly string[] | undefined | null): boolean {
  const raw = roles ?? [];
  if (raw.some((r) => r === 'super_admin' || r === 'admin' || r === 'workspace_admin' || r === 'owner')) return true;
  return effectiveLpmsRoles(raw).length > 0;
}

export function isLpmsAdmin(user: RoleContext): boolean {
  return user.roles.includes('super_admin') || user.roles.includes('lpms_admin');
}

export function isLpmsManagerTier(user: RoleContext): boolean {
  return isLpmsAdmin(user) || effectiveLpmsRoles(user.roles).includes('lpms_manager');
}

export function lpmsCan(user: RoleContext, permission: LpmsPermission): boolean {
  return resolvePermission(user, LPMS_PERMISSION_KEY[permission], () =>
    effectiveLpmsRoles(user.roles).some((r) => LPMS_ROLE_PERMISSIONS[r].includes(permission))
  );
}

export function primaryLpmsRoleLabel(roles: readonly string[]): string {
  if (roles.includes('super_admin')) return LPMS_ROLE_META.super_admin.label;
  const eff = effectiveLpmsRoles(roles);
  for (const r of ['lpms_admin', 'lpms_manager', 'lpms_author', 'lpms_viewer'] as const) {
    if (eff.includes(r)) return LPMS_ROLE_META[r].label;
  }
  return 'No Access';
}
