import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import OwnerRow from "@/components/products/cashflow-ai/compliance/OwnerRow";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { WORKSTREAMS } from "@/lib/products/cashflow-ai/compliance/owners-core";
import { listOwners } from "@/lib/products/cashflow-ai/compliance/owners";

export default async function TeamPage() {
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageCompliance(user) : false;
  const owners = await listOwners();
  const unnamed = WORKSTREAMS.filter((w) => !owners.get(w.key)?.primary).length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "CA & Compliance", href: "/cashflow-ai/compliance" }, { label: "Who does what" }]}
        title={<>Who Does What</>}
        description={<>For each kind of work, the checklist suggests who should do it and who should review it. Write the real name against each so nobody has to guess. {unnamed > 0 ? `${unnamed} of ${WORKSTREAMS.length} still have no name.` : "Everyone is named."}</>}
      />
      <GlassCard interactive={false}>
        <CardContent className="p-5">
          <ul>
            {WORKSTREAMS.map((w) => {
              const o = owners.get(w.key);
              return <OwnerRow key={w.key} workstreamKey={w.key} title={w.title} primaryRole={w.primaryRole} reviewRole={w.reviewRole} primary={o?.primary ?? ""} reviewer={o?.reviewer ?? ""} contact={o?.contact ?? ""} canManage={canManage} />;
            })}
          </ul>
        </CardContent>
      </GlassCard>
    </div>
  );
}
