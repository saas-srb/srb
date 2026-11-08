import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { playbookCan } from "@/lib/playbook-roles";
import { getBrand, getBrandMeta } from "@/lib/products/playbook-ai/brand/store";
import { getBrandAsset } from "@/lib/products/playbook-ai/brand/assets";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import BrandForm from "@/components/products/playbook-ai/brand/BrandForm";

/** Brand and letterhead: one page per company, with a live preview drawn by the real PDF renderer. Needs MANAGE_BRAND. */
export default async function BrandPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  if (!playbookCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, "MANAGE_BRAND")) redirect("/playbook-ai");

  const [brand, meta, company] = await Promise.all([getBrand(), getBrandMeta(), loadCompanyValues()]);
  const ids = [brand.logo.assetId, ...brand.signatories.map((s) => s.assetId)].filter((x): x is string => !!x);
  const thumbs: Record<string, string> = {};
  for (const id of ids) {
    const a = await getBrandAsset(id);
    if (a) thumbs[id] = `data:image/png;base64,${a.bytes.toString("base64")}`;
  }
  const companyValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(company)) if (v !== null && v !== undefined) companyValues[k] = String(v);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Playbook", href: "/playbook-ai" }, { label: "Brand & letterhead" }]}
        title={<>Brand &amp; letterhead</>}
        description={<>Your logo, colours, fonts, letterhead and footer for every document. The company name, address and registration numbers come from your company profile.</>}
      />
      <BrandForm initial={brand} thumbs={thumbs} companyValues={companyValues} updatedAt={meta.updatedAt ? meta.updatedAt.toISOString() : null} />
    </div>
  );
}
