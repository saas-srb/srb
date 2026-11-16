"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { dlmsLogoutAction } from "@/app/(products)/cybervault/(protected)/actions";
import { } from "@/lib/dlms-roles"

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


  return (
    <UnifiedProfileMenu
      email={email}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => dlmsLogoutAction()}
      panelName="Document Lifecycle Management"
    />
  );
}
