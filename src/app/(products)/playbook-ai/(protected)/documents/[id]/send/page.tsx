import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import SendToContractFlowForm from "@/components/products/playbook-ai/items/SendToContractFlowForm";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { getDocument } from "@/lib/products/playbook-ai/documents";
import { playbookCan } from "@/lib/playbook-roles";
import { ITEM_KIND_INFO, type ItemKind } from "@/lib/products/playbook-ai/items-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Send to ContractFlow" };

/** "Send to ContractFlow" for one item (it used to be a popup on the list and in the editor). */
export default async function SendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getPbActor();
  if (!actor) redirect("/playbook-ai/login");
  const rec = await getDocument(actor, id);
  if (!rec.ok) notFound();
  const kind: ItemKind = (rec.document.kind as ItemKind | undefined) ?? "document";
  const info = ITEM_KIND_INFO[kind];
  const back = `/playbook-ai/${info.segment}`;
  if (!playbookCan(actor, "SEND_FOR_SIGNATURE")) redirect(back);
  return (
    <div className="space-y-4">
      <PanelPageHeader title="Send to ContractFlow" description={<>Copy this {info.singular.toLowerCase()} to ContractFlow as a draft for an employee, client or other party. Nothing is sent to anyone from here.</>} />
      <SendToContractFlowForm documentId={id} title={rec.document.title} defaultType={kind === "document" ? "other" : "employee"} backHref={back} />
    </div>
  );
}
