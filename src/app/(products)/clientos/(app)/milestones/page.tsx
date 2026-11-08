import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { Flag } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getClientOverview } from "@/lib/products/clientos/client";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { cn } from "@/lib/utils";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Milestones · {brand} {product:portal}");

const STATUS_CLASS: Record<string, string> = {
  completed: "bg-green-500/10 text-green-600 dark:text-green-400",
  in_progress: "bg-primary/10 text-primary",
  not_started: "bg-muted text-muted-foreground",
  on_hold: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export default async function MilestonesPage() {
  const user = await guardPortalPage("client");
  const data = await getClientOverview(user.clientId);
  if (!data) return <EmptyPortalState title="No milestones" body="Milestones appear here once your projects are underway." />;

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Milestones" subtitle={`${data.overallProgress}% overall delivery`} />

      <PanelListFilters>
{data.projects.map(({ project, milestones }) => (
        <GlassCard key={project._id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flag className="size-4" /> {project.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones defined yet.</p>}
            {milestones.map((m) => (
              <div key={m._id} className="rounded-xl border border-border/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{m.name}</p>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", STATUS_CLASS[m.status] ?? STATUS_CLASS.not_started)}>
                    {m.status.replace(/_/g, " ")}
                  </span>
                </div>
                {m.description && <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>}
                <div className="mt-2">
                  <ProgressBar value={m.progressPercent} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.dueDate ? `Due ${m.dueDate}` : "No due date"}
                  {m.overdue ? " · overdue" : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </GlassCard>
      ))}
</PanelListFilters>
    </div>
  );
}
