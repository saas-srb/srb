import { redirect } from "next/navigation";
import { getViewer } from "@/lib/products/viralpulse-ai/viewer";
import { lockedUnless } from "@/lib/products/viralpulse-ai/gate";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import AiVCardWizard from "@/components/products/viralpulse-ai/vcard/AiVCardWizard";

export const metadata = { title: "New AI Visiting Card" };

export default async function NewVCardPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const locked = lockedUnless(viewer, "vcards.use", "Digital cards");
  if (locked) return locked;
  return (
    <div className="space-y-4">
      <PageHeader
        title="New Visiting Card"
        crumbs={[{ label: "AI Visiting Cards", href: "/viralpulse-ai/vcards" }, { label: "New" }]}
        description="Four short steps. AI creates your double-sided business card with company branding, contact details, and vector print PDF."
      />
      <AiVCardWizard />
    </div>
  );
}
