"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { dlmsLogoutAction } from "@/app/(products)/cybervault/(protected)/actions";
import { primaryDlmsRoleLabel } from "@/lib/dlms-roles"

export default function DlmsProfileMenu({
  email,
  roles,
  createdAt,
  lastLoginAt,
  flags,
}: {
  email: string;
  roles: string[];
  createdAt: string;
  lastLoginAt: string | null;
  flags?: { audit?: boolean; settings?: boolean; expired?: number };
}) {
  const roleLabel = primaryDlmsRoleLabel(roles);


  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roles}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => dlmsLogoutAction()}
      panelName="Document Lifecycle Management"
    />
  );
}
