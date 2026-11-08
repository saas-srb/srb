"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { aibotsLogoutAction } from "@/app/(products)/agentos/(protected)/actions";
import { primaryAibotsRoleLabel } from "@/lib/aibots-roles"

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
  const roleLabel = primaryAibotsRoleLabel ? primaryAibotsRoleLabel(roles) : (roles[0] ?? "User");

  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roles}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => aibotsLogoutAction()}
      panelName="AgentOS Management"
    />
  );
}
