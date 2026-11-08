"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { logoutAction } from "@/app/(products)/dealflow-ai/(protected)/actions";

export default function SidebarProfileMenu({
  userEmail,
  createdAt,
  lastLoginAt,
}: {
  userEmail: string;
  createdAt: string;
  lastLoginAt: string | null;
}) {
  return (
    <UnifiedProfileMenu
      email={userEmail}
      roleLabel="Administrator"
      roles={["Administrator"]}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => logoutAction()}
      panelName="Lead Management"
    />
  );
}
