"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { hubLogoutAction } from "@/app/(products)/commandos/(protected)/actions";

/** The signed-in person at the bottom of the Platform Console's sidebar (desktop and the mobile drawer): the same profile block as every other product. */
export default function PlatformProfileMenu({ email, createdAt, lastLoginAt }: { email: string; createdAt?: string; lastLoginAt?: string | null }) {
  return (
    <UnifiedProfileMenu
      email={email}
      roleLabel="Platform admin"
      roles={["Platform admin"]}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt ?? null}
      onLogout={() => hubLogoutAction()}
      panelName="Platform Console"
    />
  );
}
