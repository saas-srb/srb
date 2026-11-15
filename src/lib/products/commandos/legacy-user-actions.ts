import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { checkSeatUsage } from "@/lib/notify/triggers/usage";
import { countSeatsUsed } from "@/lib/platform/billing/enforce";
import { workspaceEvents } from "@/lib/notify/triggers/workspace";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import {
  createAdminUser, updateAdminUserRoles, updateAdminUserPermissionOverrides, delegatedManagerBlock, DIRECTOR_DESIGNATION_ID,
  type CreateAdminUserInput, type CreateAdminUserResult,
} from "@/lib/products/commandos/admin-users";
import { ALL_KNOWN_ROLES } from "@/lib/products/commandos/role-catalog";
import { ALL_PERMISSION_KEYS } from "@/lib/products/commandos/permission-catalog";
import { customRolesCarryPermissions, getCustomRoles, recordAccessAudit } from "@/lib/products/commandos/custom-roles";
import { legacyToAccess } from "@/lib/access/adapter";

/**
 * The role-based way of changing a person, kept ONLY for the AI assistant's tools (`lib/ai/agent/entities/workspace.ts`). The People &
 * Access screen never uses it. After a change here the person's saved access map (if they have one) is recomputed from their roles, so the
 * map and the roles can never disagree.
 */

async function customRoleBlock(actor: { id?: string; roles: readonly string[] }, targetId: string | undefined, ids: string[] | undefined): Promise<string | null> {
  if (!ids || ids.length === 0) return null;
  if (actor.roles.includes("super_admin")) return null;
  if (await customRolesCarryPermissions(ids)) return "Only a Director can give a designation that carries permission rules.";
  const roles = (await getCustomRoles(ids)).flatMap((r) => r.baseRoles);
  return delegatedManagerBlock(actor, { targetId, roles });
}

const sanitizeRoles = (roles: string[]) => Array.from(new Set(roles.filter((r) => ALL_KNOWN_ROLES.includes(r))));
function sanitizeOverrides(overrides: Record<string, boolean>): Record<string, boolean> {
  const clean: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) if (key in overrides) clean[key] = overrides[key];
  return clean;
}

/** Keeps `access` equal to what the person's roles and overrides now give (only for people who already have a saved map). */
async function resyncAccess(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) return;
  const col = (await getDb()).collection<{ _id: ObjectId; roles?: string[]; permissionOverrides?: Record<string, boolean>; access?: unknown }>("admin_users");
  const u = await col.findOne({ _id: new ObjectId(id) });
  if (!u?.access) return;
  const { access } = legacyToAccess({ roles: u.roles ?? [], permissionOverrides: u.permissionOverrides ?? null });
  await col.updateOne({ _id: u._id }, { $set: { access } as never });
}

export async function createAdminUserAction(input: CreateAdminUserInput): Promise<CreateAdminUserResult> {
  const actor = await requireWorkspaceAction("company.users");
  const extraRoles = sanitizeRoles(input.extraRoles ?? []);
  const extraIds = input.extraCustomRoleIds ?? [];
  const designationRoles = input.designationId === DIRECTOR_DESIGNATION_ID ? ["super_admin"] : (await getCustomRoles([input.designationId])).flatMap((r) => r.baseRoles);
  const extraOverrides = sanitizeOverrides(input.extraOverrides ?? {});
  const blocked =
    (await delegatedManagerBlock(actor, { roles: [...extraRoles, ...designationRoles], overrides: Object.keys(extraOverrides).length > 0 })) ??
    (await customRoleBlock(actor, undefined, [input.designationId, ...extraIds].filter((x) => x !== DIRECTOR_DESIGNATION_ID)));
  if (blocked) return { ok: false, error: blocked };
  const result = await createAdminUser({ ...input, extraRoles, extraCustomRoleIds: extraIds, extraOverrides }, actor.id);
  if (result.ok) {
    const email = input.email.trim().toLowerCase();
    await recordAccessAudit({ actorId: actor.id, action: "user.created", target: email, detail: `by the assistant; extra roles: ${extraRoles.length}` });
    revalidatePath("/commandos/users");
    await workspaceEvents.userAdded(email, [...extraRoles, ...designationRoles], actor.id);
    await checkSeatUsage(await countSeatsUsed());
  }
  return result;
}

export async function updateAdminUserRolesAction(id: string, roles: string[], customRoleIds?: string[]): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("company.users");
  const blocked = (await delegatedManagerBlock(admin, { targetId: id, roles })) ?? (await customRoleBlock(admin, id, customRoleIds));
  if (blocked) return { ok: false, error: blocked };
  const result = await updateAdminUserRoles(id, sanitizeRoles(roles), admin.id, customRoleIds);
  if (result.ok) {
    await resyncAccess(id);
    await recordAccessAudit({ actorId: admin.id, action: "user.roles_changed", target: id, detail: `by the assistant; roles: ${sanitizeRoles(roles).join(", ") || "none"}` });
    revalidatePath("/commandos/users");
    await workspaceEvents.rolesChanged(id, sanitizeRoles(roles), admin.id);
  }
  return result;
}

export async function updateAdminUserPermissionOverridesAction(id: string, overrides: Record<string, boolean>): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireWorkspaceAction("company.users");
  const blocked = await delegatedManagerBlock(actor, { targetId: id, overrides: true });
  if (blocked) return { ok: false, error: blocked };
  const result = await updateAdminUserPermissionOverrides(id, sanitizeOverrides(overrides));
  if (result.ok) {
    await resyncAccess(id);
    await recordAccessAudit({ actorId: actor.id, action: "user.permissions_changed", target: id, detail: `by the assistant; ${Object.keys(sanitizeOverrides(overrides)).length} rule(s)` });
    revalidatePath("/commandos/users");
    await workspaceEvents.overridesChanged(id, actor.id);
  }
  return result;
}
