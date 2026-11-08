import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { Briefcase, FileCheck2, MessageSquareText } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getApplicantOverview } from "@/lib/products/clientos/applicant";
import { getCareerApplicationStatusMeta } from "@/lib/career-application-status";
import { offerStatusMeta } from "@/lib/products/talentos/offers-status";
import { HiringTimeline, InfoCard, PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { cn } from "@/lib/utils";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("My Application · {brand} {product:portal}");

export default async function ApplicationPage() {
  const user = await guardPortalPage("job_applicant");
  const data = await getApplicantOverview(user.applicationId ?? "");
  if (!data) return <EmptyPortalState title="No application found" body="We couldn't find your application record." />;

  const statusMeta = getCareerApplicationStatusMeta(data.status);
  const offer = data.offer;

  return (
    <div className="space-y-5">
      <PortalPageHeader
        title="My Application"
        subtitle={data.positionTitle}
        action={<span className={cn("rounded-full px-3 py-1 text-sm font-semibold", statusMeta.badgeClass)}>{statusMeta.label}</span>}
      />

      <PanelListFilters>
<div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <GlassCard>
          <CardHeader>
            <CardTitle>Hiring progress</CardTitle>
          </CardHeader>
          <CardContent>
            <HiringTimeline steps={data.timeline} rejected={data.rejected} />
          </CardContent>
        </GlassCard>

        <div className="space-y-5">
          <InfoCard title="Position applied">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Briefcase className="size-4" />
              </span>
              <div>
                <p className="font-semibold text-foreground">{data.positionTitle}</p>
                <p className="text-xs text-muted-foreground">Applied {new Date(data.appliedOn).toLocaleDateString()}</p>
              </div>
            </div>
          </InfoCard>

          <InfoCard title="Recruiter updates">
            <div className="flex items-start gap-3 text-sm">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                {data.recruiterNote || "No message from the recruiter yet. We'll notify you the moment there's an update."}
              </p>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/70">Last updated {new Date(data.lastUpdate).toLocaleString()}</p>
          </InfoCard>

          <InfoCard title="Offer status">
            {offer ? (
              <div className="space-y-1.5 text-sm">
                <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", offerStatusMeta(offer.status).badgeClass)}>
                  {offerStatusMeta(offer.status).label}
                </span>
                {offer.annualCtc != null && <p className="text-muted-foreground">CTC: ₹{offer.annualCtc.toLocaleString("en-IN")} / year</p>}
                {offer.proposedJoiningDate && <p className="text-muted-foreground">Proposed joining: {offer.proposedJoiningDate}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No offer yet.</p>
            )}
          </InfoCard>
        </div>
      </div>

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Required documents</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {data.requiredDocuments.map((d) => (
            <div key={d.name} className="flex items-center gap-2.5 rounded-xl border border-border/50 px-3 py-2 text-sm">
              <FileCheck2 className={cn("size-4 shrink-0", d.provided ? "text-green-500" : "text-muted-foreground/50")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{d.name}</span>
                {d.note && <span className="block truncate text-[11px] text-muted-foreground">{d.note}</span>}
              </span>
              <span className={cn("shrink-0 text-[11px] font-semibold", d.provided ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                {d.provided ? "Received" : "Pending"}
              </span>
            </div>
          ))}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
