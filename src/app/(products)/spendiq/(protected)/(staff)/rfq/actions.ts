"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import {
  createRfq,
  updateRfq,
  setRfqStatus,
  addQuotation,
  awardRfq,
  deleteRfq,
  getRfq,
  createRfqFromRequisition,
  type RfqLine,
} from "@/lib/products/spendiq/rfqs";
import { recordAudit } from "@/lib/products/spendiq/audit";

export interface RfqActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  poId?: string;
}

async function requireManage() {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageProcurement(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/spendiq/rfq");
  revalidatePath("/spendiq");
  if (id) revalidatePath(`/spendiq/rfq/${id}`);
}

function parseLines(raw: unknown): RfqLine[] {
  if (!Array.isArray(raw)) return [];
  return (raw as { description?: string; quantity?: unknown; uom?: string }[])
    .map((l) => ({
      description: String(l.description ?? "").trim(),
      quantity: Number(l.quantity) || 0,
      uom: String(l.uom ?? "pcs"),
    }))
    .filter((l) => l.description && l.quantity > 0);
}

export async function saveRfqAction(input: Record<string, unknown>, id?: string): Promise<RfqActionResult> {
  const user = await requireManage();
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false, fieldErrors: { title: "Title is required." } };
  const lines = parseLines(input.lines);
  if (lines.length === 0) return { ok: false, fieldErrors: { lines: "Add at least one line." } };
  const vendorIds = Array.isArray(input.vendorIds) ? (input.vendorIds as string[]).filter(Boolean) : [];

  const payload = {
    title,
    description: (input.description as string)?.trim() || null,
    requisitionId: (input.requisitionId as string) || null,
    departmentId: (input.departmentId as string) || null,
    departmentName: (input.departmentName as string) || null,
    lines,
    vendorIds,
  };

  if (id) {
    const res = await updateRfq(id, payload, user.id);
    if (!res.ok) return { ok: false, error: res.reason };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "rfq", entityId: id, entityLabel: title });
    revalidate(id);
    return { ok: true, id };
  }
  const created = await createRfq(payload, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "rfq", entityId: created._id, entityLabel: created.rfqCode });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function createRfqFromRequisitionAction(requisitionId: string, vendorIds: string[]): Promise<RfqActionResult> {
  const user = await requireManage();
  const rfq = await createRfqFromRequisition(requisitionId, vendorIds, user.id);
  if (!rfq) return { ok: false, error: "Requisition not found." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "rfq", entityId: rfq._id, entityLabel: rfq.rfqCode, summary: "from requisition" });
  revalidate(rfq._id);
  return { ok: true, id: rfq._id };
}

export async function sendRfqAction(id: string): Promise<RfqActionResult> {
  const user = await requireManage();
  const before = await getRfq(id);
  await setRfqStatus(id, "sent", user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "status_change", entity: "rfq", entityId: id, entityLabel: before?.rfqCode, summary: "marked sent to vendors" });
  revalidate(id);
  return { ok: true, id };
}

export async function addQuotationAction(rfqId: string, input: Record<string, unknown>): Promise<RfqActionResult> {
  const user = await requireManage();
  const rfq = await getRfq(rfqId);
  if (!rfq) return { ok: false, error: "RFQ not found." };
  const unitPrices = rfq.lines.map((_, i) => Number((input.unitPrices as unknown[])?.[i]) || 0);
  const res = await addQuotation(
    rfqId,
    {
      vendorId: String(input.vendorId ?? ""),
      unitPrices,
      deliveryDays: input.deliveryDays ? Number(input.deliveryDays) : null,
      paymentTerms: (input.paymentTerms as string) || null,
      technicalScore: input.technicalScore ? Number(input.technicalScore) : null,
      notes: (input.notes as string)?.trim() || null,
    },
    user.id
  );
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "record", entity: "quotation", entityId: rfqId, entityLabel: rfq.rfqCode });
  revalidate(rfqId);
  return { ok: true, id: rfqId };
}

export async function awardRfqAction(rfqId: string, vendorId: string): Promise<RfqActionResult> {
  const user = await requireManage();
  const rfq = await getRfq(rfqId);
  const res = await awardRfq(rfqId, vendorId, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "convert", entity: "rfq", entityId: rfqId, entityLabel: rfq?.rfqCode, summary: `awarded → PO ${res.poId}` });
  revalidate(rfqId);
  return { ok: true, id: rfqId, poId: res.poId };
}

export async function deleteRfqAction(id: string): Promise<RfqActionResult> {
  const user = await requireManage();
  const before = await getRfq(id);
  const res = await deleteRfq(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "rfq", entityId: id, entityLabel: before?.rfqCode });
  revalidate();
  return { ok: true };
}
