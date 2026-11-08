"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { prmsLogoutAction } from "@/app/(products)/spendiq/(protected)/actions";
import { primaryPrmsRoleLabel, type PrmsRole } from "@/lib/prms-roles"

export default function PrmsProfileMenu({
  email,
  roles,
  permissionOverrides,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: PrmsRole[];
  permissionOverrides?: Record<string, boolean>;
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primaryPrmsRoleLabel(roles);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roles as string[]}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => prmsLogoutAction()}
      panelName="Procurement Management"
    />
  );
}
