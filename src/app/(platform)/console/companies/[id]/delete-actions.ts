"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { previewDeletion, purgeCompany, requestDeletion, type DeletionPreview } from "@/lib/platform/console/delete-company";

/** Only a Platform Owner (all permissions) may delete a company. */
async function owner() {
  const auth = await checkPlatformPermission("companies.manage");
  if (!auth.ok) return auth;
  if (!auth.user.platform.permissions.includes("*")) return { ok: false as const, error: "Only a Platform Owner can delete a company." };
  return auth;
}

/** Step 1: what would be deleted, plus a one-time confirmation token for the final step. */
export async function startCompanyDeletionAction(companyId: string): Promise<({ ok: true; token: string } & DeletionPreview) | { ok: false; error: string }> {
  const auth = await owner();
  if (!auth.ok) return auth;
  const id = String(companyId);
  const preview = await previewDeletion(id);
  if (!preview.ok) return preview;
  const req = await requestDeletion(id, auth.user.id);
  if (!req.ok) return req;
  await recordPlatformAudit({ actorId: auth.user.id, action: "company.delete.start", target: { type: "company", id }, companyId: id, details: { name: preview.name } });
  return { ...preview, token: req.token };
}

/** Final step: deletes everything, for good. */
export async function deleteCompanyAction(input: { companyId: string; token: string; typedName: string; phrase: string }): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const auth = await owner();
  if (!auth.ok) return auth;
  const id = String(input.companyId);
  const before = await previewDeletion(id);
  const res = await purgeCompany({ companyId: id, actorId: auth.user.id, token: String(input.token), typedName: String(input.typedName), phrase: String(input.phrase) });
  if (!res.ok) return res;
  await recordPlatformAudit({
    actorId: auth.user.id,
    action: "company.delete",
    target: { type: "company", id },
    companyId: id,
    details: { name: before.ok ? before.name : null, slug: before.ok ? before.slug : null, domainsRemoved: res.domainsRemoved, filesRemoved: res.filesRemoved, rowsRemoved: res.rowsRemoved },
  });
  revalidatePath("/console", "layout");
  return { ok: true, summary: `Deleted ${res.rowsRemoved} records, ${res.filesRemoved} files and ${res.domainsRemoved.length} domains.` };
}
