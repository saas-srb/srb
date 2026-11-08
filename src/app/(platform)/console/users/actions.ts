"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission, type PlatformUser } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { coversPermissions } from "@/lib/platform/console/permissions";
import { assignPlatformRole, createRole, deleteRole, getRole, revokePlatformAccess, updateRole, type Actor, type RoleInput } from "@/lib/platform/console/roles";
import { inviteTeammate, listPendingInvitations, revokeInvitation } from "@/lib/platform/invitations";
import { rolesForPreset } from "@/lib/platform/onboarding/catalog";
import { requestOrigin } from "@/lib/platform/request";

export type UsersActionResult = { ok: true; message: string } | { ok: false; error: string };

const actorOf = (u: PlatformUser): Actor => ({ id: u.id, permissions: u.platform.permissions });

function done(message: string): UsersActionResult {
  revalidatePath("/console/users");
  return { ok: true, message };
}

export async function assignRoleAction(userId: string, roleId: string): Promise<UsersActionResult> {
  const auth = await checkPlatformPermission("users.manage");
  if (!auth.ok) return auth;
  const res = await assignPlatformRole(String(userId), String(roleId), actorOf(auth.user));
  return res.ok ? done("Access updated.") : res;
}

export async function revokeAccessAction(userId: string): Promise<UsersActionResult> {
  const auth = await checkPlatformPermission("users.manage");
  if (!auth.ok) return auth;
  const res = await revokePlatformAccess(String(userId), actorOf(auth.user));
  return res.ok ? done("Access revoked.") : res;
}

export async function invitePlatformUserAction(input: { email: string; name: string; preset: string; roleId: string }): Promise<UsersActionResult> {
  const auth = await checkPlatformPermission("users.manage");
  if (!auth.ok) return auth;
  const role = await getRole(String(input?.roleId ?? ""));
  if (!role) return { ok: false, error: "Choose a platform role." };
  if (!coversPermissions(auth.user.platform.permissions, role.permissions)) return { ok: false, error: `You can't grant ${role.name} — it has permissions you don't have.` };
  const preset = String(input?.preset ?? "");
  const teamRoles = rolesForPreset(preset);
  if (!teamRoles) return { ok: false, error: "Choose their team role." };
  // A Company Admin preset makes them super_admin across the owner company's own products.
  if (teamRoles.includes("super_admin") && !auth.user.platform.permissions.includes("*")) return { ok: false, error: "Only a Platform Owner can invite a Company Admin." };
  const { origin } = await requestOrigin();
  const res = await inviteTeammate({ email: String(input?.email ?? ""), name: String(input?.name ?? ""), preset, platformRoleId: role._id }, { id: auth.user.id, email: auth.user.email }, origin);
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: "platform_user.invite", target: { type: "invitation", id: res.email }, details: { email: res.email, role: role._id, preset } });
  return done(`Invitation sent to ${res.email}. They get ${role.name} access once they accept.`);
}

export async function revokeInviteAction(id: string): Promise<UsersActionResult> {
  const auth = await checkPlatformPermission("users.manage");
  if (!auth.ok) return auth;
  const inv = (await listPendingInvitations({ platformOnly: true })).find((i) => i._id === String(id));
  if (!inv) return { ok: false, error: "That invitation was already used or withdrawn." };
  const role = await getRole(inv.platformRoleId);
  if (role && !coversPermissions(auth.user.platform.permissions, role.permissions)) return { ok: false, error: "You can't withdraw an invitation for a role with permissions you don't have." };
  await revokeInvitation(inv._id);
  await recordPlatformAudit({ actorId: auth.user.id, action: "platform_user.invite_revoke", target: { type: "invitation", id: inv._id }, details: { email: inv.email, role: inv.platformRoleId ?? null } });
  return done(`Invitation to ${inv.email} withdrawn.`);
}

export async function saveRoleAction(id: string | null, input: RoleInput): Promise<UsersActionResult> {
  const auth = await checkPlatformPermission("users.manage");
  if (!auth.ok) return auth;
  if (id) {
    const res = await updateRole(String(id), input, actorOf(auth.user));
    return res.ok ? done("Role saved.") : res;
  }
  const res = await createRole(input, actorOf(auth.user));
  return res.ok ? done("Role created.") : res;
}

export async function deleteRoleAction(id: string): Promise<UsersActionResult> {
  const auth = await checkPlatformPermission("users.manage");
  if (!auth.ok) return auth;
  const res = await deleteRole(String(id), actorOf(auth.user));
  return res.ok ? done("Role deleted.") : res;
}
