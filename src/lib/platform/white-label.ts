import "server-only";
import { currentCompanyIdOrNull, isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getCompanyBrand } from "@/lib/platform/branding";

/**
 * White label: a customer company never sees the platform's name. The ONE rule for "may the platform's own name be shown here?":
 * only outside any company (the platform's marketing site, the Platform Console, platform mail) or inside the platform owner's own workspace.
 * Everything a tenant reads uses the company's own brand name (`getCompanyBrand().name`, see `brandName()`).
 */
export async function isPlatformBrandVisible(): Promise<boolean> {
  if (!(await currentCompanyIdOrNull())) return true;
  return isPlatformOwnerContext();
}

/** The company's own brand name for anything a person reads (tab titles, emails, PDFs, prompts). Falls back to a neutral word, never the platform's name. */
export async function brandName(): Promise<string> {
  const { name } = await getCompanyBrand().catch(() => ({ name: "" }));
  return name?.trim() || "Your company";
}

/** `Display Name <addr@host>` with the display name replaced by the company's brand name when the platform's name must not show. */
export async function senderForTenant(from: string): Promise<string> {
  if (await isPlatformBrandVisible()) return from;
  const m = /<([^>]+)>\s*$/.exec(from);
  const addr = m ? m[1] : from;
  const name = (await brandName()).replace(/[<>"\r\n]/g, "").slice(0, 60);
  return `${name} <${addr}>`;
}
