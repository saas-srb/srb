"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { otsLogoutAction } from "@/app/(products)/evaliq/(protected)/actions";
import {  } from "@/lib/ots-roles";

export default function OtsProfileMenu({
  email,
  roles,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: string[];
  createdAt: string;
  lastLoginAt: string | null;
}) {

  return (
    <UnifiedProfileMenu
      email={email}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => otsLogoutAction()}
      panelName="Online Testing System"
    />
  );
}
