"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { otsLogoutAction } from "@/app/(products)/evaliq/(protected)/actions";
import { primaryOtsRoleLabel, OTS_ROLE_META, effectiveOtsRoles } from "@/lib/ots-roles"

export default function OtsProfileMenu({
  email,
  roles,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: string[];
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primaryOtsRoleLabel(roles);
  const roleNames = (roles.includes("super_admin") ? ["super_admin" as const] : effectiveOtsRoles(roles)).map((r) => OTS_ROLE_META[r].label);

  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roleNames}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => otsLogoutAction()}
      panelName="Online Testing System"
    />
  );
}
