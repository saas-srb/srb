"use server";

import { revalidatePath } from "next/cache";
import { saveClientRecord } from "@/lib/products/sprintos/client-write";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { pmsCan, pmsSeesAll } from "@/lib/pms-access";
import { deleteClient, getClient } from "@/lib/products/sprintos/clients";
import { recordActivity } from "@/lib/products/sprintos/activity";

export interface ClientActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!pmsCan(user, "clients.manage")) throw new Error("Forbidden");
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
  const result = await saveClientRecord(user, input, id);
  if (result.ok) revalidate(result.id);
  return result;
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
  if (!user || !pmsCan(user, "clients.manage")) return { error: "You don't have permission to change this." };
  if (typeof clientId !== "string" || typeof value !== "boolean") return { error: "Invalid request." };
  const { setClientDoNotContact } = await import("@/lib/products/sprintos/calls");
  if (!(await setClientDoNotContact(clientId, value))) return { error: "Client not found." };
  revalidate(clientId);
  return {};
}
