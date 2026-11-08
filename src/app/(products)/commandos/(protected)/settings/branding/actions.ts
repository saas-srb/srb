"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { saveBranding, type BrandingInput, type BrandingResult } from "@/lib/platform/branding";
import { uploadCompanyLogo, type LogoUploadResult } from "@/lib/platform/branding/logo";
import { applyTheme } from "@/lib/platform/branding/theme-options";
import { flagBlockReason, writeBlockReason } from "@/lib/platform/billing/enforce";
import { markOnboardingStep } from "@/lib/platform/onboarding/state";

async function requireOwner() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  return user;
}

export async function saveBrandingAction(input: BrandingInput): Promise<BrandingResult> {
  await requireOwner();
  const planBlock = (await writeBlockReason()) ?? (await flagBlockReason("whiteLabel", "Your own brand name and logo"));
  if (planBlock) return { ok: false, errors: { form: planBlock } };
  const res = await saveBranding({
    namePrimary: String(input?.namePrimary ?? ""),
    nameAccent: String(input?.nameAccent ?? ""),
    logoUrl: input?.logoUrl ? String(input.logoUrl) : null,
  });
  if (res.ok) {
    await markOnboardingStep("branding");
    // The brand is read by the root layout — refresh every page's cached render.
    revalidatePath("/", "layout");
  }
  return res;
}

export async function uploadLogoAction(form: FormData): Promise<LogoUploadResult> {
  await requireOwner();
  const planBlock = (await writeBlockReason()) ?? (await flagBlockReason("whiteLabel", "Your own brand name and logo"));
  if (planBlock) return { ok: false, error: planBlock } as LogoUploadResult;
  const file = form.get("logo");
  return file instanceof File ? uploadCompanyLogo(file) : { ok: false, error: "Choose an image file." };
}

/** Picks the company's theme — it becomes the look of the public website and every product. */
export async function applyThemeAction(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireOwner();
  const res = await applyTheme(String(key ?? ""), user.id);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
