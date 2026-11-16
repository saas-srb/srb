"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { intelligenceLogoutAction } from "@/app/(products)/databrain-ai/(protected)/actions";
import {  } from "@/lib/intelligence-roles";

export default function IntelligenceProfileMenu({
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
      onLogout={() => intelligenceLogoutAction()}
      panelName="Business Intelligence"
    />
  );
}
