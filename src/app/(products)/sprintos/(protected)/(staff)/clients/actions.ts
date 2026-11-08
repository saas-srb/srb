"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageClients } from "@/lib/pms-roles";
import { createClient, updateClient, deleteClient, getClient } from "@/lib/products/sprintos/clients";
import { validateClient } from "@/lib/products/sprintos/validation";
import { recordActivity, diffSummary } from "@/lib/products/sprintos/activity";

export interface ClientActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageClients(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/sprintos/clients");
  revalidatePath("/sprintos");
  if (id) revalidatePath(`/sprintos/clients/${id}`);
}

export async function saveClientAction(
  input: Record<string, unknown>,
  id?: string
): Promise<ClientActionResult> {
  const user = await requireManage();
  const v = validateClient(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const before = await getClient(id);
    if (!before) return { ok: false, error: "Client not found." };
    const updated = await updateClient(id, v.data, user.id);
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
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

  const created = await createClient(v.data, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "client",
    entityId: created._id,
    entityLabel: v.data.companyName,
  });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function deleteClientAction(id: string): Promise<ClientActionResult> {
  const user = await requireManage();
  const before = await getClient(id);
  const result = await deleteClient(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete client." };
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "client",
    entityId: id,
    entityLabel: before?.companyName ?? null,
  });
  revalidate(id);
  return { ok: true };
}

export async function setClientDoNotContactAction(clientId: string, value: boolean): Promise<{ error?: string }> {
  const user = await getCurrentPmsUser();
  if (!user || !canManageClients(user)) return { error: "You don't have permission to change this." };
  if (typeof clientId !== "string" || typeof value !== "boolean") return { error: "Invalid request." };
  const { setClientDoNotContact } = await import("@/lib/products/sprintos/calls");
  if (!(await setClientDoNotContact(clientId, value))) return { error: "Client not found." };
  revalidate(clientId);
  return {};
}
