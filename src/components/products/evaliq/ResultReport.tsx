"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, CircleDashed, CircleSlash, Filter } from "lucide-react";
import QuestionRenderer from "@/components/products/evaliq/QuestionRenderer";
import MarkItemForm from "@/components/products/evaliq/MarkItemForm";
import { SectionCard, Stat, Notice, Chip, PassBadge } from "@/components/products/evaliq/OtsUi";
import { SUBMIT_REASONS, fmtDuration, fmtMarks, fmtPct } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";
import type { ResultView } from "@/lib/products/evaliq/attempts";

const STATUS: Record<string, { label: string; icon: React.ReactNode; tone: "green" | "rose" | "amber" | "slate" | "violet" }> = {
  correct: { label: "Correct", icon: <CheckCircle2 className="size-3.5" />, tone: "green" },
  incorrect: { label: "Incorrect", icon: <XCircle className="size-3.5" />, tone: "rose" },
  partial: { label: "Partially correct", icon: <MinusCircle className="size-3.5" />, tone: "amber" },
  unanswered: { label: "Not answered", icon: <CircleSlash className="size-3.5" />, tone: "slate" },
  pending: { label: "Pending evaluation", icon: <CircleDashed className="size-3.5" />, tone: "violet" },
};

/** One attempt's result — candidates see what the test allows; evaluators get marking controls. */
export default function ResultReport({ view, candidateName, evaluator }: { view: ResultView; candidateName?: string; evaluator?: { canEvaluate: boolean; canOverride: boolean; negatives: number[] } }) {
  const r = view.result;
  const [filter, setFilter] = useState<"all" | "correct" | "incorrect" | "unanswered">("all");

  const correctCount = view.items.filter((i) => i.status === "correct").length;
  const incorrectCount = view.items.filter((i) => i.status === "incorrect").length;
  const unansweredCount = view.items.filter((i) => i.status === "unanswered").length;

  const filteredItems = view.items.filter((i) => {
    if (filter === "correct") return i.status === "correct";
    if (filter === "incorrect") return i.status === "incorrect";
    if (filter === "unanswered") return i.status === "unanswered";
    return true;
  });

  return (
    <div className="space-y-4">
      {!view.visible && <Notice>{view.hiddenReason}</Notice>}
      {view.submitReason && view.submitReason !== "MANUAL" && <Notice tone="warn">{`${SUBMIT_REASONS[view.submitReason]} (${view.submitReason}).`}</Notice>}
      {r && (
        <>
          {r.provisional && <Notice tone="warn">{`${r.pending} answer${r.pending === 1 ? " is" : "s are"} still being evaluated — the score below is provisional and pass/fail is decided once evaluation finishes.`}</Notice>}
          <SectionCard title="Result" description={`${candidateName ? `${candidateName} · ` : ""}Attempt ${view.attemptNo} · started ${formatDateTime(view.startedAt)}${view.submittedAt ? ` · submitted ${formatDateTime(view.submittedAt)}` : ""}`} action={<PassBadge passed={r.passed} provisional={r.provisional} />}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <Stat label="Score" value={`${fmtMarks(r.finalScore)} / ${fmtMarks(r.totalMarks)}`} tone={r.provisional ? "warn" : r.passed ? "ok" : "danger"} />
              <Stat label="Percentage" value={fmtPct(r.percentage)} />
              <Stat label="Time taken" value={fmtDuration(r.timeTakenSec)} />
              <Stat label="Questions" value={r.totalQuestions} hint={`${r.attempted} attempted`} />
              <Stat label="Correct" value={r.correct} hint={r.partial ? `+${r.partial} partial` : undefined} tone="ok" />
              <Stat label="Incorrect / Skipped" value={`${r.incorrect} / ${r.unanswered}`} tone={r.incorrect ? "danger" : undefined} />
              <Stat label="Marks earned" value={fmtMarks(r.marksObtained)} />
              <Stat label="Negative marks" value={fmtMarks(r.negativeMarks)} tone={r.negativeMarks < 0 ? "danger" : undefined} />
              {r.pending > 0 && <Stat label="Pending evaluation" value={r.pending} tone="warn" />}
            </div>
          </SectionCard>
          {r.sections.length > 0 && (
            <SectionCard title="Section-wise performance">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 font-medium">Section</th>
                      <th className="py-1 text-right font-medium">Score</th>
                      <th className="py-1 text-right font-medium">Percentage</th>
                      <th className="py-1 text-right font-medium">Correct</th>
                      <th className="py-1 text-right font-medium">Incorrect</th>
                      <th className="py-1 text-right font-medium">Skipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.sections.map((s) => (
                      <tr key={s.index} className="border-t border-border/40">
                        <td className="py-1.5">{s.title}</td>
                        <td className="py-1.5 text-right tabular-nums">{`${fmtMarks(s.obtained)}/${fmtMarks(s.total)}`}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          <span className="inline-flex items-center gap-2">
                            <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:inline-block"><span className="block h-full bg-primary" style={{ width: `${Math.min(100, s.percentage)}%` }} /></span>
                            {fmtPct(s.percentage)}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{s.correct}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.incorrect}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.unanswered}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
      {view.items.length > 0 && (
        <SectionCard title="Answers & Question Review" description="Review your submitted answers alongside correct solutions and explanations.">
          <div className="mb-4"><PanelTabs label="Answer filter" active={filter} onSelect={(k) => setFilter(k as typeof filter)} tabs={[{ key: "all", label: "All", count: view.items.length }, { key: "correct", label: "Correct", count: correctCount }, { key: "incorrect", label: "Incorrect", count: incorrectCount }, { key: "unanswered", label: "Unanswered", count: unansweredCount }]} /></div>

          <ol className="space-y-6">
            {filteredItems.map((it) => {
              const st = STATUS[it.status] ?? STATUS.pending;
              return (
                <li key={it.index} className="space-y-3 rounded-xl border border-border/50 bg-background/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                      <span className="font-bold text-foreground text-sm">{`Q${it.index + 1}.`}</span>
                      <Chip>{it.typeLabel}</Chip>
                      <Chip tone={st.tone}>
                        <span className="mr-1">{st.icon}</span>
                        {st.label}
                      </Chip>
                      {view.sections.length > 1 && <span>{view.sections[it.section]}</span>}
                      {it.timeSec > 0 && <span>{`· ${fmtDuration(it.timeSec)}`}</span>}
                      {evaluator && <span className="font-mono">{it.code}</span>}
                    </div>
                    <div className="font-semibold">
                      Marks: <span className={it.status === "correct" ? "text-emerald-600 dark:text-emerald-400" : it.status === "incorrect" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}>{`${it.awarded === null ? "—" : fmtMarks(it.awarded)} / ${fmtMarks(it.marks)}`}</span>
                    </div>
                  </div>

                  <QuestionRenderer prompt={it.prompt} media={it.media} view={it.view} response={it.response} readOnly inputId={`r-${it.index}`} outcomeStatus={it.status} />

                  {it.responseText && (
                    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
                      <span className="font-bold text-foreground">Your Submitted Answer: </span>
                      <span className={it.status === "correct" ? "text-emerald-700 dark:text-emerald-300 font-medium" : it.status === "incorrect" ? "text-rose-700 dark:text-rose-300 font-medium" : "text-foreground"}>
                        {it.responseText}
                      </span>
                    </div>
                  )}

                  {it.correctAnswer && (
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
                      <span className="font-bold">Correct Answer: </span>
                      <span>{it.correctAnswer}</span>
                    </div>
                  )}

                  {it.explanation && (
                    <div className="rounded-lg bg-muted/60 border border-border/50 px-3 py-2 text-xs text-foreground whitespace-pre-wrap">
                      <span className="font-bold text-muted-foreground block mb-0.5">Explanation:</span>
                      {it.explanation}
                    </div>
                  )}

                  {it.comment && <div className="rounded-lg bg-primary/5 px-3 py-2 text-xs">{`Evaluator: ${it.comment}`}</div>}

                  {evaluator && (evaluator.canEvaluate || evaluator.canOverride) && view.status !== "in_progress" && (
                    <MarkItemForm key={`${it.index}-${it.status}-${it.awarded}`} attemptId={view.attemptId} index={it.index} max={it.marks} min={-(evaluator.negatives[it.index] ?? 0)} current={it.awarded} comment={it.comment} pending={it.status === "pending" && evaluator.canEvaluate} override={evaluator.canOverride} />
                  )}
                </li>
              );
            })}
            {filteredItems.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No questions match the selected filter.</p>
            )}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}
