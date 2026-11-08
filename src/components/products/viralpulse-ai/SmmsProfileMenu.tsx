"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { smmsLogoutAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { primarySmmsRoleLabel, normalizeSmmsRoles, SMMS_ROLE_META } from "@/lib/smms-roles"

export default function SmmsProfileMenu({
  email,
  roles,
  flags,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: string[];
  flags: { audit?: boolean; settings?: boolean };
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primarySmmsRoleLabel(roles);
  const roleNames = (roles.includes("super_admin") ? ["super_admin" as const] : normalizeSmmsRoles(roles)).map((r) => SMMS_ROLE_META[r].label);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roleNames}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => smmsLogoutAction()}
      panelName="Social Media Management"
    />
  );
}
