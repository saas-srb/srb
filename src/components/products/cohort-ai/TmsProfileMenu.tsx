"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { tmsLogoutAction } from "@/app/(products)/cohort-ai/(protected)/actions";
import { type TmsRole } from "@/lib/tms-roles"

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


  return (
    <UnifiedProfileMenu
      email={email}
      roles={roles as string[]}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => tmsLogoutAction()}
      panelName="Training Management"
    />
  );
}
