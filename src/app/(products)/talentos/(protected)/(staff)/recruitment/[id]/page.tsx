import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Mail, Phone, Briefcase, CalendarDays } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import CallWithAI from "@/components/products/agentos/calls/CallWithAI";
import DoNotContactSwitch from "@/components/products/agentos/calls/DoNotContactSwitch";
import { AiCallSummaries, CallsList } from "@/components/products/agentos/calls/AiCallSection";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageEmployees } from "@/lib/hrms-roles";
import { getApplication } from "@/lib/career-applications";
import { getCareerApplicationStatusMeta } from "@/lib/career-application-status";
import { getApplicantCalls, APPLICANT_ENTITY, TALENTOS_PRODUCT } from "@/lib/products/talentos/calls";
import { candidateCallContext } from "@/lib/products/talentos/call-context";
import { listCallsForTarget } from "@/lib/products/call-target-calls";
import { formatDate } from "@/lib/utils";
import { setApplicantDoNotContactAction } from "../actions";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, app] = await Promise.all([getCurrentHrmsUser(), /^[a-f\d]{24}$/i.test(id) ? getApplication(id) : Promise.resolve(null)]);
  if (!app) notFound();
  const canCall = !!user && canManageEmployees(user);
  const [{ aiCalls, doNotContact }, calls] = await Promise.all([getApplicantCalls(id), listCallsForTarget(TALENTOS_PRODUCT, APPLICANT_ENTITY, id)]);
  const status = getCareerApplicationStatusMeta(app.status);
  const target = { product: TALENTOS_PRODUCT, entityType: APPLICANT_ENTITY, entityId: id, label: app.name };
  const context = candidateCallContext(app);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Recruitment", href: "/talentos/recruitment" }, { label: app.name }]}
        title={<>{app.name}</>}
        description={<>{app.positionTitle} · <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.badgeClass}`}>{status.label}</span></>}
        actions={
          canCall && !doNotContact ? (
            <div className="flex flex-wrap items-center gap-2">
              <CallWithAI target={target} phone={app.phone} context={context} defaultPurpose="screening" variant="default" size="sm" label="Screening call with AI" />
              <CallWithAI target={target} phone={app.phone} context={context} defaultPurpose="pre_hr" variant="outline" size="sm" label="HR pre-qualification call" />
            </div>
          ) : undefined
        }
      />

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Candidate</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2"><Mail className="size-3.5" /> {app.email}</p>
          <p className="flex items-center gap-2"><Phone className="size-3.5" /> {app.phone || "No phone number"}</p>
          <p className="flex items-center gap-2"><Briefcase className="size-3.5" /> {app.positionTitle}</p>
          <p className="flex items-center gap-2"><CalendarDays className="size-3.5" /> Applied {formatDate(app.createdAt)}</p>
        </CardContent>
      </GlassCard>

      {canCall && (
        <DoNotContactSwitch initial={doNotContact} who={app.name} action={setApplicantDoNotContactAction.bind(null, id)} />
      )}
      {doNotContact && <p className="text-xs text-muted-foreground">Calling is switched off for this candidate.</p>}

      <AiCallSummaries entries={aiCalls} />
      <CallsList rows={calls} />
    </div>
  );
}
