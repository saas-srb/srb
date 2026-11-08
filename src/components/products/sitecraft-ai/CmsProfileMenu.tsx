"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { cmsLogoutAction } from "@/app/(products)/sitecraft-ai/(protected)/actions";
import { primaryCmsRoleLabel, CMS_ROLE_META, normalizeCmsRoles } from "@/lib/cms-roles"

export default function CmsProfileMenu({
  email,
  roles,
  flags = {},
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: string[];
  flags?: any;
  createdAt: string;
  lastLoginAt: string | null;
}) {
  const roleLabel = primaryCmsRoleLabel(roles);
  const roleNames = (roles.includes("super_admin") ? ["super_admin" as const] : normalizeCmsRoles(roles)).map((r) => CMS_ROLE_META[r].label);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roleNames}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => cmsLogoutAction()}
      panelName="Content Management"
    />
  );
}
