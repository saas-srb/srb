"use server";

import { checkSeatUsage } from "@/lib/notify/triggers/usage";
import { countSeatsUsed } from "@/lib/platform/billing/enforce";
import { workspaceEvents } from "@/lib/notify/triggers/workspace";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import {
  createAdminUser,
  updateAdminUserRoles,
  updateAdminUserPermissionOverrides,
  resetAdminUserPassword,
  changeDesignation,
  DIRECTOR_DESIGNATION_ID,
  setUserTypeAndNotes,
  delegatedManagerBlock,
  type CreateAdminUserInput,
  type CreateAdminUserResult,
  type ResetPasswordResult,
} from "@/lib/products/commandos/admin-users";
import { ObjectId } from "mongodb";
import { resetTwoFactor } from "@/lib/security/two-factor";
import { ALL_KNOWN_ROLES } from "@/lib/products/commandos/role-catalog";
import { ALL_PERMISSION_KEYS } from "@/lib/products/commandos/permission-catalog";
import { searchActivityLog, type AdminActivityRow } from "@/lib/products/commandos/activity-log";
import { customRolesCarryPermissions, getCustomRoles, recordAccessAudit } from "@/lib/products/commandos/custom-roles";
import { changeAccountStatus, listStatusHistory, type StatusEventRow } from "@/lib/products/commandos/account-status";
import { isAccountStatus } from "@/lib/security/account-status";

/** Why `actor` may not hand out these custom roles, or null. Roles that carry permission grants are Super-Admin-only; plain bundles follow the same escalation rules as built-in roles. */
async function customRoleBlock(actor: { id?: string; roles: readonly string[] }, targetId: string | undefined, ids: string[] | undefined): Promise<string | null> {
  if (!ids || ids.length === 0) return null;
  if (actor.roles.includes("super_admin")) return null;
  if (await customRolesCarryPermissions(ids)) return "Only a Director can give a designation that carries permission rules.";
  const roles = (await getCustomRoles(ids)).flatMap((r) => r.baseRoles);
  return delegatedManagerBlock(actor, { targetId, roles });
}

function revalidate() {
  revalidatePath("/commandos/users");
}

function sanitizeRoles(roles: string[]): string[] {
  return Array.from(new Set(roles.filter((r) => ALL_KNOWN_ROLES.includes(r))));
}

function sanitizeOverrides(overrides: Record<string, boolean>): Record<string, boolean> {
  const clean: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (key in overrides) clean[key] = overrides[key];
  }
  return clean;
}

export async function createAdminUserAction(input: CreateAdminUserInput): Promise<CreateAdminUserResult> {
  const actor = await requireWorkspaceAction("company.users");
  const extraRoles = sanitizeRoles(input.extraRoles ?? []);
  const extraIds = input.extraCustomRoleIds ?? [];
  // The designation decides the access, so the same escalation rules apply to it as to roles: only a Director makes a Director.
  const designationRoles = input.designationId === DIRECTOR_DESIGNATION_ID ? ["super_admin"] : (await getCustomRoles([input.designationId])).flatMap((r) => r.baseRoles);
  const extraOverrides = sanitizeOverrides(input.extraOverrides ?? {});
  const blocked =
    (await delegatedManagerBlock(actor, { roles: [...extraRoles, ...designationRoles], overrides: Object.keys(extraOverrides).length > 0 })) ??
    (await customRoleBlock(actor, undefined, [input.designationId, ...extraIds].filter((x) => x !== DIRECTOR_DESIGNATION_ID)));
  if (blocked) return { ok: false, error: blocked };
  const result = await createAdminUser({ ...input, extraRoles, extraCustomRoleIds: extraIds, extraOverrides }, actor.id);
  if (result.ok) {
    const email = input.email.trim().toLowerCase();
    await recordAccessAudit({ actorId: actor.id, action: "user.created", target: email, detail: `designation: ${input.designationId === DIRECTOR_DESIGNATION_ID ? "Director" : (await getCustomRoles([input.designationId]))[0]?.name ?? input.designationId}; extra roles: ${extraRoles.length}; extra designations: ${extraIds.length}; individual permission rules: ${Object.keys(extraOverrides).length}` });
    revalidate();
    await workspaceEvents.userAdded(email, [...extraRoles, ...designationRoles], actor.id);
    await checkSeatUsage(await countSeatsUsed());
  }
  return result;
}

/** Gives a person another designation: their access in every product follows it. */
export async function changeDesignationAction(id: string, designationId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireWorkspaceAction("company.users");
  const roles = designationId === DIRECTOR_DESIGNATION_ID ? ["super_admin"] : (await getCustomRoles([designationId])).flatMap((r) => r.baseRoles);
  const blocked = (await delegatedManagerBlock(actor, { targetId: id, roles })) ?? (designationId === DIRECTOR_DESIGNATION_ID ? null : await customRoleBlock(actor, id, [designationId]));
  if (blocked) return { ok: false, error: blocked };
  const result = await changeDesignation(id, String(designationId ?? ""), actor.id);
  if (result.ok) {
    await recordAccessAudit({ actorId: actor.id, action: "user.designation_changed", target: id, detail: `designation: ${result.title}` });
    revalidate();
    await workspaceEvents.rolesChanged(id, roles, actor.id);
  }
  return result;
}

