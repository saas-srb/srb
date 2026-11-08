import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Copy, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import QuestionRenderer from "@/components/products/evaliq/QuestionRenderer";
import { PageHeader, SectionCard, Chip, Stat } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { getQuestion, questionUsage } from "@/lib/products/evaliq/questions";
import { categoryMap } from "@/lib/products/evaliq/categories";
import { listAudit, AUDIT_ACTION_LABEL } from "@/lib/products/evaliq/audit";
import { QUESTION_TYPES, seededRng } from "@/lib/products/evaliq/question-types";
import { QUESTION_DIFFICULTIES, QUESTION_STATUSES, labelOf } from "@/lib/products/evaliq/constants";
import { deleteQuestionAction, duplicateQuestionAction, setQuestionStatusAction } from "@/app/(products)/evaliq/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export default async function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_QUESTIONS")) redirect("/evaliq");
  const { id } = await params;
  const q = await getQuestion(id);
  if (!q) notFound();
  const spec = QUESTION_TYPES[q.type];
  const [usage, cats, trail] = await Promise.all([questionUsage([id]), categoryMap("question"), listAudit({ entityId: id, pageSize: 10 })]);
  const u = usage.get(id)!;
  const view = spec.publicDefinition(q.definition, { shuffle: false, rng: seededRng(1) });

  return (
    <div className="space-y-4">
      <PageHeader
        title={q.code}
        crumbs={[{ label: "Question Bank", href: "/evaliq/questions" }, { label: q.code }]}
        description={`${spec.label} · ${labelOf(QUESTION_DIFFICULTIES, q.difficulty)} · version ${q.version}`}
        actions={
          <>
            {can(viewer, "EDIT_QUESTION") && (
              <Button size="sm" nativeButton={false} render={<Link href={`/evaliq/questions/${id}/edit`} />}>
                <Pencil className="size-3.5" /> Edit
              </Button>
            )}
            {can(viewer, "CREATE_QUESTION") && (
              <ActionButton action={duplicateQuestionAction.bind(null, id)} success="Duplicated as a draft" redirectPrefix="/evaliq/questions/">
                <Copy className="size-3.5" /> Duplicate
              </ActionButton>
            )}
            {can(viewer, "EDIT_QUESTION") &&
              (q.status === "archived" ? (
                <ActionButton action={setQuestionStatusAction.bind(null, id, "active")} success="Restored">
                  <ArchiveRestore className="size-3.5" /> Restore
                </ActionButton>
              ) : (
                <ActionButton action={setQuestionStatusAction.bind(null, id, "archived")} success="Archived" confirm={{ title: "Archive this question?", description: "It stays in tests that picked it by hand and in past results; automatic rules stop drawing it.", confirmLabel: "Archive" }}>
                  <Archive className="size-3.5" /> Archive
                </ActionButton>
              ))}
            {can(viewer, "DELETE_QUESTION") && (
              <ActionButton action={deleteQuestionAction.bind(null, id)} variant="destructive" success="Question deleted" redirectTo="/evaliq/questions" confirm={{ title: "Delete this question?", description: "Only possible while no test selects it by hand. Past results keep their own copy.", confirmLabel: "Delete" }}>
                <Trash2 className="size-3.5" /> Delete
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SectionCard title="Preview" description="Exactly what a candidate sees (options appear in this order unless the test shuffles them).">
            <QuestionRenderer prompt={q.prompt} media={q.media} view={view} response={null} readOnly inputId={`q-${id}`} />
          </SectionCard>
          <SectionCard title="Answer key">
            <p className="text-sm whitespace-pre-wrap">{spec.correctAnswer(q.definition)}</p>
            {q.explanation && (
              <div className="mt-3 rounded-xl bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Explanation</p>
                <p className="whitespace-pre-wrap">{q.explanation}</p>
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">{spec.autoGradable(q.definition) ? "Graded automatically." : "Evaluated manually — appears in the evaluation queue after submission."}</p>
          </SectionCard>
        </div>
        <div className="space-y-4 self-start">
          <SectionCard title="Details">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Marks" value={q.marks} hint={q.negativeMarks ? `−${q.negativeMarks} if wrong` : "No negative"} />
              <Stat label="Status" value={<span className="text-base">{labelOf(QUESTION_STATUSES, q.status)}</span>} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Category</dt><dd>{q.categoryId ? cats.get(q.categoryId) ?? "—" : "Uncategorised"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Subject</dt><dd>{q.subject || "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Topic</dt><dd>{q.topic || "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Updated</dt><dd>{formatDateTime(q.updatedAt)}</dd></div>
            </dl>
            {q.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{q.tags.map((t) => <Chip key={t}>{t}</Chip>)}</div>}
          </SectionCard>
          <SectionCard title={`Used in ${u.tests.length} test${u.tests.length === 1 ? "" : "s"}`} description={`Answered ${u.attempts} time${u.attempts === 1 ? "" : "s"} in attempts (manual picks and automatic draws).`}>
            {u.tests.length === 0 ? (
              <p className="text-xs text-muted-foreground">No test selects this question by hand. Automatic rules may still draw it.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {u.tests.map((t) => (
                  <li key={t.id}>
                    <Link href={`/evaliq/tests/${t.id}`} className="hover:text-primary">{t.name}</Link> <span className="text-[11px] text-muted-foreground">{t.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="History">
            <ul className="space-y-1.5 text-xs">
              {trail.items.length === 0 && <li className="text-muted-foreground">No recorded changes.</li>}
              {trail.items.map((a) => (
                <li key={a._id}>
                  <span className="font-medium">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span> <span className="text-muted-foreground">{`by ${a.actorEmail ?? a.actorId} · ${formatDateTime(a.createdAt)}`}</span>
                  {a.summary && <p className="text-muted-foreground">{a.summary}</p>}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
