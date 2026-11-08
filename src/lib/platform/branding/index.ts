import "server-only";
import { cache } from "react";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { COMPANIES_COLLECTION, forgetCompanyRouting, type Company } from "@/lib/platform/tenancy/companies";
import { LOGO_ROUTE } from "@/lib/platform/branding/logo";
import { NEUTRAL_BRAND, type CompanyBrand, type StoredBranding } from "@/lib/platform/branding/types";

export type { CompanyBrand } from "@/lib/platform/branding/types";

type CompanyWithBranding = Company & { branding?: StoredBranding };

async function companies() {
  return (await getPlatformDb()).collection<CompanyWithBranding>(COMPANIES_COLLECTION);
}

/**
 * The current company's brand, resolved once per request. Falls back to the
 * company's registered name (all in the primary colour); the platform owner
 * falls back to its own built-in wordmark.
 */
export const getCompanyBrand = cache(async (): Promise<CompanyBrand> => {
  const id = await currentCompanyIdOrNull();
  if (!id) return NEUTRAL_BRAND;
  const company = await (await companies()).findOne({ _id: id }, { projection: { name: 1, isPlatformOwner: 1, branding: 1 } });
  if (!company) return NEUTRAL_BRAND;
  const b = company.branding ?? {};
  const fallback = { namePrimary: company.name, nameAccent: "" };
  const hasWordmark = Boolean(b.namePrimary?.trim() || b.nameAccent?.trim());
  const namePrimary = hasWordmark ? (b.namePrimary ?? "").trim() : fallback.namePrimary;
  const nameAccent = hasWordmark ? (b.nameAccent ?? "").trim() : fallback.nameAccent;
  return {
    name: company.name,
    namePrimary,
    nameAccent,
    logoUrl: b.logoUrl || null,
    // The accent colour comes from the active theme now (themes carry the whole palette).
    primaryColor: null,
    isPlatformOwner: company.isPlatformOwner,
  };
});

export interface BrandingInput {
  namePrimary: string;
  nameAccent: string;
  logoUrl: string | null;
}

export type BrandingResult = { ok: true } | { ok: false; errors: Record<string, string> };

export async function saveBranding(input: BrandingInput): Promise<BrandingResult> {
  const errors: Record<string, string> = {};
  const namePrimary = input.namePrimary.trim().slice(0, 40);
  const nameAccent = input.nameAccent.trim().slice(0, 40);
  if (!namePrimary && !nameAccent) errors.namePrimary = "Enter the name to show in your logo.";
  // Only logos uploaded through this workspace — never an arbitrary external URL.
  if (input.logoUrl && !input.logoUrl.startsWith(LOGO_ROUTE)) errors.logoUrl = "Upload the logo again.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const id = await currentCompanyIdOrNull();
  if (!id) return { ok: false, errors: { form: "No workspace." } };
  const branding: StoredBranding = { namePrimary, nameAccent, logoUrl: input.logoUrl || null };
  await (await companies()).updateOne({ _id: id }, { $set: { branding, updatedAt: new Date() } });
  forgetCompanyRouting();
  return { ok: true };
}

/** The saved values for the branding form (no fallbacks applied). */
export async function getStoredBranding(): Promise<StoredBranding> {
  const id = await currentCompanyIdOrNull();
  if (!id) return {};
  return (await (await companies()).findOne({ _id: id }, { projection: { branding: 1 } }))?.branding ?? {};
}
