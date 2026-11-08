"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { HIDDEN_FROM_COMPANIES, providerByKey } from "@/lib/platform/connections/catalog";
import { disconnectConnection, saveConnection, type SaveResult } from "@/lib/platform/connections/store";
import { testConnection, type TestOutcome } from "@/lib/platform/connections/test";

const NAV_KEY = "company.integrations";

function known(provider: unknown): string | null {
  const key = typeof provider === "string" ? provider : "";
  const p = providerByKey.get(key);
  return p && p.fields.length > 0 && !HIDDEN_FROM_COMPANIES.includes(key) ? key : null;
}

export async function saveConnectionAction(provider: string, values: Record<string, string>): Promise<SaveResult> {
  const user = await requireWorkspaceAction(NAV_KEY);
  const key = known(provider);
  if (!key) return { ok: false, error: "Unknown connection." };
  const res = await saveConnection(key, values && typeof values === "object" ? values : {}, user.id);
  if (res.ok) revalidatePath("/commandos/settings/integrations");
  return res;
}

export async function testConnectionAction(provider: string): Promise<TestOutcome> {
  await requireWorkspaceAction(NAV_KEY);
  const key = known(provider);
  if (!key) return { ok: false, message: "Unknown connection." };
  const out = await testConnection(key);
  revalidatePath("/commandos/settings/integrations");
  return out;
}

export async function disconnectConnectionAction(provider: string): Promise<{ ok: boolean }> {
  await requireWorkspaceAction(NAV_KEY);
  const key = known(provider);
  if (!key) return { ok: false };
  await disconnectConnection(key);
  revalidatePath("/commandos/settings/integrations");
  return { ok: true };
}
