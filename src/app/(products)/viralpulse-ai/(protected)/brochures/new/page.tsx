import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import AiBrochureWizard from "@/components/products/viralpulse-ai/brochure/AiBrochureWizard";

export const metadata = { title: "Create AI Brochure" };

export default async function NewBrochurePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "MANAGE_POSTS") && !can(viewer, "MANAGE_MEDIA") && !can(viewer, "GENERATE_AI_CONTENT")) {
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
