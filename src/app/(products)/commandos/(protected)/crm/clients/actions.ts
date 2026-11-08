"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { createClient, updateClient, deleteClient, getClient } from "@/lib/products/sprintos/clients";
import { validateClient } from "@/lib/products/sprintos/validation";
import { recordActivity, diffSummary, listActivity, serializeActivityLog, type SerializedActivityLog } from "@/lib/products/sprintos/activity";
import { isValidClientStatus } from "@/lib/products/sprintos/constants";

export interface ClientActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(id?: string) {
  revalidatePath("/commandos/crm/clients");
  if (id) revalidatePath(`/commandos/crm/clients/${id}`);
}

export async function saveClientAction(input: Record<string, unknown>, id?: string): Promise<ClientActionResult> {
  const admin = await requireWorkspaceAction("manage.crm.clients");
  const v = validateClient(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const before = await getClient(id);
    if (!before) return { ok: false, error: "Client not found." };
    const updated = await updateClient(id, v.data, admin.id);
    await recordActivity({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "update",
      entity: "client",
      entityId: id,
      entityLabel: v.data.companyName,
      summary: diffSummary(
        { name: before.companyName, status: before.status, industry: before.industry },
        { name: v.data.companyName, status: v.data.status, industry: v.data.industry },
        ["name", "status", "industry"]
      ),
    });
    revalidate(id);
    return { ok: true, id: updated?._id };
  }

  const created = await createClient(v.data, admin.id);
  await recordActivity({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "create",
    entity: "client",
    entityId: created._id,
    entityLabel: v.data.companyName,
  });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function updateClientStatusAction(id: string, status: string): Promise<ClientActionResult> {
  const admin = await requireWorkspaceAction("manage.crm.clients");
  if (!isValidClientStatus(status)) return { ok: false, error: "Unknown status." };

  const before = await getClient(id);
  if (!before) return { ok: false, error: "Client not found." };
  const updated = await updateClient(id, { status }, admin.id);
  await recordActivity({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "client",
    entityId: id,
    entityLabel: before.companyName,
    summary: diffSummary({ status: before.status }, { status }, ["status"]),
  });
  revalidate(id);
  return { ok: updated !== null };
}

export async function deleteClientAction(id: string): Promise<ClientActionResult> {
  const admin = await requireWorkspaceAction("manage.crm.clients");
  const before = await getClient(id);
  const result = await deleteClient(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete client." };
  await recordActivity({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "client",
    entityId: id,
    entityLabel: before?.companyName ?? null,
  });
  revalidate(id);
  return { ok: true };
}

export async function bulkUpdateClientStatusAction(ids: string[], status: string): Promise<{ updated: number; error?: string }> {
  const admin = await requireWorkspaceAction("manage.crm.clients");
  if (!isValidClientStatus(status)) return { updated: 0, error: "Unknown status." };

  let updated = 0;
  for (const id of ids) {
    const before = await getClient(id);
    if (!before) continue;
    const result = await updateClient(id, { status }, admin.id);
    if (result) {
      updated += 1;
      await recordActivity({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "client",
        entityId: id,
        entityLabel: before.companyName,
        summary: diffSummary({ status: before.status }, { status }, ["status"]),
      });
    }
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteClientsAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.crm.clients");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getClient(id);
    const result = await deleteClient(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordActivity({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "client",
        entityId: id,
        entityLabel: before?.companyName ?? null,
      });
    } else {
      skipped.push(before?.companyName ?? id);
    }
  }
  revalidate();
  return { deleted, skipped };
}

export async function getClientActivityAction(id: string): Promise<SerializedActivityLog[]> {
  await requireWorkspaceAction("manage.crm.clients");
  const { items } = await listActivity({ entity: "client", entityId: id, pageSize: 50 });
  return items.map(serializeActivityLog);
}
