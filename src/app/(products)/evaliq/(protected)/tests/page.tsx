import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, FileCheck2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import { PageHeader, EmptyState, TestStatusBadge, Chip, Pager, qsHref } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { effectiveTestStatus, listTests } from "@/lib/products/evaliq/tests";
import { categoryMap, listCategories } from "@/lib/products/evaliq/categories";
import { getDirectory } from "@/lib/products/evaliq/people";
import { findAssignments } from "@/lib/products/evaliq/assignments";
import { DIFFICULTIES, TEST_STATUSES, TEST_TYPES, fmtPct, labelOf } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";

export default async function TestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_TESTS")) redirect("/evaliq");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const [r, cats, catNames, dir] = await Promise.all([
    listTests({ q: sp.q, status: sp.status, categoryId: sp.categoryId, testType: sp.testType, difficulty: sp.difficulty, departmentId: sp.departmentId, page }),
    listCategories("test"),
    categoryMap("test"),
    getDirectory(),
  ]);
  const asg = r.items.length ? await findAssignments({ testId: { $in: r.items.map((t) => t._id) } }) : [];
  const stats = new Map<string, { n: number; done: number; pcts: number[] }>();
  for (const a of asg) {
    const cur = stats.get(a.testId) ?? { n: 0, done: 0, pcts: [] };
    cur.n += 1;
    if (["completed", "evaluated", "submitted"].includes(a.status)) cur.done += 1;
    if (a.result) cur.pcts.push(a.result.percentage);
    stats.set(a.testId, cur);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tests"
        crumbs={[{ label: "Tests" }]}
        description={`${r.total} test${r.total === 1 ? "" : "s"}. Practice tests, assessments, examinations, mock, screening, certification, training and interview tests — all built on one engine.`}
        actions={
          can(viewer, "CREATE_TEST") && (
            <Button nativeButton={false} render={<Link href="/evaliq/tests/new" />}>
              <Plus className="size-4" /> New test
            </Button>
          )
        }
      />
      <SmmsFilterBar
        values={{ q: sp.q ?? "", status: sp.status ?? "", testType: sp.testType ?? "", categoryId: sp.categoryId ?? "", difficulty: sp.difficulty ?? "", departmentId: sp.departmentId ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Name, code, subject, tag" },
          { key: "status", label: "Status", type: "select", options: [...TEST_STATUSES.map((s) => ({ value: s.value, label: s.label })), { value: "all", label: "All incl. archived" }], allLabel: "All but archived" },
          { key: "testType", label: "Type", type: "select", options: TEST_TYPES.map((t) => ({ value: t.value, label: t.label })) },
          { key: "categoryId", label: "Category", type: "select", options: cats.map((c) => ({ value: c._id, label: c.name })) },
          { key: "difficulty", label: "Difficulty", type: "select", options: DIFFICULTIES.map((d) => ({ value: d.value, label: d.label })) },
          { key: "departmentId", label: "Department", type: "select", options: dir.departments },
        ]}
      />
      <GlassCard interactive={false}>
        <CardContent>
          {r.items.length === 0 ? (
            <EmptyState icon={<FileCheck2 className="size-5" />} title="No tests here">{can(viewer, "CREATE_TEST") ? "Create a test, add questions from the bank, publish it and assign it." : "Tests your team creates will appear here."}</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Type · Category</TableHead>
                  <TableHead className="text-right">Questions</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Assigned / Done</TableHead>
                  <TableHead className="text-right">Avg %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.items.map((t) => {
                  const st = stats.get(t._id);
                  const avg = st && st.pcts.length ? st.pcts.reduce((a, b) => a + b, 0) / st.pcts.length : null;
                  return (
                    <TableRow key={t._id}>
                      <TableCell className="max-w-xs">
                        <Link href={`/evaliq/tests/${t._id}`} className="font-medium hover:text-primary">{t.name}</Link>
                        <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <span className="font-mono">{t.code}</span>
                          {t.subject && <span>{`· ${t.subject}`}</span>}
                          {t.certificate.enabled && <Chip tone="violet">cert</Chip>}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {labelOf(TEST_TYPES, t.testType)}
                        <p className="text-[11px] text-muted-foreground">{t.categoryId ? catNames.get(t.categoryId) : "—"}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.paperStats ? t.paperStats.servedCount : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.paperStats ? `${t.paperStats.marksVary ? "≈" : ""}${t.paperStats.totalMarks}` : "—"}</TableCell>
                      <TableCell className="text-xs">{t.config.durationMinutes ? `${t.config.durationMinutes} min` : "Untimed"}</TableCell>
                      <TableCell className="text-[11px] whitespace-nowrap text-muted-foreground">{t.config.startAt || t.config.endAt ? `${t.config.startAt ? formatDateTime(t.config.startAt) : "Now"} → ${t.config.endAt ? formatDateTime(t.config.endAt) : "∞"}` : "Always"}</TableCell>
                      <TableCell><TestStatusBadge status={effectiveTestStatus(t)} /></TableCell>
                      <TableCell className="text-right tabular-nums">{st ? `${st.n} / ${st.done}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(avg)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>
      <Pager page={r.page} totalPages={r.totalPages} total={r.total} noun="tests" href={(p) => qsHref("/evaliq/tests", sp, { page: String(p) })} />
    </div>
  );
}
