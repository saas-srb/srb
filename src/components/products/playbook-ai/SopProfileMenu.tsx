"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { sopLogoutAction } from "@/app/(products)/playbook-ai/(protected)/actions";

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


  return (
    <UnifiedProfileMenu
      email={email}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => sopLogoutAction()}
      panelName="Standard Operating Procedures"
    />
  );
}
