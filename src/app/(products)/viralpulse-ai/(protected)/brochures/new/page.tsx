import { lockedUnless } from "@/lib/products/viralpulse-ai/gate";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import AiBrochureWizard from "@/components/products/viralpulse-ai/brochure/AiBrochureWizard";

export const metadata = { title: "Create AI Brochure" };

export default async function NewBrochurePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const locked = lockedUnless(viewer, "brochures.use", "Brochures");
  if (locked) return locked;
  if (!can(viewer, "posts.manage") && !can(viewer, "media.manage") && !can(viewer, "brochures.use")) {
    redirect("/viralpulse-ai");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Brochure Studio"
        crumbs={[
          { label: "Brochure Builder", href: "/viralpulse-ai/brochures" },
          { label: "New AI Brochure" },
        ]}
        description="Four AI-guided steps. Provide your brief, preview templates, synthesize custom copy, and launch."
      />
      <AiBrochureWizard />
    </div>
  );
}
