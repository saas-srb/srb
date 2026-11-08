import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Library, Upload, Download, Rows3, Copy, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import { PageHeader, EmptyState, Chip, Pager, qsHref } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { listQuestions, questionFacets, questionUsage } from "@/lib/products/evaliq/questions";
import { categoryMap, listCategories } from "@/lib/products/evaliq/categories";
import { QUESTION_GROUPS, QUESTION_TYPE_LIST, questionTypeLabel } from "@/lib/products/evaliq/question-types";
import { QUESTION_DIFFICULTIES, QUESTION_STATUSES, labelOf } from "@/lib/products/evaliq/constants";
import { duplicateQuestionAction, setQuestionStatusAction } from "@/app/(products)/evaliq/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_QUESTIONS")) redirect("/evaliq");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const [r, cats, catNames, facets] = await Promise.all([
    listQuestions({ q: sp.q, type: sp.type, categoryId: sp.categoryId, difficulty: sp.difficulty, status: sp.status, subject: sp.subject, tag: sp.tag, sort: sp.sort, page }),
    listCategories("question"),
    categoryMap("question"),
    questionFacets(),
  ]);
  const usage = await questionUsage(r.items.map((q) => q._id));
  const exportQs = new URLSearchParams(Object.entries({ q: sp.q, type: sp.type, categoryId: sp.categoryId, difficulty: sp.difficulty, status: sp.status, subject: sp.subject }).filter((e): e is [string, string] => !!e[1])).toString();
  const canEdit = can(viewer, "EDIT_QUESTION");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Question Bank"
        crumbs={[{ label: "Question Bank" }]}
        description={`${r.total} question${r.total === 1 ? "" : "s"} — one reusable repository for every test. Tests pick questions by hand or draw them automatically by difficulty, category, subject or tag.`}
        actions={
          <>
            {can(viewer, "EXPORT_QUESTIONS") && (
              <>
                <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/evaliq/export/questions?format=csv${exportQs ? `&${exportQs}` : ""}`} />}>
                  <Download className="size-3.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/evaliq/export/questions?format=xlsx${exportQs ? `&${exportQs}` : ""}`} />}>
                  <Download className="size-3.5" /> Excel
                </Button>
              </>
            )}
            {can(viewer, "IMPORT_QUESTIONS") && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/evaliq/questions/import" />}>
                <Upload className="size-3.5" /> Import
              </Button>
            )}
            {can(viewer, "CREATE_QUESTION") && (
              <>
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/evaliq/questions/bulk" />}>
                  <Rows3 className="size-3.5" /> Bulk create
                </Button>
                <Button size="sm" nativeButton={false} render={<Link href="/evaliq/questions/new" />}>
                  <Plus className="size-3.5" /> New question
                </Button>
              </>
            )}
          </>
        }
      />
      <SmmsFilterBar
        values={{ q: sp.q ?? "", type: sp.type ?? "", categoryId: sp.categoryId ?? "", difficulty: sp.difficulty ?? "", subject: sp.subject ?? "", tag: sp.tag ?? "", status: sp.status ?? "", sort: sp.sort ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Text, code, subject, tag" },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: [...QUESTION_GROUPS.map((g) => ({ value: `group:${g.value}`, label: `All ${g.label}` })), ...QUESTION_TYPE_LIST.map((t) => ({ value: t.value, label: t.label }))],
          },
          { key: "categoryId", label: "Category", type: "select", options: [{ value: "none", label: "Uncategorised" }, ...cats.map((c) => ({ value: c._id, label: c.name }))] },
          { key: "difficulty", label: "Difficulty", type: "select", options: QUESTION_DIFFICULTIES.map((d) => ({ value: d.value, label: d.label })) },
          { key: "subject", label: "Subject", type: "select", options: facets.subjects.map((s) => ({ value: s, label: s })) },
          { key: "tag", label: "Tag", type: "select", options: facets.tags.map((s) => ({ value: s, label: s })) },
          { key: "status", label: "Status", type: "select", options: [...QUESTION_STATUSES.map((s) => ({ value: s.value, label: s.label })), { value: "all", label: "All incl. archived" }], allLabel: "Active & draft" },
          { key: "sort", label: "Sort", type: "select", options: [{ value: "created", label: "Newest" }, { value: "code", label: "Code" }, { value: "marks", label: "Marks" }, { value: "difficulty", label: "Difficulty" }], allLabel: "Recently updated" },
        ]}
      />
      <GlassCard interactive={false}>
        <CardContent>
          {r.items.length === 0 ? (
            <EmptyState icon={<Library className="size-5" />} title="No questions match">
              {can(viewer, "CREATE_QUESTION") ? "Create one, bulk-create several, or import a CSV / Excel file." : "Questions your team writes will appear here."}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category · Subject</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.items.map((q) => {
                  const u = usage.get(q._id);
                  return (
                    <TableRow key={q._id}>
                      <TableCell className="max-w-md">
                        <Link href={`/evaliq/questions/${q._id}`} className="line-clamp-2 font-medium whitespace-normal hover:text-primary">{q.prompt}</Link>
                        <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <span className="font-mono">{q.code}</span>
                          {q.status !== "active" && <Chip tone={q.status === "archived" ? "rose" : "amber"}>{labelOf(QUESTION_STATUSES, q.status)}</Chip>}
                          {q.media && <Chip tone="violet">{q.media.kind}</Chip>}
                          {q.tags.slice(0, 3).map((t) => <Chip key={t}>{t}</Chip>)}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">{questionTypeLabel(q.type)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{[q.categoryId ? catNames.get(q.categoryId) : null, q.subject, q.topic].filter(Boolean).join(" · ") || "—"}</TableCell>
                      <TableCell className="text-xs">{labelOf(QUESTION_DIFFICULTIES, q.difficulty)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {q.marks}
                        {q.negativeMarks > 0 && <span className="text-[11px] text-rose-500">{` −${q.negativeMarks}`}</span>}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className={u && u.tests.length ? "font-medium text-foreground" : "text-muted-foreground"}>{`Used in ${u?.tests.length ?? 0} test${u?.tests.length === 1 ? "" : "s"}`}</span>
                        {u && u.attempts > 0 && <p className="text-[11px] text-muted-foreground">{`${u.attempts} time${u.attempts === 1 ? "" : "s"} answered`}</p>}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(q.updatedAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button size="icon-sm" variant="ghost" aria-label="Edit" nativeButton={false} render={<Link href={`/evaliq/questions/${q._id}/edit`} />}>
                              <Pencil className="size-3.5" />
                            </Button>
                          )}
                          {can(viewer, "CREATE_QUESTION") && (
                            <ActionButton action={duplicateQuestionAction.bind(null, q._id)} variant="ghost" size="icon-sm" success="Duplicated as a draft" redirectPrefix="/evaliq/questions/" aria-label="Duplicate">
                              <Copy className="size-3.5" />
                            </ActionButton>
                          )}
                          {canEdit &&
                            (q.status === "archived" ? (
                              <ActionButton action={setQuestionStatusAction.bind(null, q._id, "active")} variant="ghost" size="icon-sm" success="Restored" aria-label="Restore">
                                <ArchiveRestore className="size-3.5" />
                              </ActionButton>
                            ) : (
                              <ActionButton action={setQuestionStatusAction.bind(null, q._id, "archived")} variant="ghost" size="icon-sm" success="Archived" aria-label="Archive" confirm={{ title: `Archive ${q.code}?`, description: "Archived questions stay in the tests that picked them by hand and in past results, but automatic selection rules stop drawing them.", confirmLabel: "Archive" }}>
                                <Archive className="size-3.5" />
                              </ActionButton>
                            ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>
      <Pager page={r.page} totalPages={r.totalPages} total={r.total} noun="questions" href={(p) => qsHref("/evaliq/questions", sp, { page: String(p) })} />
    </div>
  );
}
