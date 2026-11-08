import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { listPanels } from "@/lib/platform/panels/store";
import { PDF_TYPES } from "@/lib/pdf/catalog";
import { pdfStats } from "@/lib/pdf/activity";
import { getFeatureControls } from "@/lib/platform/feature-controls";
import PdfLibrary from "@/components/platform/pdf-library/PdfLibrary";

export const metadata: Metadata = { title: "Documents & PDFs", robots: { index: false, follow: false } };

/** Every PDF the system produces, with a preview in this company's letterhead and what this company has done with each. */
export default async function DocumentsPage() {
  await requireWorkspaceAccess("company.pdfs");
  const controls = await getFeatureControls();
  const [stats, panels] = await Promise.all([pdfStats(), listPanels().catch(() => [])]);
  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Documents & PDFs" }]}
          title={<>Documents &amp; PDFs</>}
          description={<>Every PDF your workspace produces: what is on it, when it is made, where your team uses it and how it reaches people. Previews use your own letterhead with made-up figures, so nothing real is shown.</>}
        />
        {controls.pdfLibrary ? <PdfLibrary disabled={Object.keys(controls.pdfs)} types={PDF_TYPES} stats={stats} products={Object.fromEntries(panels.map((p) => [p.key, p.shortName || p.name]))} /> : <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">Documents &amp; PDFs is turned off for your workspace by SelfRun. Your documents are still produced as before; contact support if you need the list.</p>}
      </div>
    </div>
  );
}
