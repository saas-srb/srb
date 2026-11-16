"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { cmsLogoutAction } from "@/app/(products)/sitecraft-ai/(protected)/actions";
import {  } from "@/lib/cms-roles";

export default function CmsProfileMenu({
  email,
  roles,
  flags = {},
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: string[];
  flags?: any;
  createdAt: string;
  lastLoginAt: string | null;
}) {


  return (
    <UnifiedProfileMenu
      email={email}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => cmsLogoutAction()}
      panelName="Content Management"
    />
  );
}
