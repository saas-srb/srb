"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { SIGNUP_MODES, savePlatformSettings, setSignupMode, type PlatformGeneralInput, type PlatformSettingsResult, type SignupMode } from "@/lib/platform/settings";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Sign-up mode (moved here from Sign-ups & approvals). Audited in the lib. */
export async function setSignupModeAction(mode: string): Promise<ActionResult> {
  const user = await requirePlatformPermission("settings.manage");
  if (!SIGNUP_MODES.includes(mode as SignupMode)) return { ok: false, error: "Unknown sign-up mode." };
  await setSignupMode(mode as SignupMode, user.id);
  revalidatePath("/console", "layout");
  return { ok: true, message: "Sign-up mode saved." };
}

export async function savePlatformSettingsAction(input: PlatformGeneralInput): Promise<PlatformSettingsResult> {
  const user = await requirePlatformPermission("settings.manage");
  const str = (v: unknown) => String(v ?? "");
  const res = await savePlatformSettings(
    {
      platformName: str(input?.platformName),
      supportEmail: str(input?.supportEmail),
      supportUrl: str(input?.supportUrl),
      defaultLocale: str(input?.defaultLocale),
      defaultTimezone: str(input?.defaultTimezone),
      maintenanceBanner: str(input?.maintenanceBanner),
      reservedSubdomains: Array.isArray(input?.reservedSubdomains) ? input.reservedSubdomains.map(str) : [],
    },
    user.id,
  );
  // The banner shows on every company product; the name on platform pages.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
