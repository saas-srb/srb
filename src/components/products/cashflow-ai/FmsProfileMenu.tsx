"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { fmsLogoutAction } from "@/app/(products)/cashflow-ai/(protected)/actions";
import { primaryFmsRoleLabel, type FmsRole } from "@/lib/fms-roles"

export default function FmsProfileMenu({
  email,
  roles,
  permissionOverrides,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: FmsRole[];
  permissionOverrides?: Record<string, boolean>;
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primaryFmsRoleLabel(roles);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roles}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => fmsLogoutAction()}
      panelName="Financial Management System"
    />
  );
}
