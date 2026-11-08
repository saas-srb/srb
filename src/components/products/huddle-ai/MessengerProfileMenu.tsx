"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { messengerLogoutAction } from "@/app/(products)/huddle-ai/(protected)/actions";
import { primaryChatRoleLabel, CHAT_ROLE_META, type ChatRole } from "@/lib/messenger-roles"

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
  const roleLabel = primaryChatRoleLabel(roles);
  const roleNames = roles.map((r) => CHAT_ROLE_META[r].label);


  return (
    <UnifiedProfileMenu
      email={email}
      name={displayName}
      roleLabel={roleLabel}
      roles={roleNames}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => messengerLogoutAction()}
      panelName="Team Messenger"
    />
  );
}
