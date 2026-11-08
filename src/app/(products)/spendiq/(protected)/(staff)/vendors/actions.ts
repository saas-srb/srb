"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { createVendor, updateVendor, deleteVendor, getVendor } from "@/lib/products/spendiq/vendors";
import { validateVendor } from "@/lib/products/spendiq/validation";
import { recordAudit, diffSummary } from "@/lib/products/spendiq/audit";

export interface VendorActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageProcurement(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/spendiq/vendors");
  revalidatePath("/spendiq");
  if (id) revalidatePath(`/spendiq/vendors/${id}`);
}

export async function saveVendorAction(
  input: Record<string, unknown>,
  id?: string
): Promise<VendorActionResult> {
  const user = await requireManage();
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
    revalidate(id);
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
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function deleteVendorAction(id: string): Promise<VendorActionResult> {
  const user = await requireManage();
  const before = await getVendor(id);
  const result = await deleteVendor(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete vendor." };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "vendor",
    entityId: id,
    entityLabel: before?.companyName ?? null,
  });
  revalidate(id);
  return { ok: true };
}
