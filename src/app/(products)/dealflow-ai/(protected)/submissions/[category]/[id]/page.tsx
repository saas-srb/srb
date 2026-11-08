import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Mail, Phone, Calendar, Tag, Download } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import StatusBadge from "@/components/products/dealflow-ai/StatusBadge";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import StatusSelect from "./StatusSelect";
import NotesEditor from "./NotesEditor";
import DeleteButton from "./DeleteButton";
import DealValueEditor from "./DealValueEditor";
import { getLead, isValidCategory, getCategoryLabel, categoryAcceptsResume, DEFAULT_LEAD_STATUS } from "@/lib/leads";
import { getLeadSourceLabel } from "@/lib/lead-sources";
import { formatDateTime } from "@/lib/utils";
import DealflowCallButton from "@/components/products/dealflow-ai/DealflowCallButton";
import DealflowCallHistory from "@/components/products/dealflow-ai/DealflowCallHistory";
import { submissionCallSpec, submissionEntityId } from "@/lib/dealflow-ai/call-targets";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}) {
  await requireLmsPage("VIEW_LEADS");
  const { category, id } = await params;
  if (!isValidCategory(category)) notFound();

  const lead = await getLead(category, id);
  if (!lead) notFound();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dealflow-ai" },
          { label: getCategoryLabel(category), href: `/dealflow-ai/submissions/${category}` },
          { label: lead.name },
        ]}
        title={<>{lead.name}</>}
        actions={<><div className="flex items-center gap-2"><DealflowCallButton spec={submissionCallSpec({ id, category, name: lead.name, phone: lead.phone, subService: lead.subService, message: lead.message, categoryLabel: getCategoryLabel(category) })} /><StatusBadge status={lead.status} /></div></>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <CardHeader><CardTitle>Contact Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              {lead.email ? <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a> : <span className="text-muted-foreground">Not provided</span>}
            </div>
            <div className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-muted-foreground" />
              <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="size-4 shrink-0 text-muted-foreground" />
              <span>{getCategoryLabel(category)}{lead.subService ? ` · ${lead.subService}` : ""}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-4 shrink-0 text-muted-foreground" />
              <span>{formatDateTime(lead.createdAt)}</span>
            </div>

            {categoryAcceptsResume(category) ? (
              <div className="pt-2">
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Resume</h3>
                {lead.resume ? (
                  <a
                    href={`/api/leads/${category}/${id}/resume`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Download className="size-3.5" data-icon="inline-start" />
                    {lead.resume.filename}
                  </a>
                ) : (
                  <p className="text-muted-foreground">No resume uploaded.</p>
                )}
              </div>
            ) : (
              <div className="pt-2">
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Project Details</h3>
                <p className="whitespace-pre-wrap text-foreground">{lead.message || "No message provided."}</p>
              </div>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Status</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <StatusSelect category={category} id={id} initialStatus={lead.status ?? DEFAULT_LEAD_STATUS} />
            <DealValueEditor category={category} id={id} initialValue={lead.dealValue ?? null} />
            <DeleteButton category={category} id={id} />
          </CardContent>
        </GlassCard>
      </div>

      {(lead.campaign || lead.source || lead.utm) && (
        <GlassCard>
          <CardHeader><CardTitle>Attribution</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Source</p>
              <p>{getLeadSourceLabel(lead.source)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Campaign</p>
              <p>{lead.campaign ?? "—"}</p>
            </div>
            {lead.utm?.medium && (
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Medium</p>
                <p>{lead.utm.medium}</p>
              </div>
            )}
            {lead.attribution && (
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Attributed</p>
                <p>
                  {lead.attribution.method === "utm" ? "From landing URL (UTM)" : lead.attribution.method === "csv" ? "From imported lead list" : "Assigned manually"}
                  {" · "}
                  {formatDateTime(lead.attribution.at)}
                </p>
              </div>
            )}
          </CardContent>
        </GlassCard>
      )}

      <DealflowCallHistory entityType="submission" entityId={submissionEntityId(category, id)} />

      <GlassCard>
        <CardHeader><CardTitle>Internal Notes</CardTitle></CardHeader>
        <CardContent>
          <NotesEditor category={category} id={id} initialNotes={lead.notes ?? ""} />
        </CardContent>
      </GlassCard>
    </div>
  );
}
