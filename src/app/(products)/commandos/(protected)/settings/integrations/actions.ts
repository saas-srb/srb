"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { HIDDEN_FROM_COMPANIES, providerByKey, canUseSrb } from "@/lib/platform/connections/catalog";
import { disconnectConnection, saveConnection, setConnectionMode, type ConnectionMode, type SaveResult } from "@/lib/platform/connections/store";
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

/** Whose account a connection uses: SelfRun's (the default) or the company's own keys. Saved keys are never lost by switching. */
export async function setConnectionModeAction(provider: string, mode: ConnectionMode): Promise<{ ok: boolean; error?: string }> {
  const user = await requireWorkspaceAction(NAV_KEY);
  const key = providerByKey.get(typeof provider === "string" ? provider : "");
  if (!key || key.fields.length === 0 || HIDDEN_FROM_COMPANIES.includes(key.key)) return { ok: false, error: "Unknown connection." };
  if (mode !== "srb" && mode !== "own") return { ok: false, error: "Unknown choice." };
  if (mode === "srb" && !canUseSrb(key.key)) return { ok: false, error: "SelfRun does not provide this service. Connect your own account." };
  const r = await setConnectionMode(key.key, mode, user.id);
  if (!r.ok) return { ok: false, error: "Save your own keys first." };
  revalidatePath("/commandos/settings/integrations");
  return { ok: true };
}
