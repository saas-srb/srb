import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import UgcWizard from "@/components/products/viralpulse-ai/ugc/UgcWizard";
import { loadWizardContext } from "../wizard-context";

export const maxDuration = 300;
export const metadata = { title: "New AI video" };

export default async function NewUgcPage() {
  const ctx = await loadWizardContext();
  if (!ctx.ok) redirect(ctx.redirect);
  return (
    <div className="space-y-4">
      <PageHeader title="New video" crumbs={[{ label: "AI UGC Studio", href: "/viralpulse-ai/ugc" }, { label: "New" }]} description="Five short steps. Your work is saved as a draft as you go." />
      <UgcWizard initialProject={null} {...ctx.props} />
    </div>
  );
}
