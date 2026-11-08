import { redirect } from "next/navigation";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import RequestForm from "@/components/support/RequestForm";
import { getCompanyCaller } from "@/lib/support/caller";
import { getSupportConfig } from "@/lib/support/config";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const caller = await getCompanyCaller();
  if (!caller) redirect("/commandos/login");
  const sp = await searchParams;
  const cfg = await getSupportConfig();
  const config = { types: cfg.types.filter((t) => t.active), priorities: cfg.priorities.filter((p) => p.active), categories: cfg.categories.filter((c) => c.active), severities: cfg.severities.filter((s) => s.active) };

  return (
    <div className="space-y-4">
      <PanelDashboardHeader title="New Request" description="Tell the support team what you need: a question, a problem, a feature idea or feedback. We'll reply here." />
      <GlassCard interactive={false} className="max-w-3xl p-5 sm:p-6">
        <RequestForm config={config} initial={{ type: sp.type }} />
      </GlassCard>
    </div>
  );
}
