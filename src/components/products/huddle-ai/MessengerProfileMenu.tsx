"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { messengerLogoutAction } from "@/app/(products)/huddle-ai/(protected)/actions";
import { type ChatRole } from "@/lib/messenger-roles";

export default function MessengerProfileMenu({
  email,
  displayName,
  roles,
  createdAt,
  lastLoginAt,
}: {
  email: string;
  displayName?: string;
  roles: ChatRole[];
  createdAt: string;
  lastLoginAt: string | null;
}) {


  return (
    <UnifiedProfileMenu
      email={email}
      name={displayName}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => messengerLogoutAction()}
      panelName="Team Messenger"
    />
  );
}
