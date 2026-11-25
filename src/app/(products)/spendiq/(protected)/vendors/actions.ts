"use server";

import { revalidatePath } from "next/cache";
import { saveVendorRecord } from "@/lib/products/spendiq/vendor-write";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { prmsCan } from "@/lib/prms-access";
import { deleteVendor, getVendor } from "@/lib/products/spendiq/vendors";
import { recordAudit } from "@/lib/products/spendiq/audit";

export interface VendorActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!prmsCan(user, "vendors.manage")) throw new Error("Forbidden");
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
  const result = await saveVendorRecord(user, input, id);
  if (result.ok) revalidate(result.id);
  return result;
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
