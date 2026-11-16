"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { smmsLogoutAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import {  } from "@/lib/smms-roles";

export default function SmmsProfileMenu({
  email,
  roles,
  flags,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: string[];
  flags: { audit?: boolean; settings?: boolean };
  createdAt: string;
  lastLoginAt: string | null;
}) {


  return (
    <UnifiedProfileMenu
      email={email}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => smmsLogoutAction()}
      panelName="Social Media Management"
    />
  );
}
