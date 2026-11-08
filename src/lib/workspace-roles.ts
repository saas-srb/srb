/**
 * Workspace Product role model. Access is gated on `admin_users.roles`.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const WORKSPACE_ROLES = ["super_admin", "workspace_admin", "workspace_member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_ROLE_META: Record<WorkspaceRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full workspace configuration and executive dashboard access.",
  },
  workspace_admin: {
    label: "CommandOS Admin",
    description: "Manage workspace settings, department analytics, and employee product access.",
  },
  workspace_member: {
    label: "CommandOS Member",
    description: "Access to workspace dashboard, employee self-service, and department KPIs.",
  },
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function normalizeWorkspaceRoles(value: unknown): WorkspaceRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isWorkspaceRole)));
}

export function hasWorkspaceAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeWorkspaceRoles(roles).length > 0;
}

export function isWorkspaceAdmin(user: RoleContext): boolean {
  return resolvePermission(user, "workspace.isWorkspaceAdmin", () =>
    user.roles.includes("super_admin") || user.roles.includes("workspace_admin")
  );
}

export function canViewWorkspaceAnalytics(user: RoleContext): boolean {
  return resolvePermission(user, "workspace.canViewAnalytics", () =>
    user.roles.includes("super_admin") || user.roles.includes("workspace_admin") || user.roles.includes("workspace_member")
  );
}

export function canManageWorkspace(user: RoleContext): boolean {
  return resolvePermission(user, "workspace.canManageWorkspace", () =>
    user.roles.includes("super_admin") || user.roles.includes("workspace_admin")
  );
}