export async function updateAdminUserRolesAction(
  id: string,
  roles: string[],
  customRoleIds?: string[],
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("company.users");
  const blocked = (await delegatedManagerBlock(admin, { targetId: id, roles })) ?? (await customRoleBlock(admin, id, customRoleIds));
  if (blocked) return { ok: false, error: blocked };
  const result = await updateAdminUserRoles(id, sanitizeRoles(roles), admin.id, customRoleIds);
  if (result.ok) {
    await recordAccessAudit({ actorId: admin.id, action: "user.roles_changed", target: id, detail: `roles: ${sanitizeRoles(roles).join(", ") || "none"}${customRoleIds ? `; custom roles: ${customRoleIds.length}` : ""}` }); revalidate(); await workspaceEvents.rolesChanged(id, sanitizeRoles(roles), admin.id); }
  return result;
}

export async function updateAdminUserPermissionOverridesAction(
  id: string,
  overrides: Record<string, boolean>
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireWorkspaceAction("company.users");
  const blocked = await delegatedManagerBlock(actor, { targetId: id, overrides: true });
  if (blocked) return { ok: false, error: blocked };
  const result = await updateAdminUserPermissionOverrides(id, sanitizeOverrides(overrides));
  if (result.ok) {
    await recordAccessAudit({ actorId: actor.id, action: "user.permissions_changed", target: id, detail: `${Object.keys(sanitizeOverrides(overrides)).length} individual rule(s)` }); revalidate(); await workspaceEvents.overridesChanged(id, actor.id); }
  return result;
}

export async function resetAdminUserPasswordAction(id: string): Promise<ResetPasswordResult> {
  const actor = await requireWorkspaceAction("company.users");
  const blocked = await delegatedManagerBlock(actor, { targetId: id });
  if (blocked) return { ok: false, error: blocked };
  const result = await resetAdminUserPassword(id);
  if (result.ok) { revalidate(); await workspaceEvents.passwordReset(id, actor.id); }
  return result;
}

export interface StatusInput {
  status: string;
  reason?: string;
  lastWorkingDay?: string | null;
}

/** Only a Director sets a person's status (active, on leave, suspended, left the company …). A sign-in that cannot continue ends at once. */
export async function changeAccountStatusAction(id: string, input: StatusInput): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireWorkspaceAction("company.users");
  if (!actor.roles.includes("super_admin")) return { ok: false, error: "Only a Director can change a person's status." };
  if (!isAccountStatus(input?.status)) return { ok: false, error: "Choose a valid status." };
  const result = await changeAccountStatus(id, input.status, actor, { reason: String(input.reason ?? ""), lastWorkingDay: input.lastWorkingDay ?? null });
  if (result.ok) {
    revalidate();
    if (input.status === "active") await workspaceEvents.reactivated(id, actor.id);
    else await workspaceEvents.deactivated(id, actor.id);
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function bulkChangeStatusAction(ids: string[], input: StatusInput): Promise<{ changed: number; skipped: number; firstError?: string }> {
  const actor = await requireWorkspaceAction("company.users");
  if (!actor.roles.includes("super_admin")) return { changed: 0, skipped: ids.length, firstError: "Only a Director can change a person's status." };
  if (!isAccountStatus(input?.status)) return { changed: 0, skipped: ids.length, firstError: "Choose a valid status." };
  let changed = 0;
  let firstError: string | undefined;
  for (const id of ids.slice(0, 200)) {
    const r = await changeAccountStatus(id, input.status, actor, { reason: String(input.reason ?? ""), lastWorkingDay: input.lastWorkingDay ?? null });
    if (r.ok) changed += 1;
    else firstError ??= r.error;
  }
  revalidate();
  return { changed, skipped: ids.length - changed, firstError };
}

export async function getStatusHistoryAction(id: string): Promise<StatusEventRow[]> {
  await requireWorkspaceAction("company.users");
  return listStatusHistory(String(id ?? ""));
}

export async function setUserTypeAndNotesAction(
  id: string,
  userType: "employee" | "contractor" | "partner" | "system",
  notes?: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireWorkspaceAction("company.users");
  const blocked = await delegatedManagerBlock(actor, { targetId: id });
  if (blocked) return { ok: false, error: blocked };
  const result = await setUserTypeAndNotes(id, userType, notes);
  if (result.ok) revalidate();
  return result;
}

export async function getUserActivityAction(actorEmail: string): Promise<AdminActivityRow[]> {
  await requireWorkspaceAction("company.users");
  if (!actorEmail) return [];
  const result = await searchActivityLog({ search: actorEmail, pageSize: 50 });
  return result.items;
}

/** Switches two-step sign-in off for someone who lost their device (Director only); they can set it up again. */
export async function resetAdminUserTwoFactorAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireWorkspaceAction("company.users");
  if (!actor.roles.includes("super_admin")) return { ok: false, error: "Only a Director can reset two-step sign-in." };
  if (!ObjectId.isValid(id)) return { ok: false, error: "Unknown user." };
  await resetTwoFactor(new ObjectId(id));
  await recordAccessAudit({ actorId: actor.id, action: "user.two_factor_reset", target: id });
  revalidate();
  return { ok: true };
}
