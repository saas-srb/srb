"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { hrmsLogoutAction } from "@/app/(products)/talentos/(protected)/actions";
import { primaryRoleLabel, type HrmsRole } from "@/lib/hrms-roles"

export default function HrmsProfileMenu({
  email,
  roles,
  permissionOverrides,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: HrmsRole[];
  permissionOverrides?: Record<string, boolean>;
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primaryRoleLabel(roles);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roles}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => hrmsLogoutAction()}
      panelName="Human Resource Management"
    />
  );
}
