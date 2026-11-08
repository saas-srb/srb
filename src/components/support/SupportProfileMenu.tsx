"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { hubLogoutAction } from "@/app/(products)/commandos/(protected)/actions";

export default function SupportProfileMenu({ email, roles, createdAt, lastLoginAt }: { email: string; roles: string[]; createdAt: string; lastLoginAt: string | null }) {
  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roles.some((r) => r === "super_admin") ? "Company Admin" : "Team Member"}
      roles={roles}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => hubLogoutAction()}
      panelName="Help & Support"
    />
  );
}
