import { redirect } from "next/navigation";
import { ListChecks, Download } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import ResultsTable from "@/components/products/evaliq/ResultsTable";
import { PageHeader, EmptyState, Pager, qsHref } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { listResults } from "@/lib/products/evaliq/results";
import { describeCandidates } from "@/lib/products/evaliq/people";
import { listTestOptions } from "@/lib/products/evaliq/tests";
import { CANDIDATE_KINDS, SUBMIT_REASONS, fmtMarks, fmtPct, labelOf } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_REPORTS") && !can(viewer, "EVALUATE_ANSWERS")) redirect("/evaliq");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const [r, tests] = await Promise.all([listResults({ ...sp, page }), listTestOptions()]);
  const people = await describeCandidates(r.items.map((x) => x.candidate));
  const exportQs = new URLSearchParams(Object.entries({ testId: sp.testId, kind: sp.kind, from: sp.from, to: sp.to }).filter((e): e is [string, string] => !!e[1])).toString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Results & Evaluation"
        crumbs={[{ label: "Results" }]}
        description={`${r.total} submitted attempt${r.total === 1 ? "" : "s"}. Objective answers are marked automatically; subjective ones wait here for an evaluator.`}
        actions={
          can(viewer, "EXPORT_REPORTS") && (
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/evaliq/export/results?format=xlsx${exportQs ? `&${exportQs}` : ""}`} />}>
              <Download className="size-3.5" /> Export results
            </Button>
          )
        }
      />
      <SmmsFilterBar
        values={{ q: sp.q ?? "", testId: sp.testId ?? "", status: sp.status ?? "", result: sp.result ?? "", released: sp.released ?? "", kind: sp.kind ?? "", reason: sp.reason ?? "", min: sp.min ?? "", max: sp.max ?? "", from: sp.from ?? "", to: sp.to ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Candidate name" },
          { key: "testId", label: "Test", type: "select", options: tests },
          { key: "status", label: "Status", type: "select", options: [{ value: "pending_evaluation", label: "Pending evaluation" }, { value: "evaluated", label: "Evaluated" }] },
          { key: "result", label: "Result", type: "select", options: [{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }] },
          { key: "released", label: "Released", type: "select", options: [{ value: "yes", label: "Released" }, { value: "no", label: "Not released" }] },
          { key: "kind", label: "User type", type: "select", options: CANDIDATE_KINDS.map((k) => ({ value: k.value, label: k.label })) },
          { key: "reason", label: "Submission", type: "select", options: Object.entries(SUBMIT_REASONS).map(([value, label]) => ({ value, label })) },
          { key: "min", label: "Min %", type: "select", options: ["10", "20", "30", "40", "50", "60", "70", "80", "90"].map((v) => ({ value: v, label: `≥ ${v}%` })) },
          { key: "max", label: "Max %", type: "select", options: ["10", "20", "30", "40", "50", "60", "70", "80", "90"].map((v) => ({ value: v, label: `≤ ${v}%` })) },
          { key: "from", label: "From", type: "date" },
          { key: "to", label: "To", type: "date" },
        ]}
      />
      <GlassCard interactive={false}>
        <CardContent>
          {r.items.length === 0 ? (
            <EmptyState icon={<ListChecks className="size-5" />} title="No results match">Submitted attempts appear here.</EmptyState>
          ) : (
            <ResultsTable
              canPublish={can(viewer, "PUBLISH_RESULTS")}
              rows={r.items.map((x) => {
                const p = people.get(x.candidateKey);
                return {
                  id: x._id,
                  candidate: p?.exists ? p.name : "Unknown person",
                  kind: labelOf(CANDIDATE_KINDS, x.candidate.kind),
                  context: p?.departmentName ?? p?.positionTitle ?? p?.batchNames.join(", ") ?? "",
                  test: x.testName,
                  testId: x.testId,
                  attemptNo: x.attemptNo,
                  submitted: x.submittedAt ? formatDateTime(x.submittedAt) : "—",
                  reason: x.submitReason,
                  status: x.status,
                  score: x.result ? `${fmtMarks(x.result.finalScore)}/${fmtMarks(x.result.totalMarks)}` : "—",
                  pct: x.result ? fmtPct(x.result.percentage) : "—",
                  passed: x.result?.passed ?? null,
                  provisional: !!x.result?.provisional,
                  released: !!x.resultPublishedAt,
                  pending: x.result?.pending ?? 0,
                  violations: x.violations ?? 0,
                };
              })}
            />
          )}
        </CardContent>
      </GlassCard>
      <Pager page={r.page} totalPages={r.totalPages} total={r.total} noun="attempts" href={(p) => qsHref("/evaliq/results", sp, { page: String(p) })} />
    </div>
  );
}
