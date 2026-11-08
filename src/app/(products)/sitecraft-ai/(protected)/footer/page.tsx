import { redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { listFooterColumns, listFooterLinks } from "@/lib/products/sitecraft-ai/footer";
import FooterManager from "@/components/products/sitecraft-ai/FooterManager";
import { PanelBottom } from "lucide-react";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";

export default async function CmsFooterPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const [columns, links] = await Promise.all([listFooterColumns(), listFooterLinks()]);

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Footer" }]}
        icon={PanelBottom}
        title="Footer"
        description={<>The website footer&apos;s link columns. Contact details, social links and the footer&apos;s CTA/intro text are under Site Identity.</>}
      />
      <FooterManager initialColumns={columns} initialLinks={links} canEdit={can(viewer, "FOOTER_MANAGE")} />
    </div>
  );
}
