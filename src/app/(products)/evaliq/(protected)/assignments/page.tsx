import Link from "next/link";
import { redirect } from "next/navigation";
import { Send, Download } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import AssignmentRowActions from "@/components/products/evaliq/AssignmentRowActions";
import { PageHeader, EmptyState, AssignmentStatusBadge, Chip, Pager, qsHref, PassBadge, Notice } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { expireOverdue, getDispatch, listAssignments } from "@/lib/products/evaliq/assignments";
import { describeCandidates } from "@/lib/products/evaliq/people";
import { listTestOptions, testNames } from "@/lib/products/evaliq/tests";
import { ASSIGNMENT_STATUSES, CANDIDATE_KINDS, PRIORITIES, fmtPct, labelOf } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_ASSIGNMENTS")) redirect("/evaliq");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  await expireOverdue();
  const [r, tests, dispatch] = await Promise.all([
    listAssignments({ q: sp.q, testId: sp.testId, status: sp.status, kind: sp.kind, dispatchId: sp.dispatchId, priority: sp.priority, from: sp.from, to: sp.to, page }),
    listTestOptions(),
    sp.dispatchId ? getDispatch(sp.dispatchId) : Promise.resolve(null),
  ]);
  const [people, names] = await Promise.all([describeCandidates(r.items.map((a) => a.candidate)), testNames(r.items.map((a) => a.testId))]);
  const exportQs = new URLSearchParams(Object.entries({ q: sp.q, testId: sp.testId, status: sp.status, kind: sp.kind, from: sp.from, to: sp.to }).filter((e): e is [string, string] => !!e[1])).toString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Test Assignments"
        crumbs={[{ label: "Test Assignments" }]}
        description={`${r.total} assignment${r.total === 1 ? "" : "s"}. Assigned → In Progress → Submitted → Evaluated → Completed, or Expired.`}
        actions={
          <>
            {can(viewer, "EXPORT_REPORTS") && (
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/evaliq/export/results?format=xlsx${exportQs ? `&${exportQs}` : ""}`} />}>
                <Download className="size-3.5" /> Export
              </Button>
            )}
            {can(viewer, "ASSIGN_TEST") && (
              <Button nativeButton={false} render={<Link href={`/evaliq/assignments/new${sp.testId ? `?testId=${sp.testId}` : ""}`} />}>
                <Send className="size-4" /> Assign test
              </Button>
            )}
          </>
        }
      />
      {dispatch && <Notice>{`Showing one assignment batch: ${dispatch.targetSummary} — ${dispatch.created} assigned${dispatch.skipped ? `, ${dispatch.skipped} skipped as duplicates / excluded` : ""} on ${formatDateTime(dispatch.createdAt)}.`}</Notice>}
      <SmmsFilterBar
        values={{ q: sp.q ?? "", testId: sp.testId ?? "", status: sp.status ?? "", kind: sp.kind ?? "", priority: sp.priority ?? "", from: sp.from ?? "", to: sp.to ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Candidate name" },
          { key: "testId", label: "Test", type: "select", options: tests },
          { key: "status", label: "Status", type: "select", options: [{ value: "open", label: "Open (assigned + in progress)" }, { value: "finished", label: "Finished" }, ...ASSIGNMENT_STATUSES.map((s) => ({ value: s.value, label: s.label }))] },
          { key: "kind", label: "User type", type: "select", options: CANDIDATE_KINDS.map((k) => ({ value: k.value, label: k.label })) },
          { key: "priority", label: "Priority", type: "select", options: PRIORITIES.map((p) => ({ value: p.value, label: p.label })) },
          { key: "from", label: "Assigned from", type: "date" },
          { key: "to", label: "Assigned to", type: "date" },
        ]}
      />
      <GlassCard interactive={false}>
        <CardContent>
          {r.items.length === 0 ? (
            <EmptyState icon={<Send className="size-5" />} title="No assignments match">Assign a published test to people from TalentOS, Careers or Cohort AI.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.items.map((a) => {
                  const p = people.get(a.candidateKey);
                  return (
                    <TableRow key={a._id}>
                      <TableCell className="max-w-[220px]">
                        <p className="truncate font-medium">{p?.exists ? p.name : a.candidateLabel}</p>
                        <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <Chip>{labelOf(CANDIDATE_KINDS, a.candidate.kind)}</Chip>
                          <span className="truncate">{p?.departmentName ?? p?.positionTitle ?? p?.batchNames.join(", ") ?? p?.email ?? ""}</span>
                          {p && !p.hasLogin && <Chip tone="amber">no login yet</Chip>}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[200px] text-sm">
                        <Link href={`/evaliq/tests/${a.testId}`} className="line-clamp-2 hover:text-primary">{names.get(a.testId)?.name ?? "—"}</Link>
                        {a.priority !== "normal" && <Chip tone={a.priority === "urgent" ? "rose" : a.priority === "high" ? "amber" : "slate"}>{labelOf(PRIORITIES, a.priority)}</Chip>}
                      </TableCell>
                      <TableCell><AssignmentStatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-[11px] whitespace-nowrap text-muted-foreground">
                        {a.startAt && <p>{`From ${formatDateTime(a.startAt)}`}</p>}
                        <p>{a.dueAt ? `Due ${formatDateTime(a.dueAt)}` : "No due date"}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{`${a.attemptsUsed}${a.extraAttempts ? ` (+${a.extraAttempts} extra)` : ""}`}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.result ? `${a.result.score}/${a.result.total} · ${fmtPct(a.result.percentage)}` : "—"}</TableCell>
                      <TableCell>
                        {a.result ? (
                          <Link href={a.result.attemptId ? `/evaliq/results/${a.result.attemptId}` : `/evaliq/results?q=${encodeURIComponent(a.candidateLabel)}&testId=${a.testId}`}>
                            <PassBadge passed={a.result.passed} />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <AssignmentRowActions
                          a={{ id: a._id, label: p?.exists ? p.name : a.candidateLabel, status: a.status, startAt: a.startAt?.toISOString() ?? null, dueAt: a.dueAt?.toISOString() ?? null, maxAttempts: a.maxAttempts, priority: a.priority, instructions: a.instructions, allowLateStart: a.allowLateStart }}
                          canEdit={can(viewer, "EDIT_ASSIGNMENT")}
                          canCancel={can(viewer, "CANCEL_ASSIGNMENT")}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>
      <Pager page={r.page} totalPages={r.totalPages} total={r.total} noun="assignments" href={(p) => qsHref("/evaliq/assignments", sp, { page: String(p) })} />
    </div>
  );
}
