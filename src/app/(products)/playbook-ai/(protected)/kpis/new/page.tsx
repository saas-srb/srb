import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import ItemWizard from "@/components/products/playbook-ai/items/ItemWizard";
import { playbookCan } from "@/lib/playbook-roles";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { brandSummary } from "@/lib/products/playbook-ai/brand/summary";
import { getPbSettings } from "@/lib/products/playbook-ai/pb-settings";
import { ITEM_KIND_INFO } from "@/lib/products/playbook-ai/items-types";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = await getPbActor();
  if (!actor) redirect("/playbook-ai/login");
  if (!playbookCan(actor, "CREATE")) redirect("/playbook-ai/kpis");
  const settings = await getPbSettings();
  const info = ITEM_KIND_INFO.kpi;
  return (
    <div className="space-y-4">
      <PanelPageHeader title={<>{info.create}</>} description={<>Three steps: details, an AI draft you check, then the editor with a live PDF preview.</>} />
      <ItemWizard kind="kpi" aiEnabled={settings.ai.enabled && playbookCan(actor, "USE_AI")} brand={await brandSummary(actor)} />
    </div>
  );
}
