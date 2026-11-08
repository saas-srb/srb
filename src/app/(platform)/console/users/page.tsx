import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { countRoleUsers, listEligibleHubUsers, listPlatformUsers, listRoles } from "@/lib/platform/console/roles";
import { PERMISSION_GROUPS } from "@/lib/platform/console/permissions";
import { listPendingInvitations } from "@/lib/platform/invitations";
import { ROLE_PRESETS } from "@/lib/platform/onboarding/catalog";
import UsersAndRoles from "./UsersAndRoles";

export const metadata: Metadata = { title: "Platform users & roles" };

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePlatformPermission("users.read");
  const canManage = can(user, "users.manage");
  const [{ tab }, users, roles, counts, eligible, invites] = await Promise.all([
    searchParams,
    listPlatformUsers(),
    listRoles(),
    countRoleUsers(),
    canManage ? listEligibleHubUsers() : Promise.resolve([]),
    listPendingInvitations({ platformOnly: true }),
  ]);

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Platform users & roles" description="Who from your team can use the Platform Console, and what each role is allowed to do." crumbs={[{ label: "Administration" }]} />
      <PanelListFilters>
<UsersAndRoles
        initialTab={tab === "roles" ? "roles" : "users"}
        currentUserId={user.id}
        currentPermissions={user.platform.permissions}
        canManage={canManage}
        users={users.map((u) => ({ ...u, grantedAt: u.grantedAt?.toISOString() ?? null, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
        roles={roles.map((r) => ({ id: r._id, name: r.name, description: r.description, permissions: r.permissions, builtIn: r.builtIn, users: counts[r._id] ?? 0 }))}
        eligible={eligible}
        invites={invites.map((i) => ({ id: i._id, email: i.email, name: i.name, roleId: i.platformRoleId ?? null, expiresAt: i.expiresAt.toISOString() }))}
        presets={ROLE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        groups={PERMISSION_GROUPS.map((g) => ({ area: g.area, permissions: g.permissions.map((p) => ({ key: p.key, label: p.label })) }))}
      />
</PanelListFilters>
    </div>
  );
}
