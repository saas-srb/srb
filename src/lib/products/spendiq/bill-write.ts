import "server-only";
import { postingBlocked } from "@/lib/products/cashflow-ai/accrual/posting";
import { findExistingBill } from "@/lib/products/cashflow-ai/hygiene";
import { createInvoice, updateInvoice, setInvoiceStatus, deleteInvoice, getInvoice, type InvoiceWriteData } from "@/lib/products/spendiq/invoices";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { getPurchaseOrderByNumber } from "@/lib/products/spendiq/purchase-orders";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { isValidInvoiceStatus, type InvoiceStatus } from "@/lib/products/spendiq/constants";
import { sectionMap } from "@/lib/products/cashflow-ai/tds/store";
import { financialYearOf } from "@/lib/products/cashflow-ai/tds/core";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { resolveBillSection } from "@/lib/products/cashflow-ai/tds/section-input";
import { saveAttachmentFile, isAllowedAttachment } from "@/lib/products/spendiq/attachment-storage";
import type { RecordActor, RecordWriteResult } from "@/lib/products/shared/record-write";

/**
 * A vendor bill's life (enter, attach the file, approve or reject, delete): validation, the books' period lock, the
 * duplicate check and the audit record. The caller has already checked that `actor` may.
 */
export async function saveBillRecord(user: RecordActor, input: Record<string, unknown>, id?: string): Promise<RecordWriteResult> {
  const vendorId = String(input.vendorId ?? "");
  const vendor = vendorId ? await getVendor(vendorId) : null;
  if (!vendor) return { ok: false, fieldErrors: { vendorId: "Select a vendor." } };

  const invoiceDate = String(input.invoiceDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return { ok: false, fieldErrors: { invoiceDate: "Enter a valid date." } };
  const subtotal = Number(input.subtotal);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return { ok: false, fieldErrors: { subtotal: "Enter the taxable amount." } };

  // TDS is optional; when a section is named it must be on the list the form offers (this year's rulebook, less what the company switched off) (a bill may keep an old, since switched-off one).
  const before = id ? await getInvoice(id) : null;
  if (id && !before) return { ok: false, error: "Invoice not found." };
  const section = resolveBillSection(input.tdsSection, [...(await sectionMap(financialYearOf(istToday()))).values()], before?.tdsSection ?? null);
  if (!section.ok) return { ok: false, fieldErrors: { tdsSection: section.error } };

  let poId: string | null = null;
  let poNumber: string | null = null;
  const poRef = String(input.poNumber ?? "").trim();
  if (poRef) {
    const po = await getPurchaseOrderByNumber(poRef);
    if (po) {
      poId = po._id;
      poNumber = po.poNumber;
    }
  }

  const tdsRateInput = input.tdsRate === undefined || input.tdsRate === "" ? 0 : Number(input.tdsRate);
  if (!Number.isFinite(tdsRateInput) || tdsRateInput < 0 || tdsRateInput > 100) return { ok: false, fieldErrors: { tdsRate: "TDS % must be between 0 and 100." } };

  const data: InvoiceWriteData = {
    vendorId,
    vendorName: vendor.companyName,
    vendorInvoiceNumber: (input.vendorInvoiceNumber as string)?.trim() || null,
    poId,
    poNumber,
    invoiceDate,
    dueDate: (input.dueDate as string) || null,
    subtotal,
    gstAmount: Number(input.gstAmount) || 0,
    tdsRate: tdsRateInput,
    tdsSection: section.value,
    currency: String(input.currency ?? vendor.currency ?? "INR"),
    notes: (input.notes as string)?.trim() || null,
  };

  const blocked = await postingBlocked(invoiceDate);
  if (blocked) return { ok: false, fieldErrors: { invoiceDate: blocked } };

  // The same vendor bill must not be entered twice: it would be paid twice and its GST claimed twice.
  const existingBill = await findExistingBill(vendorId, data.vendorInvoiceNumber, id);
  if (existingBill) {
    return { ok: false, fieldErrors: { vendorInvoiceNumber: `This vendor invoice number is already entered as ${existingBill.invoiceNumber}.` } };
  }

  if (id) {
    if (!before) return { ok: false, error: "Invoice not found." };
    const res = await updateInvoice(id, data, user.id);
    if (!res.ok) return { ok: false, error: res.reason };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "invoice", entityId: id, entityLabel: before.invoiceNumber });
    return { ok: true, id };
  }
  const created = await createInvoice(data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "invoice",
    entityId: created._id,
    entityLabel: created.invoiceNumber,
    summary: `${created.poMatched ? "PO-matched" : "no PO match"} · ${created.grnMatched ? "GRN-matched" : "no GRN"}`,
  });
  return { ok: true, id: created._id };
}

export async function attachBillFile(user: RecordActor, id: string, formData: FormData): Promise<RecordWriteResult> {
  const before = await getInvoice(id);
  if (!before) return { ok: false, error: "Invoice not found." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  const check = isAllowedAttachment(file);
  if (!check.ok) return { ok: false, error: check.error };
  const stored = await saveAttachmentFile(file);
  await updateInvoice(
    id,
    {
      vendorId: before.vendorId,
      vendorName: before.vendorName,
      vendorInvoiceNumber: before.vendorInvoiceNumber,
      poId: before.poId,
      poNumber: before.poNumber,
      invoiceDate: before.invoiceDate,
      dueDate: before.dueDate,
      subtotal: before.subtotal,
      gstAmount: before.gstAmount,
      tdsRate: before.tdsRate,
      currency: before.currency,
      notes: before.notes,
      storageKey: stored.storageKey,
      filename: stored.filename,
    },
    user.id
  );
  return { ok: true, id };
}

export async function decideBill(user: RecordActor, id: string, status: string): Promise<RecordWriteResult> {
  if (!isValidInvoiceStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getInvoice(id);
  const set = await setInvoiceStatus(id, status as InvoiceStatus, user.id);
  // The books refused the change (a locked period): say so instead of reporting success.
  if (!set.ok && set.reason) return { ok: false, error: set.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "status_change", entity: "invoice", entityId: id, entityLabel: before?.invoiceNumber, summary: `status → ${status}` });
  return { ok: true, id };
}

export async function deleteBill(user: RecordActor, id: string): Promise<RecordWriteResult> {
  const before = await getInvoice(id);
  const res = await deleteInvoice(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "invoice", entityId: id, entityLabel: before?.invoiceNumber });
  return { ok: true };
}
