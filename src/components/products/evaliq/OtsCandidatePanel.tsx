import Link from "next/link";
import { FileCheck2, Send, ExternalLink } from "lucide-react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { assignmentsForCandidates } from "@/lib/products/evaliq/assignments";
import { testNames } from "@/lib/products/evaliq/tests";
import { certificatesForAssignments } from "@/lib/products/evaliq/certificates";
import { ASSIGNMENT_STATUSES, fmtPct, labelOf, toneFor, type CandidateKind } from "@/lib/products/evaliq/constants";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * "Online Tests" card embedded in the applicant (Careers), employee (HRMS)
 * and student (TMS) detail pages. OTS stays the source of truth — this only
 * READS it, and only for viewers whose OTS permissions allow it (the OTS
 * session is minted by cross-product SSO for anyone with OTS access).
 */
export default async function OtsCandidatePanel({ kind, id, title = "Online Tests" }: { kind: CandidateKind; id: string; title?: string }) {
  const viewer = await getViewer();
  const allowed = !!viewer && (can(viewer, "VIEW_ASSIGNMENTS") || can(viewer, "VIEW_REPORTS"));
  const target = kind === "employee" ? "employee" : kind === "applicant" ? "applicant" : kind === "student" ? "student" : "user";
  if (!allowed)
    return (
      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="size-4" /> {title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Test assignments and results live in the Online Test System and are visible to EvalIQ managers and evaluators.</CardContent>
      </GlassCard>
    );
  const list = await assignmentsForCandidates([{ kind, id }]);
  const [names, certs] = await Promise.all([testNames(list.map((a) => a.testId)), certificatesForAssignments(list.map((a) => a._id))]);
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="size-4" /> {title}</CardTitle>
            <CardDescription>From the Online Test System — assessments, screening tests and exams assigned to this person.</CardDescription>
          </div>
          {can(viewer, "ASSIGN_TEST") && (
            <Button size="sm" nativeButton={false} render={<Link href={`/evaliq/assignments/new?target=${target}&id=${encodeURIComponent(id)}`} />}>
              <Send className="size-3.5" /> Assign test
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tests assigned yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {list.map((a) => {
              const cert = certs.get(a._id);
              return (
                <li key={a._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/evaliq/tests/${a.testId}`} className="font-medium hover:text-primary">{names.get(a.testId)?.name ?? "Test"}</Link>
                    <p className="text-[11px] text-muted-foreground">{`Assigned ${formatDateTime(a.createdAt)}${a.dueAt ? ` · due ${formatDateTime(a.dueAt)}` : ""} · ${a.attemptsUsed} attempt${a.attemptsUsed === 1 ? "" : "s"}${cert ? ` · certificate ${cert.certificateNumber}` : ""}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", toneFor(ASSIGNMENT_STATUSES, a.status))}>{labelOf(ASSIGNMENT_STATUSES, a.status)}</span>
                    {a.result && (
                      <Link href={a.result.attemptId ? `/evaliq/results/${a.result.attemptId}` : `/evaliq/results?testId=${a.testId}`} className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", a.result.passed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600")}>
                        {`${fmtPct(a.result.percentage)} · ${a.result.passed ? "Pass" : "Fail"}`}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/evaliq" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Open Online Test System <ExternalLink className="size-3" />
        </Link>
      </CardContent>
    </GlassCard>
  );
}
