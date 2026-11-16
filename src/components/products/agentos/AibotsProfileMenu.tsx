"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { aibotsLogoutAction } from "@/app/(products)/agentos/(protected)/actions";
import { } from "@/lib/aibots-roles"

export default function AibotsProfileMenu({
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
      onLogout={() => aibotsLogoutAction()}
      panelName="AgentOS Management"
    />
  );
}
