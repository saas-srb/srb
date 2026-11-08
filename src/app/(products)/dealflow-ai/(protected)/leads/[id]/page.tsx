import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, ExternalLink } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getLeadRecord, serializeLeadRecord } from "@/lib/lead-management/records";
import { listLeadTimeline } from "@/lib/lead-management/timeline";
import { listLeadMessages } from "@/lib/lead-management/messages";
import { listInterviewsForLead } from "@/lib/products/clientos/interviews";
import { listStaffDocsForUser } from "@/lib/products/clientos/documents";
import { workflowFor, nextStageOptions, stageMeta } from "@/lib/lead-management/workflows";
import { LEAD_SOURCE_META } from "@/lib/lead-management/types";
import LeadStageControl from "./LeadStageControl";
import LeadComms from "./LeadComms";
import DoNotContactToggle from "./DoNotContactToggle";
import LeadLinksPanel from "./LeadLinksPanel";
import LeadInterviewsPanel from "./LeadInterviewsPanel";
import LeadDocsPanel from "./LeadDocsPanel";
import LeadTimelineView from "./LeadTimelineView";
import LoginAsPortalUserButton from "../list/LoginAsPortalUserButton";
import DealflowCallButton from "@/components/products/dealflow-ai/DealflowCallButton";
import DealflowCallHistory from "@/components/products/dealflow-ai/DealflowCallHistory";
import { leadCallSpec } from "@/lib/dealflow-ai/call-targets";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  job_applicant: "Job Applicant",
  intern: "Intern",
  trainee: "Trainee",
  client: "Client",
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLmsPage("VIEW_LEADS");
  const { id } = await params;
  const lead = await getLeadRecord(id);
  if (!lead) notFound();

  const [timeline, internalMsgs, portalMsgs, interviews, docs] = await Promise.all([
    listLeadTimeline(id),
    listLeadMessages(id, { visibility: "internal" }),
    listLeadMessages(id, { visibility: "portal" }),
    lead.type === "job_applicant" ? listInterviewsForLead(id, lead.applicationId) : Promise.resolve([]),
    listStaffDocsForUser(lead.externalUserId),
  ]);

  const s = serializeLeadRecord(lead);
  const workflow = workflowFor(lead.type);
  const nextStages = nextStageOptions(lead.type, lead.stage);
  const currentStage = stageMeta(lead.type, lead.stage);

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dealflow-ai" },
          { label: "Lead Management", href: "/dealflow-ai/leads" },
          { label: lead.name },
        ]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{lead.name}<span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
              {TYPE_LABEL[lead.type]}
            </span></span></>}
        description={<>{lead.code} · {LEAD_SOURCE_META[lead.source].label}
            {lead.subService ? ` · ${lead.subService}` : ""}</>}
        meta={<><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-primary">
              <Mail className="size-3.5" /> {lead.email}
            </a>
            <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-primary">
              <Phone className="size-3.5" /> {lead.phone}
            </a>
          </div></>}
        actions={<><div className="text-right text-xs text-muted-foreground space-y-1.5">
          <p>Portal account: {lead.externalUserId.slice(0, 8)}…</p>
          {lead.applicationId && (
            <Link href={`/dealflow-ai/careers/applicants/${lead.applicationId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              Career application <ExternalLink className="size-3" />
            </Link>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DealflowCallButton spec={leadCallSpec(lead)} />
            <LoginAsPortalUserButton
              externalUserId={lead.externalUserId}
              leadId={lead._id}
              displayName={lead.name}
              variant="full"
            />
          </div>
        </div></>}
      />

      {lead.message && (
        <GlassCard>
          <CardHeader><CardTitle className="text-base">Submission message</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{lead.message}</p></CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <LeadStageControl
            leadId={id}
            type={lead.type}
            currentStageKey={lead.stage}
            currentStageLabel={currentStage?.label ?? lead.stage}
            status={s.status}
            ownerStaffId={lead.ownerStaffId}
            workflow={workflow.map((w) => ({ key: w.key, label: w.label, terminal: w.terminal ?? null }))}
            nextStages={nextStages.map((w) => ({ key: w.key, label: w.label }))}
          />

          <DoNotContactToggle leadId={id} doNotContact={Boolean(lead.doNotContact)} />

          <LeadLinksPanel
            leadId={id}
            type={lead.type}
            studentId={lead.studentId}
            clientId={lead.clientId}
            projectId={lead.projectId}
          />

          {lead.type === "job_applicant" && <LeadInterviewsPanel leadId={id} initial={interviews} />}

          <DealflowCallHistory entityType="lead" entityId={id} />

          <LeadComms leadId={id} internal={internalMsgs} portal={portalMsgs} />

          <LeadDocsPanel leadId={id} docs={docs} />
        </div>

        <div className="lg:col-span-1">
          <GlassCard>
            <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent>
              <LeadTimelineView events={timeline} />
            </CardContent>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
