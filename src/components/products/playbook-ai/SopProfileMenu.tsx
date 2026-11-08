"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { sopLogoutAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import { primarySopRoleLabel, effectiveSopRoles, SOP_ROLE_META } from "@/lib/sop-roles"

export default function SopProfileMenu({
  email,
  roles,
  flags,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: string[];
  flags: { compliance?: boolean; reports?: boolean; audit?: boolean; settings?: boolean };
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primarySopRoleLabel(roles);
  const roleNames = (roles.includes("super_admin") ? ["super_admin" as const] : effectiveSopRoles(roles)).map((r) => SOP_ROLE_META[r].label);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roleNames}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => sopLogoutAction()}
      panelName="Standard Operating Procedures"
    />
  );
}
