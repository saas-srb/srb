"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getCurrentSopUser } from "@/lib/sop-auth";
import { signOutThisDevice } from "@/lib/security/sessions";
import { sopCan } from "@/lib/sop-roles";
import { requireViewer } from "@/lib/products/playbook-ai/viewer";
import { toAccessDoc } from "@/lib/products/playbook-ai/access";
import { todayIso } from "@/lib/products/playbook-ai/db";
import { recordAudit } from "@/lib/products/playbook-ai/audit";
import {
  archiveSop,
  createSop,
  deleteDraftSop,
  getReadableSop,
  publishSop,
  restoreSop,
  revertDraftToVersion,
  saveSop,
} from "@/lib/products/playbook-ai/sops";
import { acknowledgeSop, assignSop, recordView, remindPending, setChecklistItem, unassignSop, type AssignTargetType } from "@/lib/products/playbook-ai/assignments";
import { resolveFeedback, submitFeedback } from "@/lib/products/playbook-ai/feedback";
import {
  deleteCategory,
  deleteDepartment,
  deleteFunction,
  deleteProcess,
  upsertCategory,
  createDepartment,
  updateDepartment,
  upsertFunction,
  upsertProcess,
} from "@/lib/products/playbook-ai/taxonomy";
import { createTemplate, deleteTemplate, duplicateTemplate, updateTemplate } from "@/lib/products/playbook-ai/templates";
import { updateSettings } from "@/lib/products/playbook-ai/settings";
import { markSopNotificationsRead } from "@/lib/products/playbook-ai/notifications";
import type { SopViewer } from "@/lib/products/playbook-ai/types";
import { writeBlockReason } from "@/lib/platform/billing/enforce";

/**
 * Every SOP mutation. Each action resolves the viewer from the SESSION COOKIE
 * (never from arguments), re-checks capability + object scope in the lib layer
 * (`access.ts`), and returns `{ ok:false, error }` for expected failures — the
 * client can render the message directly. Nothing here trusts what the UI hid.
 */

type Fail = { ok: false; error: string };
const SESSION_EXPIRED: Fail = { ok: false, error: "Your session has expired — please sign in again." };
const NO_ACCESS: Fail = { ok: false, error: "SOP not found." };

async function run<T>(fn: (v: SopViewer) => Promise<T>): Promise<T | Fail> {
  let v: SopViewer;
  try {
    v = await requireViewer();
  } catch {
    return SESSION_EXPIRED;
  }
  try {
    return await fn(v);
  } catch (err) {
    console.error("[sop action]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function refresh() {
  revalidatePath("/playbook-ai", "layout");
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const strArr = (v: unknown, max = 500) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);

/** Logs out of EVERY product (single sign-off), like every other product. */
export async function sopLogoutAction(): Promise<void> {
  const user = await getCurrentSopUser();
  if (user && ObjectId.isValid(user.id)) await signOutThisDevice(new ObjectId(user.id));
  redirect("/commandos/login");
}

// --- SOP lifecycle ----------------------------------------------------------

export async function createSopAction(input: { title: string; departmentId: string; templateId?: string | null; functionId?: string | null; processId?: string | null; categoryId?: string | null }) {
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false as const, error: readOnly };
  return run(async (v) => {
    const res = await createSop(v, {
      title: str(input?.title),
      departmentId: str(input?.departmentId, 64),
      templateId: str(input?.templateId, 64) || null,
      functionId: str(input?.functionId, 64) || null,
      processId: str(input?.processId, 64) || null,
      categoryId: str(input?.categoryId, 64) || null,
    });
    if (res.ok) refresh();
    return res;
  });
}

export async function saveSopAction(id: string, input: { baseUpdatedAt: string; meta: unknown; content: unknown }) {
  return run(async (v) => {
    const res = await saveSop(v, str(id, 64), { baseUpdatedAt: str(input?.baseUpdatedAt, 40), meta: input?.meta, content: input?.content });
    if (res.ok) refresh();
    return res;
  });
}

export async function publishSopAction(id: string, input: { changeType: "minor" | "major"; changeSummary: string; requireReack: boolean; reackDueDate?: string | null }) {
  return run(async (v) => {
    const res = await publishSop(v, str(id, 64), {
      changeType: input?.changeType === "major" ? "major" : "minor",
      changeSummary: str(input?.changeSummary, 1000),
      requireReack: !!input?.requireReack,
      reackDueDate: input?.reackDueDate ? str(input.reackDueDate, 10) : null,
    });
    if (res.ok) refresh();
    return res;
  });
}

export async function archiveSopAction(id: string) {
  return run(async (v) => {
    const res = await archiveSop(v, str(id, 64));
    if (res.ok) refresh();
    return res;
  });
}

export async function restoreSopAction(id: string) {
  return run(async (v) => {
    const res = await restoreSop(v, str(id, 64));
    if (res.ok) refresh();
    return res;
  });
}

export async function deleteDraftSopAction(id: string) {
  return run(async (v) => {
    const res = await deleteDraftSop(v, str(id, 64));
    if (res.ok) refresh();
    return res;
  });
}

export async function revertToVersionAction(id: string, version: string) {
  return run(async (v) => {
    const res = await revertDraftToVersion(v, str(id, 64), str(version, 20));
    if (res.ok) refresh();
    return res;
  });
}

// --- assignment / acknowledgement -------------------------------------------

export async function assignSopAction(id: string, input: { type: string; ids: string[]; dueDate?: string | null }) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    const type: AssignTargetType = (["user", "team", "department", "role"] as const).find((t) => t === input?.type) ?? "user";
    const res = await assignSop(v, found.doc, { type, ids: strArr(input?.ids), dueDate: input?.dueDate ? str(input.dueDate, 10) : null });
    if (res.ok) refresh();
    return res;
  });
}

