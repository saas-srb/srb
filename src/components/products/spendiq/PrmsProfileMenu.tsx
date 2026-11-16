"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { prmsLogoutAction } from "@/app/(products)/spendiq/(protected)/actions";
import { type PrmsRole } from "@/lib/prms-roles"

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


  return (
    <UnifiedProfileMenu
      email={email}
      roles={roles as string[]}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => prmsLogoutAction()}
      panelName="Procurement Management"
    />
  );
}
