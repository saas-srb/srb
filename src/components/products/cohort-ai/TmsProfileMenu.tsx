"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { tmsLogoutAction } from "@/app/(products)/cohort-ai/(protected)/actions";
import { primaryTmsRoleLabel, type TmsRole } from "@/lib/tms-roles"

export default function TmsProfileMenu({
  email,
  roles,
  permissionOverrides,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: TmsRole[];
  permissionOverrides?: Record<string, boolean>;
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primaryTmsRoleLabel(roles);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roles as string[]}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => tmsLogoutAction()}
      panelName="Training Management"
    />
  );
}
