import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { CalendarClock, Flag, PackageCheck } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getClientOverview } from "@/lib/products/clientos/client";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Meetings · {brand} {product:portal}");

const KIND_ICON = { milestone: Flag, review: CalendarClock, delivery: PackageCheck } as const;

export default async function MeetingsPage() {
  const user = await guardPortalPage("client");
  const data = await getClientOverview(user.clientId);
  if (!data) return <EmptyPortalState title="No meetings" body="Upcoming reviews and delivery dates appear here." />;

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Meetings & Reviews" subtitle="Derived from your project milestones and delivery dates" />

      <PanelListFilters>
<GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Next 60 days</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.upcomingMeetings.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing scheduled in the next 60 days.</p>
          )}
          {data.upcomingMeetings.map((m, i) => {
            const Icon = KIND_ICON[m.kind];
            return (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.projectName}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-foreground">{m.date}</span>
              </div>
            );
          })}
        </CardContent>
      </GlassCard>
      <p className="text-xs text-muted-foreground">
        Meeting invites for these reviews are sent separately by your project manager.
      </p>
</PanelListFilters>
    </div>
  );
}
