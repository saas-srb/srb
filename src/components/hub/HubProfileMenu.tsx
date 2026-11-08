"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { hubLogoutAction } from "@/app/(products)/commandos/(protected)/actions";

export default function HubProfileMenu({
  email,
  roles = ["super_admin"],
  lastLoginAt,
  links,
}: {
  email: string;
  roles?: string[];
  lastLoginAt: string | null;
  links?: { href: string; label: string }[];
}) {
  // The workspace's nav lists the Platform Console only for people who have platform access, so its link shows up here for them alone.
  const platform = links?.find((l) => l.href === "/console");

  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel="Director"
      roles={roles}
      createdAt={new Date().toISOString()}
      lastLoginAt={lastLoginAt}
      onLogout={() => hubLogoutAction()}
      panelName="Workspace Hub"
    />
  );
}
