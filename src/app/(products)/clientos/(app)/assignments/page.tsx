import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { ClipboardList, ExternalLink } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getLearnerOverview } from "@/lib/products/clientos/student";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { cn } from "@/lib/utils";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Assignments · {brand} {product:portal}");

const SUB_CLASS: Record<string, string> = {
  reviewed: "bg-green-500/10 text-green-600 dark:text-green-400",
  submitted: "bg-primary/10 text-primary",
  resubmit: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  pending: "bg-muted text-muted-foreground",
};

export default async function AssignmentsPage() {
  const user = await guardPortalPage("intern", "trainee");
  const data = await getLearnerOverview(user.studentId);
  if (!data) return <EmptyPortalState title="No assignments" body="Assignments for your batch appear here." />;

  const rows = data.assignments;
  const pending = rows.filter((a) => !a.submission || a.submission.status === "resubmit");
  const submitted = rows.filter((a) => a.submission && a.submission.status !== "resubmit");

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Assignments" subtitle={`${pending.length} to do · ${submitted.length} submitted`} />

      <PanelListFilters>
{rows.length === 0 && (
        <GlassCard>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No assignments posted yet.</CardContent>
        </GlassCard>
      )}

      {[
        { title: "To do", list: pending },
        { title: "Submitted", list: submitted },
      ]
        .filter((s) => s.list.length > 0)
        .map((section) => (
          <GlassCard key={section.title}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {section.list.map((a) => {
                const status = a.submission?.status ?? "pending";
                return (
                  <div key={a._id} className="rounded-xl border border-border/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-medium text-foreground">
                        <ClipboardList className="size-4 text-muted-foreground" /> {a.title}
                      </p>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", SUB_CLASS[status] ?? SUB_CLASS.pending)}>
                        {status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{a.programName} · {a.batchName}</span>
                      <span>Due {a.dueDate ?? "—"}</span>
                      <span>Max {a.maxMarks} marks</span>
                      {a.submission?.marks != null && <span className="font-medium text-foreground">Scored {a.submission.marks}</span>}
                    </div>
                    {a.description && <p className="mt-1.5 text-xs text-muted-foreground">{a.description}</p>}
                    {a.attachmentUrl && (
                      <a href={a.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        <ExternalLink className="size-3.5" /> Assignment brief
                      </a>
                    )}
                    {a.submission?.feedback && (
                      <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                        Mentor feedback: {a.submission.feedback}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </GlassCard>
        ))}
</PanelListFilters>
    </div>
  );
}