export async function unassignSopAction(id: string, userId: string) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    const res = await unassignSop(v, found.doc, str(userId, 64));
    if (res.ok) refresh();
    return res;
  });
}

export async function remindPendingAction(id: string) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    return remindPending(v, found.doc);
  });
}

export async function acknowledgeSopAction(id: string, version: string) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    const res = await acknowledgeSop(v, found.doc, str(version, 20), found.assigned);
    if (res.ok) refresh();
    return res;
  });
}

export async function setChecklistItemAction(id: string, itemKey: string, done: boolean) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    const res = await setChecklistItem(v, found.doc, str(itemKey, 140), !!done, found.assigned);
    if (res.ok) refresh();
    return res;
  });
}

/** Fired from the SOP page after it mounts (not during render, so prefetches never count as views). */
export async function recordViewAction(id: string) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    await recordView(v, found.doc);
    return { ok: true as const };
  });
}

/** Audit entry for a download/print. The file route logs attachment downloads itself. */
export async function recordDownloadAction(id: string, what: string) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    const { canDownloadSop } = await import("@/lib/products/playbook-ai/access");
    if (!canDownloadSop(v, toAccessDoc(found.doc, todayIso()), found.assigned)) return { ok: false as const, error: "Downloads are not allowed for this SOP." };
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "download", entity: "sop", entityId: found.doc._id, entityLabel: `${found.doc.code} · ${found.doc.title}`, summary: `${str(what, 40) || "Printed / saved"} v${found.doc.version ?? ""}` });
    return { ok: true as const };
  });
}

// --- feedback ---------------------------------------------------------------

export async function submitFeedbackAction(id: string, input: { kind: string; message: string }) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    const res = await submitFeedback(v, found.doc, { kind: str(input?.kind, 20), message: str(input?.message, 2100) });
    if (res.ok) refresh();
    return res;
  });
}

export async function resolveFeedbackAction(id: string, feedbackId: string, note: string) {
  return run(async (v) => {
    const found = await getReadableSop(v, str(id, 64));
    if (!found) return NO_ACCESS;
    const res = await resolveFeedback(v, found.doc, str(feedbackId, 64), str(note, 600));
    if (res.ok) refresh();
    return res;
  });
}

// --- structure (departments / functions / processes / categories) ------------

function requireStructure(v: SopViewer): Fail | null {
  return sopCan({ roles: v.roles, permissionOverrides: v.overrides }, "MANAGE_TEMPLATES") ? null : { ok: false, error: "You don't have permission to manage SOP structure." };
}

async function structureAudit(v: SopViewer, entity: "department" | "function" | "process" | "category", id: string, label: string, summary: string) {
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "config", entity, entityId: id, entityLabel: label, summary });
}

export async function saveDepartmentAction(input: { id?: string; name: string; code?: string; description?: string; hrmsDepartmentId?: string | null; active?: boolean }) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = input?.id
      ? await updateDepartment(str(input.id, 64), { name: str(input.name, 80), description: str(input.description, 400), hrmsDepartmentId: input.hrmsDepartmentId === undefined ? undefined : str(input.hrmsDepartmentId, 64) || null, active: input.active }, v.userId)
      : await createDepartment({ name: str(input?.name, 80), code: str(input?.code, 8), description: str(input?.description, 400), hrmsDepartmentId: str(input?.hrmsDepartmentId, 64) || null }, v.userId);
    if (!res.ok) return res;
    await structureAudit(v, "department", res.doc._id, res.doc.name, input?.id ? "Updated department" : "Created department");
    refresh();
    return { ok: true as const };
  });
}

export async function deleteDepartmentAction(id: string) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await deleteDepartment(str(id, 64), v.userId);
    if (!res.ok) return { ok: false as const, error: res.error ?? "Could not delete." };
    await structureAudit(v, "department", id, id, "Deleted department");
    refresh();
    return { ok: true as const };
  });
}

export async function saveFunctionAction(input: { id?: string; departmentId: string; name: string; description?: string; active?: boolean }) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await upsertFunction({ id: str(input?.id, 64) || undefined, departmentId: str(input?.departmentId, 64), name: str(input?.name, 100), description: str(input?.description, 400), active: input?.active }, v.userId);
    if (!res.ok) return res;
    await structureAudit(v, "function", res.doc._id, res.doc.name, input?.id ? "Updated function" : "Created function");
    refresh();
    return { ok: true as const };
  });
}

