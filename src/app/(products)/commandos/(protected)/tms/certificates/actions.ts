"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { setCertificateRevoked, deleteCertificate, getCertificate } from "@/lib/products/cohort-ai/certificates";
import { recordAudit } from "@/lib/products/cohort-ai/audit";

function revalidate() {
  revalidatePath("/commandos/tms/certificates");
}

export async function setCertificateRevokedAction(id: string, revoked: boolean): Promise<{ ok: boolean }> {
  const admin = await requireWorkspaceAction("manage.tms.certificates");
  const before = await getCertificate(id);
  const updated = await setCertificateRevoked(id, revoked, revoked ? "Revoked by super admin" : null, admin.id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "certificate",
    entityId: id,
    entityLabel: before?.certificateNumber ?? null,
    summary: revoked ? "revoked" : "reinstated",
  });
  revalidate();
  return { ok: updated !== null };
}

export async function deleteCertificateAction(id: string): Promise<{ ok: boolean }> {
  const admin = await requireWorkspaceAction("manage.tms.certificates");
  const before = await getCertificate(id);
  const ok = await deleteCertificate(id, admin.id);
  if (ok) {
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "delete",
      entity: "certificate",
      entityId: id,
      entityLabel: before?.certificateNumber ?? null,
    });
  }
  revalidate();
  return { ok };
}

export async function bulkSetCertificatesRevokedAction(ids: string[], revoked: boolean): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.tms.certificates");
  let updated = 0;
  for (const id of ids) {
    const result = await setCertificateRevoked(id, revoked, revoked ? "Revoked by super admin" : null, admin.id);
    if (result) updated += 1;
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteCertificatesAction(ids: string[]): Promise<{ deleted: number }> {
  const admin = await requireWorkspaceAction("manage.tms.certificates");
  let deleted = 0;
  for (const id of ids) {
    const ok = await deleteCertificate(id, admin.id);
    if (ok) deleted += 1;
  }
  revalidate();
  return { deleted };
}
