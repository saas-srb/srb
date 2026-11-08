"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Search, Wand2, ListPlus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { previewSectionsAction, saveTestSectionsAction, searchQuestionsAction, type QuestionLite } from "@/app/(products)/evaliq/(protected)/actions";
import { QUESTION_DIFFICULTIES, labelOf } from "@/lib/products/evaliq/constants";
import { QUESTION_TYPE_LIST } from "@/lib/products/evaliq/question-types";
import type { TestSummary } from "@/lib/products/evaliq/tests";

export interface RuleDraft {
  id: string;
  count: string;
  difficulty: string;
  categoryId: string;
  type: string;
  subject: string;
  topic: string;
  tag: string;
}

export interface SectionDraft {
  id: string;
  title: string;
  description: string;
  timeLimitMinutes: string;
  negativeMarking: "" | "on" | "off";
  marksPerQuestion: string;
  questionIds: string[];
  rules: RuleDraft[];
}

type Opt = { value: string; label: string };
let seq = 0;
const tmpId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

function toPayload(sections: SectionDraft[]) {
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    timeLimitMinutes: s.timeLimitMinutes,
    negativeMarking: s.negativeMarking === "" ? null : s.negativeMarking === "on",
    marksPerQuestion: s.marksPerQuestion,
    questionIds: s.questionIds,
    rules: s.rules.map((r) => ({ ...r, count: Number(r.count) || 0 })),
  }));
}

