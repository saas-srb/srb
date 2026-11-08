"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { setRfqStatus, deleteRfq, getRfq } from "@/lib/products/spendiq/rfqs";
import { isValidRfqStatus } from "@/lib/products/spendiq/constants";
import { recordAudit, diffSummary } from "@/lib/products/spendiq/audit";

/**
 * Only the pre-award statuses (draft/sent/quoted/cancelled) are settable
 * here — "awarded" has real side effects (`awardRfq` generates a draft PO
 * and stamps `awardedVendorId`/`awardedPoId`) that a plain status write
 * would not replicate, so awarding stays on the RFQ's own PRMS page, same
 * judgment as Requisitions' approval workflow.
 */
const ADMIN_SETTABLE_STATUSES = ["draft", "sent", "quoted", "cancelled"] as const;

function revalidate() {
  revalidatePath("/commandos/prms/rfqs");
}

export async function updateRfqStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.rfqs");
  if (!isValidRfqStatus(status) || !(ADMIN_SETTABLE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "That status can only be set by awarding the RFQ in SpendIQ." };
  }
  const before = await getRfq(id);
  if (!before) return { ok: false, error: "RFQ not found." };
  if (before.status === "awarded") return { ok: false, error: "An awarded RFQ's status can't be changed here." };
  const result = await setRfqStatus(id, status, admin.id);
  if (result.ok) {
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "status_change",
      entity: "rfq",
      entityId: id,
      entityLabel: before.rfqCode,
      summary: diffSummary({ status: before.status }, { status }, ["status"]),
    });
  }
  revalidate();
  return result.ok ? { ok: true } : { ok: false, error: "Could not update status." };
}

export async function deleteRfqAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.rfqs");
  const before = await getRfq(id);
  const result = await deleteRfq(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete RFQ." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "rfq",
    entityId: id,
    entityLabel: before?.rfqCode ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkDeleteRfqsAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.prms.rfqs");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getRfq(id);
    const result = await deleteRfq(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "rfq",
        entityId: id,
        entityLabel: before?.rfqCode ?? null,
      });
    } else {
      skipped.push(before?.rfqCode ?? id);
    }
  }
  revalidate();
  return { deleted, skipped };
}
