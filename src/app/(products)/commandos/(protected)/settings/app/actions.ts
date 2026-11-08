"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { uploadCompanyLogo, type LogoUploadResult } from "@/lib/platform/branding/logo";
import { availableAppPanels } from "@/lib/pwa/panels";
import { normalizeAppSettings, type AppSettings } from "@/lib/pwa/settings";
import { resetAppSettings, saveAppSettings } from "@/lib/pwa/store";

async function requireOwner() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  return user;
}

export async function saveAppSettingsAction(input: AppSettings): Promise<{ ok: true; settings: AppSettings } | { ok: false; error: string }> {
  await requireOwner();
  const panels = (await availableAppPanels()).map((p) => p.key);
  const settings = normalizeAppSettings(input, panels);
  if (settings.shortName && settings.shortName.length > 12) return { ok: false, error: "The short name can be at most 12 characters." };
  await saveAppSettings(settings);
  // The manifest, icons and page metadata all read these settings.
  revalidatePath("/", "layout");
  return { ok: true, settings };
}

export async function resetAppSettingsAction(): Promise<{ ok: true }> {
  await requireOwner();
  await resetAppSettings();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** An image used only as the app icon (same storage, limits and formats as the Branding logo). */
export async function uploadAppIconAction(form: FormData): Promise<LogoUploadResult> {
  await requireOwner();
  const file = form.get("icon");
  return file instanceof File ? uploadCompanyLogo(file) : { ok: false, error: "Choose an image file." };
}
