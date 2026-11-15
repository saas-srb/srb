"use server";

import { isDirector } from "@/lib/access/director";
import { checkSeatUsage } from "@/lib/notify/triggers/usage";
import { countSeatsUsed } from "@/lib/platform/billing/enforce";
import { workspaceEvents } from "@/lib/notify/triggers/workspace";
import { revalidatePath } from "next/cache";
import { requestOrigin } from "@/lib/platform/request";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import {
  resetAdminUserPassword,
  setUserTypeAndNotes,
  delegatedManagerBlock,
  type ResetPasswordResult,
} from "@/lib/products/commandos/admin-users";
import { ObjectId } from "mongodb";
import { resetTwoFactor } from "@/lib/security/two-factor";
import { searchActivityLog, type AdminActivityRow } from "@/lib/products/commandos/activity-log";
import { recordAccessAudit } from "@/lib/products/commandos/custom-roles";
import { changeAccountStatus, listStatusHistory, type StatusEventRow } from "@/lib/products/commandos/account-status";
import { isAccountStatus } from "@/lib/security/account-status";
import { createPerson, updatePerson, validateDraft, type PersonValidation, type SaveResult } from "@/lib/products/commandos/people";
import type { PersonDraft } from "@/lib/products/commandos/people-rules";

function revalidate() {
  revalidatePath("/commandos/users");
}

/** Step 2 and step 3 call this to see what a draft would save: the completed access, what is added automatically, refusals and the seat check. */
export async function checkPersonAction(draft: Partial<PersonDraft>, personId?: string): Promise<PersonValidation> {
  await requireWorkspaceAction("company.users");
  return validateDraft(draft ?? {}, personId);
}

/** Creates a person (temporary password shown once, or an email invitation). */
export async function createPersonAction(draft: Partial<PersonDraft>): Promise<SaveResult> {
  const actor = await requireWorkspaceAction("company.users");
  const { origin } = await requestOrigin();
  const res = await createPerson(draft ?? {}, { id: actor.id, email: actor.email, roles: actor.roles }, origin);
  if (res.ok) {
    revalidate();
    await workspaceEvents.userAdded(String(draft?.email ?? "").trim().toLowerCase(), [], actor.id);
    await checkSeatUsage(await countSeatsUsed());
  }
  return res;
}

/** Saves a person's details and access. */
export async function updatePersonAction(id: string, draft: Partial<PersonDraft>): Promise<SaveResult> {
  const actor = await requireWorkspaceAction("company.users");
  const res = await updatePerson(String(id ?? ""), draft ?? {}, { id: actor.id, email: actor.email, roles: actor.roles });
  if (res.ok) {
    revalidate();
    await workspaceEvents.rolesChanged(String(id), [], actor.id);
  }
  return res;
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
  if (!isDirector(actor)) return { ok: false, error: "Only a Director can change a person's status." };
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
  if (!isDirector(actor)) return { changed: 0, skipped: ids.length, firstError: "Only a Director can change a person's status." };
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
  if (!isDirector(actor)) return { ok: false, error: "Only a Director can reset two-step sign-in." };
  if (!ObjectId.isValid(id)) return { ok: false, error: "Unknown user." };
  await resetTwoFactor(new ObjectId(id));
  await recordAccessAudit({ actorId: actor.id, action: "user.two_factor_reset", target: id });
  revalidate();
  return { ok: true };
}

/** A Director handles a request for access: "granted" after giving it on the person's edit page, or "dismissed". The person is told either way. */
export async function resolveAccessRequestAction(id: string, status: "granted" | "dismissed"): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireWorkspaceAction("company.users");
  if (status !== "granted" && status !== "dismissed") return { ok: false, error: "Unknown choice." };
  const { resolveAccessRequest } = await import("@/lib/products/commandos/access-requests");
  const r = await resolveAccessRequest(String(id ?? ""), status, actor.id);
  if (r.ok) revalidate();
  return r.ok ? { ok: true } : { ok: false, error: "That request was already handled." };
}
