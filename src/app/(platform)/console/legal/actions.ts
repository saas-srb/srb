"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { saveLegalProfile, type LegalInput, type LegalSaveResult } from "@/lib/platform/saas/legal-profile";

export async function saveLegalProfileAction(input: LegalInput): Promise<LegalSaveResult> {
  const auth = await checkPlatformPermission("settings.manage");
  if (!auth.ok) return { ok: false, errors: { form: auth.error } };
  const res = await saveLegalProfile(input, { id: auth.user.id, email: auth.user.email });
  if (res.ok) {
    for (const path of ["/console/legal", "/terms", "/privacy", "/refund-policy", "/cookies", "/data-policy", "/dpa", "/subprocessors", "/data-requests", "/grievance"]) revalidatePath(path);
  }
  return res;
}
