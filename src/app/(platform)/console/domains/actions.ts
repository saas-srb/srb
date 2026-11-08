"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { DOMAIN_OPS, runPlatformDomainAction, type DomainOp, type PlatformDomainResult } from "@/lib/platform/domains/overview";

/** Re-check, retry attach, remove or set primary — for any company's domain. Audited in the lib. */
export async function platformDomainAction(host: string, op: string): Promise<PlatformDomainResult> {
  const user = await requirePlatformPermission("domains.manage");
  if (!DOMAIN_OPS.includes(op as DomainOp)) return { ok: false, error: "Unknown action." };
  const res = await runPlatformDomainAction(String(host), op as DomainOp, user.id);
  revalidatePath("/console", "layout");
  return res;
}
