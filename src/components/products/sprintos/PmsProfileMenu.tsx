"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { pmsLogoutAction } from "@/app/(products)/sprintos/(protected)/actions";
import { type PmsRole } from "@/lib/pms-roles"

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


  return (
    <UnifiedProfileMenu
      email={email}
      roles={roles as string[]}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => pmsLogoutAction()}
      panelName="Project Management"
    />
  );
}
