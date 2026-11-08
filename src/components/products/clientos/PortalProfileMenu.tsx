"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { portalLogoutAction } from "@/app/(products)/clientos/(app)/actions";
import { PORTAL_ROLE_META, type PortalRole } from "@/lib/portal-roles"

export default function PortalProfileMenu({
  email,
  role,
  displayName,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  role: PortalRole;
  displayName?: string;
  createdAt?: string;
  lastLoginAt?: string | null;
}) {
  const roleLabel = PORTAL_ROLE_META[role]?.label ?? role;

  return (
    <UnifiedProfileMenu
      email={email}
      name={displayName}
      roleLabel={roleLabel}
      roles={[roleLabel]}
      createdAt={createdAt ?? new Date().toISOString()}
      lastLoginAt={lastLoginAt ?? null}
      profileHref="/clientos/profile"
      onLogout={() => portalLogoutAction()}
      panelName="Client Portal"
    />
  );
}
