"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { intelligenceLogoutAction } from "@/app/(products)/databrain-ai/(protected)/actions";
import { primaryIntelligenceRoleLabel, normalizeIntelligenceRoles, INTELLIGENCE_ROLE_META } from "@/lib/intelligence-roles"

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
  const roleLabel = primaryIntelligenceRoleLabel(roles);
  const roleNames = (roles.includes("super_admin") ? ["super_admin" as const] : normalizeIntelligenceRoles(roles)).map((r) => INTELLIGENCE_ROLE_META[r].label);

  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel={roleLabel}
      roles={roleNames}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => intelligenceLogoutAction()}
      panelName="Business Intelligence"
    />
  );
}
