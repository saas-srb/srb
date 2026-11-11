"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { saveConfig, type ConfigInput, type SaveConfigResult } from "@/lib/platform/config/store";
import { savePreviousProject, testPreviousProject, saveIntegrations, sendIntegrationsTestEmail, testDomainProvider, type IntegrationsInput, type IntegrationsResult, type TestResult } from "@/lib/platform/integrations";

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

/** Saves (or clears) the optional previous Vercel project used by Domain sync to release hosts. A blank token keeps the saved one. */
export async function savePreviousProjectAction(input: { token: string; projectId: string; teamId: string; clear?: boolean }): Promise<IntegrationsResult> {
  const user = await requirePlatformPermission("integrations.manage");
  const res = await savePreviousProject({ token: String(input?.token ?? ""), projectId: String(input?.projectId ?? ""), teamId: String(input?.teamId ?? ""), clear: Boolean(input?.clear) }, user.id);
  if (res.ok) revalidatePath("/console", "layout");
  return res;
}

export async function testPreviousProjectAction(): Promise<TestResult> {
  const user = await requirePlatformPermission("integrations.manage");
  return testPreviousProject(user.id);
}

// ── Blob migration ───────────────────────────────────────────────────────────

import { discardBlobMigration, getBlobMigrationView, runBlobMigrationTick, startBlobMigration, switchToNewBlobStore, type BlobMigrationView } from "@/lib/storage/blob-migrate-run";

export async function startBlobMigrationAction(input: { sourceToken: string; targetToken: string; dryRun: boolean; keepSourceToken: boolean }): Promise<{ ok: true; view: BlobMigrationView } | { ok: false; error: string }> {
  const user = await requirePlatformPermission("integrations.manage");
  const res = await startBlobMigration({ sourceToken: String(input?.sourceToken ?? ""), targetToken: String(input?.targetToken ?? ""), dryRun: Boolean(input?.dryRun), keepSourceToken: Boolean(input?.keepSourceToken) }, user.id);
  return res.ok ? { ok: true, view: await getBlobMigrationView() } : res;
}

export async function tickBlobMigrationAction(): Promise<BlobMigrationView> {
  await requirePlatformPermission("integrations.manage");
  return runBlobMigrationTick(40_000);
}

export async function switchBlobStoreAction(): Promise<{ ok: true; view: BlobMigrationView } | { ok: false; error: string }> {
  const user = await requirePlatformPermission("integrations.manage");
  const res = await switchToNewBlobStore(user.id);
  if (res.ok) revalidatePath("/console", "layout");
  return res.ok ? { ok: true, view: await getBlobMigrationView() } : res;
}

export async function discardBlobMigrationAction(): Promise<BlobMigrationView> {
  const user = await requirePlatformPermission("integrations.manage");
  await discardBlobMigration(user.id);
  return getBlobMigrationView();
}
