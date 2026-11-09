import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import CfSendForm from "@/components/products/contractflow-ai/CfSendForm";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { getClone } from "@/lib/products/contractflow-ai/clones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Send for signature" };

/** "Send for signature" for one ContractFlow document (it used to be a popup in the list and on the document page). */
export default async function CloneSendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");
  const r = await getClone(viewer, id);
  if (!r.ok) { if (r.error.code === "forbidden") redirect("/contractflow-ai/documents"); notFound(); }
  const { clone: c, capabilities: cap } = r;
  if (!(cap.send || cap.markReady)) redirect(`/contractflow-ai/clones/${id}`);
  return (
    <div className="space-y-4">
      <PanelPageHeader title="Send for signature" description="Choose who it is for, set the signers and email each of them their own link." />
      <CfSendForm id={c._id} title={c.title} party={{ type: c.party.type, partyId: c.party.partyId, displayName: c.party.displayName }} plan={c.signerPlan.map((x) => ({ name: x.name, email: x.email, role: x.role }))} backHref={`/contractflow-ai/clones/${id}`} />
    </div>
  );
}
