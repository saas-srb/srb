import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GuardForm from "@/components/products/viralpulse-ai/ads/GuardForm";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getGuard } from "@/lib/products/viralpulse-ai/ads-platforms/guard";
import { guardSummary } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";

export const dynamic = "force-dynamic";

export default async function LimitsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "APPROVE_AD_SPEND") && !can(viewer, "MANAGE_AD_LIMITS")) redirect("/viralpulse-ai/campaigns");
  return (
    <div className="space-y-4">
      <PanelPageHeader breadcrumbs={[{ label: "Campaigns & Ads", href: "/viralpulse-ai/campaigns" }, { label: "Spending limits" }]} title="Ad spending limits" description="The company's ceiling on paid ads. Every launch is checked against these before it can be approved and switched on." />
      <GuardForm initial={guardSummary(await getGuard())} canManage={can(viewer, "MANAGE_AD_LIMITS")} canKill={can(viewer, "APPROVE_AD_SPEND")} />
    </div>
  );
}
