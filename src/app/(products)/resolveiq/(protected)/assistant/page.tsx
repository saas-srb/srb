import { redirect } from "next/navigation";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import HelpChat from "@/components/support/HelpChat";
import { getCompanyCaller } from "@/lib/support/caller";
import { listPublished } from "@/lib/support/articles";

export const dynamic = "force-dynamic";

export default async function HelpAssistantPage() {
  const caller = await getCompanyCaller();
  if (!caller) redirect("/commandos/login");
  const articles = await listPublished(40);
  return (
    <div className="space-y-4">
      <PanelDashboardHeader title="Help Assistant" description="Ask how to use this workspace. Answers come from its help content; if the assistant can't solve your problem, it can help you prepare a support request." />
      <GlassCard interactive={false} className="mx-auto max-w-4xl p-4">
        {/* Starter questions come from the published articles, so they stay in step with the help content. */}
        <HelpChat suggestions={articles.slice(0, 4).map((a) => a.title)} />
      </GlassCard>
    </div>
  );
}
