"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { setInvoiceStatus, deleteInvoice, getInvoice } from "@/lib/products/spendiq/invoices";
import { isValidInvoiceStatus } from "@/lib/products/spendiq/constants";
import { recordAudit, diffSummary } from "@/lib/products/spendiq/audit";

function revalidate() {
  revalidatePath("/commandos/prms/invoices");
}

export async function updateInvoiceStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.invoices");
  if (!isValidInvoiceStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getInvoice(id);
  if (!before) return { ok: false, error: "Invoice not found." };
  const result = await setInvoiceStatus(id, status, admin.id);
  if (result.ok) {
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "status_change",
      entity: "invoice",
      entityId: id,
      entityLabel: before.invoiceNumber,
      summary: diffSummary({ status: before.status }, { status }, ["status"]),
    });
  }
  revalidate();
  return result.ok ? { ok: true } : { ok: false, error: "Could not update status." };
}

export async function deleteInvoiceAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.invoices");
  const before = await getInvoice(id);
  const result = await deleteInvoice(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete invoice." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "invoice",
    entityId: id,
    entityLabel: before?.invoiceNumber ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkUpdateInvoiceStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.prms.invoices");
  if (!isValidInvoiceStatus(status)) return { updated: 0 };
  let updated = 0;
  for (const id of ids) {
    const before = await getInvoice(id);
    if (!before) continue;
    const result = await setInvoiceStatus(id, status, admin.id);
    if (result.ok) {
      updated += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "invoice",
        entityId: id,
        entityLabel: before.invoiceNumber,
        summary: diffSummary({ status: before.status }, { status }, ["status"]),
      });
    }
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteInvoicesAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.prms.invoices");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getInvoice(id);
    const result = await deleteInvoice(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "invoice",
        entityId: id,
        entityLabel: before?.invoiceNumber ?? null,
      });
    } else {
      skipped.push(before?.invoiceNumber ?? id);
    }
  }
  revalidate();
  return { deleted, skipped };
}
