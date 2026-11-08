"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { pmsLogoutAction } from "@/app/(products)/sprintos/(protected)/actions";
import { primaryPmsRoleLabel, type PmsRole } from "@/lib/pms-roles"

export default function PmsProfileMenu({
  email,
  roles,
  permissionOverrides,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: PmsRole[];
  permissionOverrides?: Record<string, boolean>;
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primaryPmsRoleLabel(roles);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roles as string[]}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => pmsLogoutAction()}
      panelName="Project Management"
    />
  );
}
