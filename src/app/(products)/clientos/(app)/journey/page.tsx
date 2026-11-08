import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getActivePortalLead } from "@/lib/products/clientos/lead";
import { HiringTimeline, PortalPageHeader } from "@/components/products/clientos/widgets";
import LeadJourney from "@/components/products/clientos/LeadJourney";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("My Journey · {brand} {product:portal}");

export default async function JourneyPage() {
  const user = await guardPortalPage();
  const view = await getActivePortalLead(user);
  if (!view) return <EmptyPortalState title="No activity yet" body="Your journey appears here once your request is in our system." />;

  return (
    <div className="space-y-5">
      <PortalPageHeader
        title="My Journey"
        subtitle={`${view.lead.code} · currently: ${view.currentStagePortalLabel}`}
      />

      <PanelListFilters>
<GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <HiringTimeline steps={view.stageTimeline} rejected={view.lead.status === "lost"} />
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadJourney events={view.events} />
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
