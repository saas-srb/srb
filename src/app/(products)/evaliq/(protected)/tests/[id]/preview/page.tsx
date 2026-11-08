import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuestionRenderer from "@/components/products/evaliq/QuestionRenderer";
import TestStepper from "@/components/products/evaliq/TestStepper";
import TestActions from "@/components/products/evaliq/TestActions";
import { PageHeader, SectionCard, Notice, Chip, Stat } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { effectiveTestStatus, getTest, summarizeTest } from "@/lib/products/evaliq/tests";
import { buildPaper, newPreviewSeed } from "@/lib/products/evaliq/paper";
import { QUESTION_TYPES } from "@/lib/products/evaliq/question-types";
import { OTS_PERMISSIONS } from "@/lib/ots-roles";
import { labelOf, RESULT_RELEASES, RESULT_DETAILS, QUESTION_DIFFICULTIES } from "@/lib/products/evaliq/constants";
import type { PaperItem } from "@/lib/products/evaliq/attempt-types";

export default async function TestPreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ seed?: string; key?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_TESTS")) redirect("/evaliq");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTest(id);
  if (!t) notFound();
  const summary = await summarizeTest(t);
  const seed = Number(sp.seed) || newPreviewSeed();
  let paper: PaperItem[] = [];
  let error: string | null = null;
  try {
    paper = summary.issues.length ? [] : await buildPaper(t, seed);
  } catch (err) {
    error = (err as Error).message;
  }
  const showKey = sp.key === "1";
  const perms = Object.fromEntries(OTS_PERMISSIONS.map((p) => [p, can(viewer, p)]));
  const status = effectiveTestStatus(t);
  const total = paper.reduce((s, p) => s + p.marks, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Preview · ${t.name}`}
        crumbs={[{ label: "Tests", href: "/evaliq/tests" }, { label: t.code, href: `/evaliq/tests/${id}` }, { label: "Preview" }]}
        description="A sample paper generated exactly as for a candidate (random draws and shuffles included). Nothing is saved."
        actions={<TestActions id={id} name={t.name} status={status} perms={perms} hide={["preview"]} />}
      />
      {can(viewer, "EDIT_TEST") && <TestStepper testId={id} current="preview" published={status !== "draft"} />}
      {summary.issues.length > 0 && (
        <Notice tone="error">
          <p className="font-semibold">Fix before this test can be published or taken:</p>
          <ul className="mt-1 list-disc pl-5">{summary.issues.map((m) => <li key={m}>{m}</li>)}</ul>
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Questions served" value={paper.length || summary.servedCount} />
        <Stat label="Total marks (this sample)" value={Math.round(total * 100) / 100 || summary.totalMarks} hint={summary.marksVary ? "Varies per attempt" : undefined} />
        <Stat label="Duration" value={t.config.durationMinutes ? `${t.config.durationMinutes} min` : "Untimed"} hint={t.config.durationMinutes ? (t.config.autoSubmit ? "Auto-submits" : "Advisory timer") : undefined} />
        <Stat label="Pass mark" value={t.config.passMode === "percentage" ? `${t.config.passingPercentage}%` : `${t.config.passingMarks} marks`} hint={`${labelOf(RESULT_RELEASES, t.config.resultRelease)} · ${labelOf(RESULT_DETAILS, t.config.resultDetail)}`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/evaliq/tests/${id}/preview${showKey ? "?key=1" : ""}`} />}>
          <Shuffle className="size-3.5" /> Generate another sample
        </Button>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/evaliq/tests/${id}/preview?seed=${seed}${showKey ? "" : "&key=1"}`} />}>
          {showKey ? "Hide answer key" : "Show answer key"}
        </Button>
      </div>
      {t.sections.map((sec, si) => {
        const items = paper.map((p, i) => ({ p, i })).filter((x) => x.p.section === si);
        if (items.length === 0) return null;
        return (
          <SectionCard key={sec.id} title={`${sec.title}`} description={[sec.description, sec.timeLimitMinutes ? `${sec.timeLimitMinutes} min` : null, `${items.length} questions`].filter(Boolean).join(" · ")}>
            <ol className="space-y-6">
              {items.map(({ p, i }) => (
                <li key={`${p.qid}-${i}`} className="space-y-2 border-b border-border/40 pb-5 last:border-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{`Q${i + 1}.`}</span>
                    <Chip>{QUESTION_TYPES[p.type].label}</Chip>
                    <Chip>{labelOf(QUESTION_DIFFICULTIES, p.difficulty)}</Chip>
                    <Chip tone="blue">{`${p.marks} mark${p.marks === 1 ? "" : "s"}`}</Chip>
                    {p.negativeMarks > 0 && <Chip tone="rose">{`−${p.negativeMarks} if wrong`}</Chip>}
                    <span className="font-mono">{p.code}</span>
                  </div>
                  <QuestionRenderer prompt={p.prompt} media={p.media} view={p.view} response={null} readOnly inputId={`pv-${i}`} />
                  {showKey && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">{`Answer: ${QUESTION_TYPES[p.type].correctAnswer(p.definition)}`}</p>}
                </li>
              ))}
            </ol>
          </SectionCard>
        );
      })}
    </div>
  );
}
