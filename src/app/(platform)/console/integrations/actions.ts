"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { saveConfig, type ConfigInput, type SaveConfigResult } from "@/lib/platform/config/store";
import { saveIntegrations, sendIntegrationsTestEmail, testDomainProvider, type IntegrationsInput, type IntegrationsResult, type TestResult } from "@/lib/platform/integrations";

export async function saveIntegrationsAction(input: IntegrationsInput): Promise<IntegrationsResult> {
  const user = await requirePlatformPermission("integrations.manage");
  const str = (v: unknown) => String(v ?? "");
  const res = await saveIntegrations(
    {
      email: { provider: str(input?.email?.provider) as IntegrationsInput["email"]["provider"], apiKey: str(input?.email?.apiKey), clearApiKey: Boolean(input?.email?.clearApiKey), from: str(input?.email?.from) },
      domains: {
        provider: str(input?.domains?.provider) as IntegrationsInput["domains"]["provider"],
        token: str(input?.domains?.token),
        clearToken: Boolean(input?.domains?.clearToken),
        projectId: str(input?.domains?.projectId),
        teamId: str(input?.domains?.teamId),
        rootDomain: str(input?.domains?.rootDomain),
      },
    },
    user.id,
  );
  if (res.ok) revalidatePath("/console", "layout");
  return res;
}

/** Sends a test email to the signed-in admin (never to an arbitrary address). */
export async function sendTestEmailAction(): Promise<TestResult> {
  const user = await requirePlatformPermission("integrations.manage");
  return sendIntegrationsTestEmail(user.email, user.id);
}

/** Read-only check of the Vercel token + project. */
export async function testDomainProviderAction(): Promise<TestResult> {
  const user = await requirePlatformPermission("integrations.manage");
  return testDomainProvider(user.id);
}

/** Saves the server keys (AI, voice, push, storage, upload safety). A blank field keeps what is saved. */
export async function saveServerKeysAction(input: ConfigInput): Promise<SaveConfigResult> {
  const user = await requirePlatformPermission("integrations.manage");
  const clean: ConfigInput = {};
  for (const [key, v] of Object.entries(input ?? {})) clean[key] = v && typeof v === "object" ? { clear: true } : String(v ?? "");
  const res = await saveConfig(clean, user.id);
  if (res.ok) revalidatePath("/console", "layout");
  return res;
}