export async function deleteFunctionAction(id: string) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await deleteFunction(str(id, 64), v.userId);
    if (!res.ok) return { ok: false as const, error: res.error ?? "Could not delete." };
    await structureAudit(v, "function", id, id, "Deleted function");
    refresh();
    return { ok: true as const };
  });
}

export async function saveProcessAction(input: { id?: string; functionId: string; parentId?: string | null; name: string; description?: string; active?: boolean }) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await upsertProcess({ id: str(input?.id, 64) || undefined, functionId: str(input?.functionId, 64), parentId: str(input?.parentId, 64) || null, name: str(input?.name, 120), description: str(input?.description, 400), active: input?.active }, v.userId);
    if (!res.ok) return res;
    await structureAudit(v, "process", res.doc._id, res.doc.name, input?.id ? "Updated process" : `Created ${res.doc.parentId ? "sub-process" : "process"}`);
    refresh();
    return { ok: true as const };
  });
}

export async function deleteProcessAction(id: string) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await deleteProcess(str(id, 64), v.userId);
    if (!res.ok) return { ok: false as const, error: res.error ?? "Could not delete." };
    await structureAudit(v, "process", id, id, "Deleted process");
    refresh();
    return { ok: true as const };
  });
}

export async function saveCategoryAction(input: { id?: string; name: string; color?: string; description?: string; active?: boolean }) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await upsertCategory({ id: str(input?.id, 64) || undefined, name: str(input?.name, 80), color: str(input?.color, 7), description: str(input?.description, 400), active: input?.active }, v.userId);
    if (!res.ok) return res;
    await structureAudit(v, "category", res.doc._id, res.doc.name, input?.id ? "Updated category" : "Created category");
    refresh();
    return { ok: true as const };
  });
}

export async function deleteCategoryAction(id: string) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await deleteCategory(str(id, 64), v.userId);
    if (!res.ok) return { ok: false as const, error: res.error ?? "Could not delete." };
    await structureAudit(v, "category", id, id, "Deleted category");
    refresh();
    return { ok: true as const };
  });
}

// --- templates --------------------------------------------------------------

export async function saveTemplateAction(input: { id?: string; name: string; description?: string; departmentCodes?: string[]; sections: unknown; active?: boolean }) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const payload = { name: input?.name, description: input?.description, departmentCodes: input?.departmentCodes, sections: input?.sections };
    const res = input?.id ? await updateTemplate(str(input.id, 64), { ...payload, active: input.active }, v.userId) : await createTemplate(payload, v.userId);
    if (!res.ok) return res;
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "config", entity: "template", entityId: res.doc._id, entityLabel: res.doc.name, summary: input?.id ? "Updated template" : "Created template" });
    refresh();
    return { ok: true as const, id: res.doc._id };
  });
}

export async function duplicateTemplateAction(id: string) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await duplicateTemplate(str(id, 64), v.userId);
    if (!res.ok) return res;
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "config", entity: "template", entityId: res.doc._id, entityLabel: res.doc.name, summary: "Duplicated template" });
    refresh();
    return { ok: true as const, id: res.doc._id };
  });
}

export async function deleteTemplateAction(id: string) {
  return run(async (v) => {
    const denied = requireStructure(v);
    if (denied) return denied;
    const res = await deleteTemplate(str(id, 64), v.userId);
    if (!res.ok) return { ok: false as const, error: res.error ?? "Could not delete." };
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "config", entity: "template", entityId: id, entityLabel: id, summary: "Deleted template" });
    refresh();
    return { ok: true as const };
  });
}

// --- settings / notifications -------------------------------------------------

export async function updateSettingsAction(input: { expiringSoonDays: number; defaultReviewMonths: number; defaultDueDays: number; reackOnNewVersion: boolean; reminderRepeatDays: number; defaultAllowDownload: boolean }) {
  return run(async (v) => {
    if (!sopCan({ roles: v.roles, permissionOverrides: v.overrides }, "MANAGE_PERMISSIONS")) return { ok: false as const, error: "You don't have permission to change SOP settings." };
    await updateSettings(
      {
        expiringSoonDays: Number(input?.expiringSoonDays),
        defaultReviewMonths: Number(input?.defaultReviewMonths),
        defaultDueDays: Number(input?.defaultDueDays),
        reackOnNewVersion: !!input?.reackOnNewVersion,
        reminderRepeatDays: Number(input?.reminderRepeatDays),
        defaultAllowDownload: !!input?.defaultAllowDownload,
      },
      v.userId
    );
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "settings", entityId: "main", entityLabel: "SOP settings", summary: "Updated SOP settings", metadata: { ...input } });
    refresh();
    return { ok: true as const };
  });
}

export async function markNotificationsReadAction(ids?: string[]) {
  return run(async (v) => {
    await markSopNotificationsRead(v.userId, ids ? strArr(ids, 100) : undefined);
    return { ok: true as const };
  });
}
