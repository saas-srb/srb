import "server-only";
import { createVendor, updateVendor, getVendor } from "@/lib/products/spendiq/vendors";
import { validateVendor } from "@/lib/products/spendiq/validation";
import { recordAudit, diffSummary } from "@/lib/products/spendiq/audit";
import type { RecordActor, RecordWriteResult } from "@/lib/products/shared/record-write";

/** Adds or changes a vendor (validation and audit). The caller has already checked that `actor` may. */
export async function saveVendorRecord(user: RecordActor, input: Record<string, unknown>, id?: string): Promise<RecordWriteResult> {
  const v = validateVendor(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const before = await getVendor(id);
    if (!before) return { ok: false, error: "Vendor not found." };
    const updated = await updateVendor(id, v.data, user.id);
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "vendor",
      entityId: id,
      entityLabel: v.data.companyName,
      summary: diffSummary(
        { name: before.companyName, status: before.status, category: before.category, rating: before.rating },
        { name: v.data.companyName, status: v.data.status, category: v.data.category, rating: v.data.rating },
        ["name", "status", "category", "rating"]
      ),
    });
    return { ok: true, id: updated?._id };
  }

  const created = await createVendor(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "vendor",
    entityId: created._id,
    entityLabel: v.data.companyName,
  });
  return { ok: true, id: created._id };
}
