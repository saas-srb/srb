import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import SaveVersionForm from "@/components/products/playbook-ai/forms/SaveVersionForm";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { getDocument } from "@/lib/products/playbook-ai/documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Save as version" };

/** "Save as version" for one item (it used to be a popup in the editor). The editor saves the draft first, then opens this page. */
export default async function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getPbActor();
  if (!actor) redirect("/playbook-ai/login");
  const rec = await getDocument(actor, id);
  if (!rec.ok) notFound();
  if (!rec.capabilities.edit) redirect(`/playbook-ai/documents/${id}`);
  return (
    <div className="space-y-4">
      <PanelPageHeader title="Save as version" description="A named version of the saved draft you can compare with later and go back to." />
      <SaveVersionForm id={id} title={rec.document.title} backHref={`/playbook-ai/documents/${id}`} />
    </div>
  );
}
