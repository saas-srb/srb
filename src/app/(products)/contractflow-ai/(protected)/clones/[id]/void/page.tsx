import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import CloneVoidForm from "@/components/products/contractflow-ai/CloneVoidForm";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { getClone } from "@/lib/products/contractflow-ai/clones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Void document" };

/** Void one ContractFlow document (it used to be a popup in the list). */
export default async function CloneVoidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");
  const r = await getClone(viewer, id);
  if (!r.ok) { if (r.error.code === "forbidden") redirect("/contractflow-ai/documents"); notFound(); }
  if (!r.capabilities.void) redirect(`/contractflow-ai/clones/${id}`);
  return (
    <div className="space-y-4">
      <PanelPageHeader title="Void document" description="Signing links stop working. The record is kept, and you can create a replacement." />
      <CloneVoidForm id={r.clone._id} title={r.clone.title} backHref={`/contractflow-ai/clones/${id}`} />
    </div>
  );
}
