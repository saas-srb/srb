"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canApproveRequisitions, hasPrmsStaffRole } from "@/lib/prms-roles";
import {
  createRequisition,
  updateRequisition,
  submitRequisition,
  decideRequisition,
  deleteRequisition,
  getRequisition,
  addRequisitionAttachment,
  removeRequisitionAttachment,
} from "@/lib/products/spendiq/requisitions";
import { validateRequisition } from "@/lib/products/spendiq/validation";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { notify, notifyStaff } from "@/lib/products/spendiq/notifications";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import { saveAttachmentFile, deleteAttachmentFile, isAllowedAttachment } from "@/lib/products/spendiq/attachment-storage";

export interface RequisitionActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : email;
}

function revalidate(id?: string) {
  revalidatePath("/spendiq/requisitions");
  revalidatePath("/spendiq/me/requisitions");
  revalidatePath("/spendiq");
  if (id) {
    revalidatePath(`/spendiq/requisitions/${id}`);
    revalidatePath(`/spendiq/me/requisitions/${id}`);
  }
}

export async function saveRequisitionAction(
  input: Record<string, unknown>,
  id?: string
): Promise<RequisitionActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");

  const v = validateRequisition(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const before = await getRequisition(id);
    if (!before) return { ok: false, error: "Requisition not found." };
    if (before.requestedBy.userId !== user.id && !hasPrmsStaffRole(user.roles)) {
      throw new Error("Forbidden");
    }
    const res = await updateRequisition(id, v.data, user.id);
    if (!res.ok) return { ok: false, error: res.reason };
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "requisition",
      entityId: id,
      entityLabel: v.data.itemName,
    });
    revalidate(id);
    return { ok: true, id };
  }

  const created = await createRequisition(
    v.data,
    { userId: user.id, employeeId: user.employeeId, name: nameFromEmail(user.email), email: user.email },
    user.id
  );
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "requisition",
    entityId: created._id,
    entityLabel: created.prCode,
  });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function submitRequisitionAction(id: string): Promise<RequisitionActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  const before = await getRequisition(id);
  if (!before) return { ok: false, error: "Requisition not found." };
  if (before.requestedBy.userId !== user.id && !hasPrmsStaffRole(user.roles)) throw new Error("Forbidden");

  const res = await submitRequisition(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "submit",
    entity: "requisition",
    entityId: id,
    entityLabel: before.prCode,
    summary: `status: draft → ${res.doc?.status ?? "submitted"}`,
  });
  await notifyStaff(
    {
      type: "requisition_submitted",
      title: `Requisition ${before.prCode} awaiting approval`,
      body: `${before.itemName} · ${before.currency} ${before.estimatedCost.toLocaleString("en-IN")}`,
      link: `/spendiq/requisitions/${id}`,
      dedupeKey: `requisition_submitted:${id}`,
    },
    ["super_admin", "prms_admin", "procurement_manager", "dept_manager"]
  );
  revalidate(id);
  return { ok: true, id };
}

export async function decideRequisitionAction(
  id: string,
  approve: boolean,
  note: string
): Promise<RequisitionActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canApproveRequisitions(user)) throw new Error("Forbidden");

  const before = await getRequisition(id);
  if (!before) return { ok: false, error: "Requisition not found." };

  const res = await decideRequisition(id, approve, note || null, {
    id: user.id,
    email: user.email,
    roles: user.roles,
    permissionOverrides: user.permissionOverrides,
  });
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: approve ? "approve" : "reject",
    entity: "requisition",
    entityId: id,
    entityLabel: before.prCode,
    summary: `status: ${before.status} → ${res.doc?.status ?? "?"}`,
  });

  await notify({
    recipientUserId: before.requestedBy.userId,
    audience: "employee",
    type: res.rejected ? "requisition_rejected" : res.fullyApproved ? "requisition_approved" : "requisition_progress",
    title: res.rejected
      ? `Requisition ${before.prCode} was rejected`
      : res.fullyApproved
        ? `Requisition ${before.prCode} approved`
        : `Requisition ${before.prCode} advanced`,
    body: note || null,
    link: `/spendiq/me/requisitions/${id}`,
  });

  if (res.fullyApproved) {
    const settings = await getPrmsSettings();
    if (before.estimatedCost >= settings.financeNotifyThreshold) {
      await notifyStaff(
        {
          type: "requisition_high_value_approved",
          title: `High-value requisition ${before.prCode} approved`,
          body: `${before.currency} ${before.estimatedCost.toLocaleString("en-IN")} · ${before.itemName}`,
          link: `/spendiq/requisitions/${id}`,
          dedupeKey: `requisition_high_value_approved:${id}`,
        },
        ["super_admin", "prms_admin", "finance"]
      );
    }
  }

  revalidate(id);
  return { ok: true, id };
}

export async function deleteRequisitionAction(id: string): Promise<RequisitionActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  const before = await getRequisition(id);
  if (!before) return { ok: false, error: "Requisition not found." };
  if (before.requestedBy.userId !== user.id && !hasPrmsStaffRole(user.roles)) throw new Error("Forbidden");

  const res = await deleteRequisition(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "requisition",
    entityId: id,
    entityLabel: before.prCode,
  });
  revalidate(id);
  return { ok: true };
}

export async function uploadRequisitionAttachmentAction(id: string, formData: FormData): Promise<RequisitionActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  const before = await getRequisition(id);
  if (!before) return { ok: false, error: "Requisition not found." };
  if (before.requestedBy.userId !== user.id && !hasPrmsStaffRole(user.roles)) throw new Error("Forbidden");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  const check = isAllowedAttachment(file);
  if (!check.ok) return { ok: false, error: check.error };

  const stored = await saveAttachmentFile(file);
  await addRequisitionAttachment(id, stored, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "requisition",
    entityId: id,
    entityLabel: before.prCode,
    summary: `attached ${stored.filename}`,
  });
  revalidate(id);
  return { ok: true, id };
}

export async function removeRequisitionAttachmentAction(id: string, storageKey: string): Promise<RequisitionActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  const before = await getRequisition(id);
  if (!before) return { ok: false, error: "Requisition not found." };
  if (before.requestedBy.userId !== user.id && !hasPrmsStaffRole(user.roles)) throw new Error("Forbidden");

  await removeRequisitionAttachment(id, storageKey, user.id);
  await deleteAttachmentFile(storageKey);
  revalidate(id);
  return { ok: true, id };
}