export default function SectionsEditor({
  testId,
  initial,
  known,
  categories,
  subjects,
  next,
}: {
  testId: string;
  initial: SectionDraft[];
  known: QuestionLite[];
  categories: Opt[];
  subjects: string[];
  next: string;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionDraft[]>(initial);
  const [info, setInfo] = useState<Map<string, QuestionLite>>(() => new Map(known.map((q) => [q.id, q])));
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live summary (debounced) — pool sizes, totals and publish blockers.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await previewSectionsAction(testId, toPayload(sections));
      if (res.ok) setSummary(res.summary);
    }, 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [sections, testId]);

  const upd = (i: number, patch: Partial<SectionDraft>) => setSections((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const allSelected = useMemo(() => sections.flatMap((s) => s.questionIds), [sections]);

  function save() {
    start(async () => {
      const res = await saveTestSectionsAction(testId, toPayload(sections));
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Sections & questions saved");
        router.push(next);
      }
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {sections.map((s, i) => {
          const sum = summary?.sections[i];
          return (
            <GlassCard key={s.id} interactive={false}>
              <CardHeader className="pb-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm font-bold">{`Section ${i + 1}`}</CardTitle>
                  <div className="flex items-center gap-1">
                    {sum && <span className="mr-2 text-xs text-muted-foreground">{`${sum.questionCount} questions · ${sum.marksVary ? "≈" : ""}${sum.marks} marks`}</span>}
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Move section up" disabled={i === 0} onClick={() => setSections((xs) => { const n = [...xs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Move section down" disabled={i === sections.length - 1} onClick={() => setSections((xs) => { const n = [...xs]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Delete section" disabled={sections.length === 1} onClick={() => setSections((xs) => xs.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Section title</Label>
                    <Input value={s.title} onChange={(e) => upd(i, { title: e.target.value })} aria-label="Section title" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time limit (min)</Label>
                    <Input type="number" min={1} value={s.timeLimitMinutes} onChange={(e) => upd(i, { timeLimitMinutes: e.target.value })} placeholder="None" aria-label="Section time limit" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Marks per question</Label>
                    <Input type="number" min={0.25} step={0.25} value={s.marksPerQuestion} onChange={(e) => upd(i, { marksPerQuestion: e.target.value })} placeholder="Question's own" aria-label="Marks per question" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Description</Label>
                    <Textarea value={s.description} onChange={(e) => upd(i, { description: e.target.value })} rows={2} aria-label="Section description" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Negative marking</Label>
                    <OptionSelect value={s.negativeMarking} onChange={(v) => upd(i, { negativeMarking: v as SectionDraft["negativeMarking"] })} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} noneLabel="Same as test" aria-label="Negative marking" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="flex items-center gap-1.5"><ListPlus className="size-3.5" /> Manually selected questions</Label>
                    <Button type="button" size="xs" variant="outline" onClick={() => setPickerFor(i)}>
                      <Search className="size-3" /> Pick from bank
                    </Button>
                  </div>
                  {s.questionIds.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border/60 px-3 py-3 text-center text-xs text-muted-foreground">No questions picked by hand.</p>
                  ) : (
                    <ol className="space-y-1">
                      {s.questionIds.map((qid, k) => {
                        const q = info.get(qid);
                        return (
                          <li key={qid} className="flex items-center gap-2 rounded-xl border border-border/50 px-2 py-1.5 text-sm">
                            <span className="w-6 text-right text-xs text-muted-foreground">{k + 1}.</span>
                            <span className="min-w-0 flex-1 truncate">
                              <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{q?.code ?? "?"}</span>
                              {q?.prompt ?? "Question not found — remove it"}
                            </span>
                            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{q ? `${q.typeLabel} · ${labelOf(QUESTION_DIFFICULTIES, q.difficulty)} · ${s.marksPerQuestion || q.marks}m` : ""}</span>
                            <Button type="button" size="icon-xs" variant="ghost" aria-label="Move up" disabled={k === 0} onClick={() => { const n = [...s.questionIds]; [n[k - 1], n[k]] = [n[k], n[k - 1]]; upd(i, { questionIds: n }); }}>
                              <ArrowUp className="size-3" />
                            </Button>
                            <Button type="button" size="icon-xs" variant="ghost" aria-label="Remove question" onClick={() => upd(i, { questionIds: s.questionIds.filter((x) => x !== qid) })}>
                              <Trash2 className="size-3" />
                            </Button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="flex items-center gap-1.5"><Wand2 className="size-3.5" /> Automatic selection rules</Label>
                    <Button type="button" size="xs" variant="outline" onClick={() => upd(i, { rules: [...s.rules, { id: tmpId("r"), count: "5", difficulty: "", categoryId: "", type: "", subject: "", topic: "", tag: "" }] })}>
                      <Plus className="size-3" /> Add rule
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Each attempt draws this many random active questions from the bank (never repeating a question already in the test). Example: 10 Beginner + 10 Intermediate + 5 Advanced.</p>
                  {s.rules.map((r, k) => {
                    const pool = sum?.rules.find((x) => x.id === r.id);
                    const short = pool && pool.available < pool.count;
                    return (
                      <div key={r.id} className={`grid gap-2 rounded-xl border p-2 md:grid-cols-[80px_repeat(4,minmax(0,1fr))_auto] ${short ? "border-rose-500/40 bg-rose-500/5" : "border-border/50"}`}>
                        <Input type="number" min={1} value={r.count} onChange={(e) => upd(i, { rules: s.rules.map((x, j) => (j === k ? { ...x, count: e.target.value } : x)) })} aria-label="How many questions" />
                        <OptionSelect value={r.difficulty} onChange={(v) => upd(i, { rules: s.rules.map((x, j) => (j === k ? { ...x, difficulty: v } : x)) })} options={QUESTION_DIFFICULTIES.map((d) => ({ value: d.value, label: d.label }))} noneLabel="Any difficulty" aria-label="Difficulty" />
                        <OptionSelect value={r.categoryId} onChange={(v) => upd(i, { rules: s.rules.map((x, j) => (j === k ? { ...x, categoryId: v } : x)) })} options={categories} noneLabel="Any category" aria-label="Category" />
                        <OptionSelect value={r.type} onChange={(v) => upd(i, { rules: s.rules.map((x, j) => (j === k ? { ...x, type: v } : x)) })} options={QUESTION_TYPE_LIST.map((t) => ({ value: t.value, label: t.label }))} noneLabel="Any type" aria-label="Type" />
                        <OptionSelect value={r.subject} onChange={(v) => upd(i, { rules: s.rules.map((x, j) => (j === k ? { ...x, subject: v } : x)) })} options={subjects.map((x) => ({ value: x, label: x }))} noneLabel="Any subject" aria-label="Subject" />
                        <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove rule" onClick={() => upd(i, { rules: s.rules.filter((_, j) => j !== k) })}>
                          <Trash2 className="size-3.5" />
                        </Button>
                        {pool && <p className={`text-[11px] md:col-span-6 ${short ? "text-rose-600" : "text-muted-foreground"}`}>{`${pool.available} matching active question${pool.available === 1 ? "" : "s"} in the bank${short ? ` — not enough for ${pool.count}` : ""}`}</p>}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </GlassCard>
          );
        })}
        <Button type="button" variant="outline" onClick={() => setSections((xs) => [...xs, { id: tmpId("s"), title: `Section ${xs.length + 1}`, description: "", timeLimitMinutes: "", negativeMarking: "", marksPerQuestion: "", questionIds: [], rules: [] }])}>
          <Plus className="size-4" /> Add section
        </Button>
      </div>

      <div className="space-y-3 self-start xl:sticky xl:top-0">
        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">Paper summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!summary ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Calculating…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border/40 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Questions</p>
                    <p className="text-xl font-bold">{summary.questionCount}</p>
                    {summary.servedCount !== summary.questionCount && <p className="text-[11px] text-muted-foreground">{`${summary.servedCount} served per attempt`}</p>}
                  </div>
                  <div className="rounded-xl border border-border/40 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Total marks</p>
                    <p className="text-xl font-bold">{`${summary.marksVary ? "≈" : ""}${summary.totalMarks}`}</p>
                    {summary.marksVary && <p className="text-[11px] text-muted-foreground">Rule draws vary — set marks per question for a fixed total.</p>}
                  </div>
                </div>
                <ul className="space-y-1 text-xs">
                  {summary.sections.map((x) => (
                    <li key={x.id} className="flex justify-between gap-2">
                      <span className="truncate">{x.title}</span>
                      <span className="shrink-0 text-muted-foreground">{`${x.questionCount} q · ${x.marksVary ? "≈" : ""}${x.marks} m${x.timeLimitMinutes ? ` · ${x.timeLimitMinutes} min` : ""}`}</span>
                    </li>
                  ))}
                </ul>
                {summary.issues.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="size-3.5" /> Ready to publish</p>
                ) : (
                  <ul className="space-y-1 text-xs text-rose-600">
                    {summary.issues.map((m) => (
                      <li key={m} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{m}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <Button type="button" className="w-full" onClick={save} disabled={pending}>
              {pending && <Loader2 className="size-3.5 animate-spin" />} Save & preview
            </Button>
          </CardContent>
        </GlassCard>
      </div>

      <QuestionPicker
        key={pickerFor ?? "closed"}
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        exclude={allSelected}
        categories={categories}
        subjects={subjects}
        onAdd={(q) => {
          if (pickerFor === null) return;
          setInfo((m) => new Map(m).set(q.id, q));
          upd(pickerFor, { questionIds: [...sections[pickerFor].questionIds, q.id] });
        }}
      />
    </div>
  );
}

function QuestionPicker({ open, onClose, exclude, onAdd, categories, subjects }: { open: boolean; onClose: () => void; exclude: string[]; onAdd: (q: QuestionLite) => void; categories: Opt[]; subjects: string[] }) {
  const [f, setF] = useState({ q: "", type: "", difficulty: "", categoryId: "", subject: "" });
  const [items, setItems] = useState<QuestionLite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchQuestionsAction({ ...f, exclude });
      if (!cancelled && res.ok) {
        setItems(res.items);
        setTotal(res.total);
      }
      if (!cancelled) setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `exclude` intentionally not a dependency: newly added questions are hidden via `added` instead of refetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, f]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick questions</DialogTitle>
          <DialogDescription>Active questions from the bank. Click Add — the dialog stays open so you can add several.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-5">
          <Input className="sm:col-span-2" value={f.q} onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))} placeholder="Search text, code, tag" aria-label="Search questions" />
          <OptionSelect value={f.type} onChange={(v) => setF((x) => ({ ...x, type: v }))} options={QUESTION_TYPE_LIST.map((t) => ({ value: t.value, label: t.label }))} noneLabel="Any type" aria-label="Type" />
          <OptionSelect value={f.difficulty} onChange={(v) => setF((x) => ({ ...x, difficulty: v }))} options={QUESTION_DIFFICULTIES.map((d) => ({ value: d.value, label: d.label }))} noneLabel="Any difficulty" aria-label="Difficulty" />
          <OptionSelect value={f.subject} onChange={(v) => setF((x) => ({ ...x, subject: v }))} options={subjects.map((s) => ({ value: s, label: s }))} noneLabel="Any subject" aria-label="Subject" />
          <OptionSelect value={f.categoryId} onChange={(v) => setF((x) => ({ ...x, categoryId: v }))} options={categories} noneLabel="Any category" aria-label="Category" />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {loading && <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Searching…</p>}
          {!loading && items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No matching active questions.</p>}
          {!loading &&
            items.filter((q) => !added.has(q.id)).map((q) => (
              <div key={q.id} className="flex items-center gap-2 rounded-xl border border-border/50 px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">{q.prompt}</span>
                  <span className="text-[11px] text-muted-foreground">{`${q.code} · ${q.typeLabel} · ${labelOf(QUESTION_DIFFICULTIES, q.difficulty)} · ${q.marks} marks${q.subject ? ` · ${q.subject}` : ""}`}</span>
                </span>
                <Button type="button" size="xs" onClick={() => { onAdd(q); setAdded((s) => new Set(s).add(q.id)); }}>
                  <Plus className="size-3" /> Add
                </Button>
              </div>
            ))}
          {!loading && total > items.length && <p className="py-2 text-center text-[11px] text-muted-foreground">{`Showing ${items.length} of ${total} — narrow the search to see more.`}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
