"use server";

import { limitAction } from "@/lib/security/action-limit";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { HIDDEN_FROM_COMPANIES, providerByKey, canUseSrb } from "@/lib/platform/connections/catalog";
import { disconnectConnection, saveConnection, setConnectionMode, type ConnectionMode, type SaveResult } from "@/lib/platform/connections/store";
import { sendTestEmailToMe, testConnection, type TestOutcome } from "@/lib/platform/connections/test";

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
  if (res.ok) await auditConnection("connection.saved", key, user.id, { fields: Object.keys(values ?? {}).filter((k) => !!(values ?? {})[k]).length }); // never the values
  if (res.ok) revalidatePath("/commandos/settings/integrations");
  return res;
}

/** Providers with a card: the ones with fields, and the ones managed on their own page that still have a safe check (payments, storage, webhooks). */
function knownForTest(provider: unknown): string | null {
  const key = typeof provider === "string" ? provider : "";
  const p = providerByKey.get(key);
  return p && p.testable && !HIDDEN_FROM_COMPANIES.includes(key) || key === "webhooks" ? key : null;
}

export async function testConnectionAction(provider: string): Promise<TestOutcome> {
  const who = await requireWorkspaceAction(NAV_KEY);
  // A test calls an outside service: a person can run 20 in ten minutes.
  const slow = await limitAction(who.id, "connection-test", 20, 600);
  if (slow) return { ok: false, message: slow };
  const key = knownForTest(provider);
  if (!key) return { ok: false, message: "Unknown connection." };
  const out = await testConnection(key);
  revalidatePath("/commandos/settings/integrations");
  return out;
}

export async function disconnectConnectionAction(provider: string): Promise<{ ok: boolean }> {
  const who = await requireWorkspaceAction(NAV_KEY);
  const key = known(provider);
  if (!key) return { ok: false };
  await disconnectConnection(key);
  await auditConnection("connection.removed", key, who.id, {});
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
  await auditConnection("connection.mode_changed", key.key, user.id, { mode });
  revalidatePath("/commandos/settings/integrations");
  return { ok: true };
}

/** Sends one test email, through the sending account in use, to the signed-in person only (the address is never taken from the page). */
export async function sendTestEmailAction(): Promise<TestOutcome> {
  const user = await requireWorkspaceAction(NAV_KEY);
  const slow = await limitAction(user.id, "test-email", 5, 600);
  if (slow) return { ok: false, message: slow };
  return sendTestEmailToMe({ email: user.email });
}

/** Every change of a connection is recorded for the platform audit log with the company and the person, and never with a key or a secret. */
async function auditConnection(action: string, provider: string, actorId: string, details: Record<string, string | number>): Promise<void> {
  const { recordPlatformAudit } = await import("@/lib/platform/audit");
  const { currentCompanyId } = await import("@/lib/platform/tenancy/context");
  await recordPlatformAudit({ actorId, action, target: { type: "connection", id: provider }, companyId: await currentCompanyId(), details });
}
