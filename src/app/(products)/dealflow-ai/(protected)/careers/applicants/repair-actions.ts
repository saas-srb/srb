"use server";

import { revalidatePath } from "next/cache";
import { requireLms } from "@/lib/lms-auth";
import { repairPortalAccounts, type RepairResult } from "@/lib/products/clientos/repair";

/** Staff: put back the portal accounts of everyone already on file (leads / applications) who can't sign in. */
export async function repairPortalAccountsAction(): Promise<{ ok: true; result: RepairResult } | { ok: false; error: string }> {
  const user = await requireLms("MANAGE_CAREERS");
  if (!user) return { ok: false, error: "Unauthorized" };
  try {
    const result = await repairPortalAccounts();
    revalidatePath("/dealflow-ai/careers/applicants");
    return { ok: true, result };
  } catch (err) {
    console.error("[portal-repair] failed", err);
    return { ok: false, error: "Could not restore the accounts. Try again." };
  }
}
