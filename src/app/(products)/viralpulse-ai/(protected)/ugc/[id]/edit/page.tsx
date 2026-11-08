import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import UgcWizard from "@/components/products/viralpulse-ai/ugc/UgcWizard";
import * as api from "@/lib/products/viralpulse-ai/ugc/api";
import { loadWizardContext } from "../../wizard-context";

export const maxDuration = 300;
export const metadata = { title: "Edit AI video" };

export default async function EditUgcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadWizardContext();
  if (!ctx.ok) redirect(ctx.redirect);
  const r = await api.getProject(id);
  if (!r.ok) notFound();
  const p = r.project;
  if (p.status === "generating" || p.status === "approved") redirect(`/viralpulse-ai/ugc/${id}`);
  return (
    <div className="space-y-4">
      <PageHeader title={p.title} crumbs={[{ label: "AI UGC Studio", href: "/viralpulse-ai/ugc" }, { label: p.title, href: `/viralpulse-ai/ugc/${id}` }, { label: "Edit" }]} description="Change the brief, style, cast or script. Your changes are saved as you go." />
      <UgcWizard initialProject={p} {...ctx.props} />
    </div>
  );
}
