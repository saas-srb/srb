import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { UserPlus, ArrowUpRight } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import Tabs from "@/components/products/talentos/Tabs";
import OffersManager from "@/components/products/talentos/OffersManager";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageEmployees } from "@/lib/hrms-roles";
import { getConvertibleApplicants } from "@/lib/products/talentos/recruitment";
import { listPipelineCandidates } from "@/lib/products/talentos/calls";
import { getCareerApplicationStatusMeta } from "@/lib/career-application-status";
import { listOffers, serializeOffer } from "@/lib/products/talentos/offers";
import { formatDate } from "@/lib/utils";

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentHrmsUser();
  const canConvert = !!user && canManageEmployees(user);
  const sp = await searchParams;
  const tab = sp.tab === "convert" ? "convert" : sp.tab === "pipeline" ? "pipeline" : "offers";

  const [applicants, offers, pipeline] = await Promise.all([getConvertibleApplicants(), listOffers(), listPipelineCandidates()]);
  const offeredIds = new Set(offers.map((o) => o.applicationId));
  const applicantsWithoutOffer = applicants.filter((a) => !offeredIds.has(a.id));

  const convertTab = (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle>Ready to Convert</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {applicants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No applicants are marked <span className="font-medium">Selected</span> or <span className="font-medium">Hired</span> yet, or all
            have already been converted.
          </p>
        )}
        {applicants.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm">
            <div className="min-w-0">
              <Link href={`/talentos/recruitment/${a.id}`} className="block truncate font-medium hover:text-primary hover:underline">{a.name}</Link>
              <p className="truncate text-xs text-muted-foreground">
                {a.positionTitle} · {a.email} · applied {formatDate(a.appliedAt)}
                {offeredIds.has(a.id) ? " · has an offer" : ""}
              </p>
            </div>
            {canConvert ? (
              <Link href={`/talentos/employees/new?fromApplication=${a.id}`} className={buttonVariants({ size: "sm" })}>
                <UserPlus className="size-3.5" data-icon="inline-start" />
                Convert to Employee
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">HR access required to convert</span>
            )}
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );

  const pipelineTab = (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle>Candidate pipeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pipeline.length === 0 && <p className="text-sm text-muted-foreground">No candidates are shortlisted, in interview or selected yet.</p>}
        {pipeline.map((c) => {
          const meta = getCareerApplicationStatusMeta(c.status);
          return (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm">
              <div className="min-w-0">
                <Link href={`/talentos/recruitment/${c.id}`} className="block truncate font-medium hover:text-primary hover:underline">{c.name}</Link>
                <p className="truncate text-xs text-muted-foreground">{c.positionTitle}{c.appliedAt ? ` · applied ${formatDate(c.appliedAt)}` : ""}{c.doNotContact ? " · do not contact" : ""}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}>{meta.label}</span>
            </div>
          );
        })}
      </CardContent>
    </GlassCard>
  );

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Recruitment" }]}
        title={<>Recruitment</>}
        description={<>Track offers for shortlisted candidates and onboard them.</>}
        actions={<><a href="/dealflow-ai/careers/applicants" target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowUpRight className="size-3.5" data-icon="inline-start" />
          Open Careers
        </a></>}
      />

      <PanelListFilters>
<Tabs
        initial={tab}
        syncParam="tab"
        tabs={[
          {
            key: "offers",
            label: "Offers",
            content: (
              <OffersManager
                offers={offers.map(serializeOffer).map((o) => ({
                  _id: o._id,
                  applicationId: o.applicationId,
                  candidateName: o.candidateName,
                  candidateEmail: o.candidateEmail,
                  positionTitle: o.positionTitle,
                  status: o.status,
                  offerDate: o.offerDate,
                  proposedJoiningDate: o.proposedJoiningDate,
                  annualCtc: o.annualCtc,
                  notes: o.notes,
                  employeeId: o.employeeId,
                }))}
                applicants={applicantsWithoutOffer.map((a) => ({ id: a.id, name: a.name, email: a.email, positionTitle: a.positionTitle }))}
                canManage={canConvert}
              />
            ),
          },
          { key: "pipeline", label: "Pipeline", content: pipelineTab },
          { key: "convert", label: "Ready to Convert", content: convertTab },
        ]}
      />
</PanelListFilters>
    </div>
  );
}
