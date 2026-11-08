import { redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { getSiteInfoForEdit } from "@/lib/products/sitecraft-ai/site-info";
import SiteInfoEditor from "@/components/products/sitecraft-ai/SiteInfoEditor";
import { BadgeInfo } from "lucide-react";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";

export default async function CmsSiteIdentityPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");
  if (!can(viewer, "VIEW")) redirect("/sitecraft-ai");

  const info = await getSiteInfoForEdit();

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Site Identity" }]}
        icon={BadgeInfo}
        title="Site Identity & Contact"
        description={<>Brand, logo, contact details, social links and the header/footer text around the menus. Used by the header, both footer styles, the contact page, the floating WhatsApp button and offer CTAs. Saving publishes immediately.</>}
      />
      <SiteInfoEditor initial={info} canEdit={can(viewer, "NAV_MANAGE") || can(viewer, "FOOTER_MANAGE")} />
    </div>
  );
}
