"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { ALL_PRODUCTS_VALUE } from "@/lib/platform/products/selection";
import { hiddenProducts } from "@/lib/platform/products/visible";
import { addOpening, setOpeningOpen } from "@/lib/products/talentos/openings";

type Result = { ok: boolean; error?: string };
const PATH = "/commandos/settings/website";

/** Switches the website with us on or off, or records the address of the company's own website. Products are not changed here. */
export async function saveWebsiteAction(input: { mode: string; externalUrl?: string }): Promise<Result> {
  const user = await requireWorkspaceAction("company.website");
  const companyId = await currentCompanyId();
  const company = await getCompany(companyId);
  if (!company) return { ok: false, error: "Company not found." };
  const mode = input.mode === "platform" || input.mode === "external" ? input.mode : "none";
  const externalUrl = String(input.externalUrl ?? "").trim() || undefined;
  if (mode === "external" && !externalUrl) return { ok: false, error: "Enter your website's address." };
  const products = !company.products || company.products.mode === "all" ? ALL_PRODUCTS_VALUE : company.products.keys;
  const saved = await setCompanyProducts(companyId, { products, website: mode === "external" ? { mode, externalUrl } : { mode } }, { id: user.id, reason: "Website setting" });
  if (!saved.ok) return saved;
  revalidatePath(PATH);
  revalidatePath("/commandos");
  return { ok: true };
}

/** Openings are kept here only while the website's own job listings aren't used. */
async function requireOpeningsKeeper() {
  await requireWorkspaceAction("company.website");
  const hidden = await hiddenProducts();
  if (!hidden.has("website") || (hidden.has("hrms") && hidden.has("lms"))) throw new Error("Forbidden");
}

export async function addOpeningAction(input: { title: string; category: string }): Promise<Result> {
  await requireOpeningsKeeper();
  const added = await addOpening(input);
  if (added.ok) revalidatePath(PATH);
  return added.ok ? { ok: true } : added;
}

export async function setOpeningOpenAction(slug: string, isOpen: boolean): Promise<Result> {
  await requireOpeningsKeeper();
  const result = await setOpeningOpen(slug, isOpen);
  if (result.ok) revalidatePath(PATH);
  return result.ok ? result : { ok: false, error: "That opening no longer exists." };
}
