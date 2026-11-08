"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Upload, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuestionRenderer from "@/components/products/evaliq/QuestionRenderer";
import { saveQuestionAction } from "@/app/(products)/evaliq/(protected)/actions";
import { QUESTION_GROUPS, QUESTION_TYPES, QUESTION_TYPE_LIST, QuestionInputError, type QuestionType } from "@/lib/products/evaliq/question-types";
import { QUESTION_DIFFICULTIES, QUESTION_STATUSES } from "@/lib/products/evaliq/constants";
import type { QuestionResponse } from "@/lib/products/evaliq/question-types";
import { EMPTY_DRAFT, type QuestionDraft } from "@/lib/products/evaliq/question-draft";

let uid = 100;
const nextId = (p: string) => `${p}${++uid}`;

export function toRaw(d: QuestionDraft): Record<string, unknown> {
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  let definition: Record<string, unknown> = {};
  const g = QUESTION_TYPES[d.type].group;
  if (d.type === "true_false" || d.type === "yes_no") definition = { correct: d.correct };
  else if (g === "objective" || g === "media") definition = { options: d.options.filter((o) => o.text.trim()), correct: d.correct };
  else if (d.type === "short_answer" || d.type === "long_answer") definition = { acceptedAnswers: lines(d.acceptedAnswers), caseSensitive: d.caseSensitive, maxLength: d.maxLength, rubric: d.rubric };
  else if (d.type === "fill_blank") definition = { blanks: d.blanks.map((b) => ({ accepted: b.split("|").map((x) => x.trim()).filter(Boolean) })), caseSensitive: d.caseSensitive };
  else if (d.type === "match_following") definition = { pairs: d.pairs };
  else if (d.type === "ordering") definition = { items: d.items };
  else definition = { language: d.language, code: d.code, schema: d.schema, acceptedAnswers: lines(d.acceptedAnswers), testCases: d.testCases, rubric: d.rubric };
  return {
    type: d.type,
    prompt: d.prompt,
    media: d.media?.url ? d.media : null,
    categoryId: d.categoryId,
    subject: d.subject,
    topic: d.topic,
    difficulty: d.difficulty,
    marks: d.marks,
    negativeMarks: d.negativeMarks,
    explanation: d.explanation,
    tags: d.tags,
    status: d.status,
    definition,
  };
}

const LANGS = ["javascript", "typescript", "python", "java", "c", "cpp", "csharp", "go", "php", "ruby", "sql", "bash"].map((l) => ({ value: l, label: l }));

export default function QuestionEditor({
  id,
  initial,
  categories,
  subjects,
  canUpload,
}: {
  id: string | null;
  initial: QuestionDraft;
  categories: { value: string; label: string }[];
  subjects: string[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [d, setD] = useState<QuestionDraft>(initial);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewResponse, setPreviewResponse] = useState<QuestionResponse | null>(null);
  const set = <K extends keyof QuestionDraft>(k: K, v: QuestionDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const spec = QUESTION_TYPES[d.type];
  const g = spec.group;
  const blankCount = new Set(Array.from(d.prompt.matchAll(/\[\[(\d+)\]\]/g)).map((m) => m[1])).size;

  const preview = useMemo(() => {
    try {
      const raw = toRaw(d);
      const def = spec.normalizeDefinition(raw.definition, d.prompt || " ");
      return { view: spec.publicDefinition(def, { shuffle: false, rng: Math.random }), error: null as string | null };
    } catch (err) {
      return { view: null, error: err instanceof QuestionInputError ? err.message : "Incomplete question." };
    }
  }, [d, spec]);

  function changeType(t: QuestionType) {
    setPreviewResponse(null);
    setD((x) => {
      const next = { ...x, type: t, correct: t === "true_false" ? ["true"] : t === "yes_no" ? ["yes"] : [] };
      const req = QUESTION_TYPES[t].requiresMedia;
      if (req) next.media = { kind: req, url: x.media?.url ?? "", caption: x.media?.caption ?? "" };
      return next;
    });
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/evaliq/media", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; kind?: "image" | "audio" | "video"; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed.");
      set("media", { kind: json.kind ?? "image", url: json.url, caption: d.media?.caption ?? "" });
      toast.success("File uploaded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function save(andNew = false) {
    start(async () => {
      const res = await saveQuestionAction(id, toRaw(d));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(id ? "Question saved" : "Question created");
      if (andNew) {
        setD({ ...EMPTY_DRAFT, type: d.type, categoryId: d.categoryId, subject: d.subject, topic: d.topic, difficulty: d.difficulty, marks: d.marks });
        router.refresh();
      } else router.push(`/evaliq/questions/${res.id}`);
    });
  }

  const typeOptions = QUESTION_GROUPS.flatMap((grp) => QUESTION_TYPE_LIST.filter((t) => t.group === grp.value).map((t) => ({ value: t.value, label: `${grp.label} · ${t.label}` })));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">Question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Question type</Label>
                <OptionSelect value={d.type} onChange={(v) => changeType(v as QuestionType)} options={typeOptions} aria-label="Question type" />
                <p className="text-[11px] text-muted-foreground">{spec.description}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <OptionSelect value={d.status} onChange={(v) => set("status", v)} options={QUESTION_STATUSES.map((s) => ({ value: s.value, label: s.label }))} aria-label="Status" />
                <p className="text-[11px] text-muted-foreground">Only active questions can be drawn by automatic selection rules.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-prompt">Question text</Label>
              <Textarea id="q-prompt" value={d.prompt} onChange={(e) => set("prompt", e.target.value)} rows={4} placeholder={d.type === "fill_blank" ? "The capital of France is [[1]] and of Italy is [[2]]." : "Write the question…"} />
            </div>

            <div className="space-y-2 rounded-xl border border-border/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Media {spec.requiresMedia ? "(required)" : "(optional)"}</Label>
                {!d.media && !spec.requiresMedia && (
                  <Button type="button" size="xs" variant="outline" onClick={() => set("media", { kind: "image", url: "", caption: "" })}>
                    <Plus className="size-3" /> Add image / audio / video
                  </Button>
                )}
              </div>
              {d.media && (
                <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                  <OptionSelect value={d.media.kind} onChange={(v) => set("media", { ...d.media!, kind: v as "image" })} options={[{ value: "image", label: "Image" }, { value: "audio", label: "Audio" }, { value: "video", label: "Video" }]} disabled={!!spec.requiresMedia} aria-label="Media kind" />
                  <Input value={d.media.url} onChange={(e) => set("media", { ...d.media!, url: e.target.value })} placeholder="https://… or upload" aria-label="Media URL" />
                  <div className="flex gap-1">
                    {canUpload && (
                      <>
                        <input ref={fileRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
                        </Button>
                      </>
                    )}
                    {!spec.requiresMedia && (
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove media" onClick={() => set("media", null)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <Input className="sm:col-span-3" value={d.media.caption} onChange={(e) => set("media", { ...d.media!, caption: e.target.value })} placeholder="Caption / alt text" aria-label="Caption" />
                </div>
              )}
            </div>

            {/* ── type-specific answer editors ── */}
            {(d.type === "true_false" || d.type === "yes_no") && (
              <div className="space-y-1.5">
                <Label>Correct answer</Label>
                <OptionSelect value={d.correct[0] ?? ""} onChange={(v) => set("correct", [v])} options={d.type === "true_false" ? [{ value: "true", label: "True" }, { value: "false", label: "False" }] : [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} aria-label="Correct answer" />
              </div>
            )}
            {(g === "objective" || g === "media") && d.type !== "true_false" && d.type !== "yes_no" && (
              <div className="space-y-2">
                <Label>Options {d.type === "single_choice" || g === "media" ? "(mark the one correct option)" : "(mark every correct option)"}</Label>
                {d.options.map((o, i) => {
                  const on = d.correct.includes(o.id);
                  const multi = d.type === "multiple_choice" || d.type === "multiple_select";
                  return (
                    <div key={o.id} className="flex items-center gap-2">
                      <input
                        type={multi ? "checkbox" : "radio"}
                        name="correct"
                        aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
                        className="size-4 accent-[var(--primary)]"
                        checked={on}
                        onChange={() => set("correct", multi ? (on ? d.correct.filter((c) => c !== o.id) : [...d.correct, o.id]) : [o.id])}
                      />
                      <span className="w-5 text-sm font-semibold text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                      <Input value={o.text} onChange={(e) => set("options", d.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))} placeholder={`Option ${String.fromCharCode(65 + i)}`} aria-label={`Option ${String.fromCharCode(65 + i)}`} />
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove option" disabled={d.options.length <= 2} onClick={() => setD((x) => ({ ...x, options: x.options.filter((y) => y.id !== o.id), correct: x.correct.filter((c) => c !== o.id) }))}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
                {d.options.length < 8 && (
                  <Button type="button" size="xs" variant="outline" onClick={() => set("options", [...d.options, { id: nextId("o"), text: "" }])}>
                    <Plus className="size-3" /> Add option
                  </Button>
                )}
              </div>
            )}
            {(d.type === "short_answer" || d.type === "long_answer") && (
              <div className="grid gap-3 sm:grid-cols-2">
                {d.type === "short_answer" && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Accepted answers (one per line)</Label>
                    <Textarea value={d.acceptedAnswers} onChange={(e) => set("acceptedAnswers", e.target.value)} rows={3} placeholder={"Leave empty to evaluate manually"} />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" className="accent-[var(--primary)]" checked={d.caseSensitive} onChange={(e) => set("caseSensitive", e.target.checked)} /> Case-sensitive
                    </label>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Max length (characters)</Label>
                  <Input type="number" min={1} value={d.maxLength} onChange={(e) => set("maxLength", e.target.value)} placeholder="No limit" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Marking rubric (for evaluators)</Label>
                  <Textarea value={d.rubric} onChange={(e) => set("rubric", e.target.value)} rows={3} placeholder="What a full-marks answer must contain…" />
                </div>
              </div>
            )}
            {d.type === "fill_blank" && (
              <div className="space-y-2">
                <Label>{`Accepted answers per blank (${blankCount} blank${blankCount === 1 ? "" : "s"} found) — separate alternatives with |`}</Label>
                {Array.from({ length: Math.max(blankCount, 1) }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-10 text-xs font-semibold text-muted-foreground">{`[[${i + 1}]]`}</span>
                    <Input value={d.blanks[i] ?? ""} onChange={(e) => set("blanks", Array.from({ length: Math.max(blankCount, 1) }, (_, j) => (j === i ? e.target.value : d.blanks[j] ?? "")))} placeholder="Paris | paris" aria-label={`Blank ${i + 1} answers`} />
                  </div>
                ))}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="accent-[var(--primary)]" checked={d.caseSensitive} onChange={(e) => set("caseSensitive", e.target.checked)} /> Case-sensitive
                </label>
              </div>
            )}
            {g === "technical" && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Language</Label>
                    <OptionSelect value={d.language} onChange={(v) => set("language", v)} options={LANGS} aria-label="Language" />
                  </div>
                </div>
                {d.type === "sql_query" && (
                  <div className="space-y-1.5">
                    <Label>Schema shown to the candidate</Label>
                    <Textarea value={d.schema} onChange={(e) => set("schema", e.target.value)} rows={5} className="font-mono text-xs" placeholder="CREATE TABLE employees (id INT, name TEXT, salary INT, dept_id INT);" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>{d.type === "code_output" ? "Code the candidate reads" : d.type === "debugging" ? "Buggy code (the candidate edits it)" : "Starter code (optional)"}</Label>
                  <Textarea value={d.code} onChange={(e) => set("code", e.target.value)} rows={8} className="font-mono text-xs" spellCheck={false} />
                </div>
                {d.type === "code_output" ? (
                  <div className="space-y-1.5">
                    <Label>Expected output (one accepted answer per line; multi-line output: use a single entry)</Label>
                    <Textarea value={d.acceptedAnswers} onChange={(e) => set("acceptedAnswers", e.target.value)} rows={3} className="font-mono text-xs" />
                  </div>
                ) : (
                  <>
                    {d.type === "coding" && (
                      <div className="space-y-2">
                        <Label>Test cases (hidden ones are only visible to evaluators)</Label>
                        {d.testCases.map((t) => (
                          <div key={t.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                            <Input value={t.input} onChange={(e) => set("testCases", d.testCases.map((x) => (x.id === t.id ? { ...x, input: e.target.value } : x)))} placeholder="Input" className="font-mono text-xs" aria-label="Test input" />
                            <Input value={t.expectedOutput} onChange={(e) => set("testCases", d.testCases.map((x) => (x.id === t.id ? { ...x, expectedOutput: e.target.value } : x)))} placeholder="Expected output" className="font-mono text-xs" aria-label="Expected output" />
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" className="accent-[var(--primary)]" checked={t.hidden} onChange={(e) => set("testCases", d.testCases.map((x) => (x.id === t.id ? { ...x, hidden: e.target.checked } : x)))} /> Hidden
                            </label>
                            <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove test case" onClick={() => set("testCases", d.testCases.filter((x) => x.id !== t.id))}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" size="xs" variant="outline" onClick={() => set("testCases", [...d.testCases, { id: nextId("t"), input: "", expectedOutput: "", hidden: false }])}>
                          <Plus className="size-3" /> Add test case
                        </Button>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Marking rubric (for evaluators)</Label>
                      <Textarea value={d.rubric} onChange={(e) => set("rubric", e.target.value)} rows={3} />
                    </div>
                  </>
                )}
              </div>
            )}
            {d.type === "match_following" && (
              <div className="space-y-2">
                <Label>Pairs (left item → its correct match)</Label>
                {d.pairs.map((p) => (
                  <div key={p.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input value={p.left} onChange={(e) => set("pairs", d.pairs.map((x) => (x.id === p.id ? { ...x, left: e.target.value } : x)))} placeholder="Left" aria-label="Left item" />
                    <Input value={p.right} onChange={(e) => set("pairs", d.pairs.map((x) => (x.id === p.id ? { ...x, right: e.target.value } : x)))} placeholder="Matches" aria-label="Right item" />
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove pair" disabled={d.pairs.length <= 2} onClick={() => set("pairs", d.pairs.filter((x) => x.id !== p.id))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="xs" variant="outline" onClick={() => set("pairs", [...d.pairs, { id: nextId("p"), left: "", right: "" }])}>
                  <Plus className="size-3" /> Add pair
                </Button>
              </div>
            )}
            {d.type === "ordering" && (
              <div className="space-y-2">
                <Label>Items in the CORRECT order (candidates see them shuffled)</Label>
                {d.items.map((it, i) => (
                  <div key={it.id} className="flex items-center gap-2">
                    <span className="w-5 text-sm font-semibold text-muted-foreground">{i + 1}.</span>
                    <Input value={it.text} onChange={(e) => set("items", d.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))} aria-label={`Item ${i + 1}`} />
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove item" disabled={d.items.length <= 2} onClick={() => set("items", d.items.filter((x) => x.id !== it.id))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="xs" variant="outline" onClick={() => set("items", [...d.items, { id: nextId("s"), text: "" }])}>
                  <Plus className="size-3" /> Add item
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="q-expl">Explanation (shown after results when the test allows it)</Label>
              <Textarea id="q-expl" value={d.explanation} onChange={(e) => set("explanation", e.target.value)} rows={3} />
            </div>
          </CardContent>
        </GlassCard>
      </div>

      <div className="space-y-4 self-start">
        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-bold">Classification & marks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <OptionSelect value={d.categoryId} onChange={(v) => set("categoryId", v)} options={categories} noneLabel="Uncategorised" aria-label="Category" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="q-subject">Subject</Label>
                <Input id="q-subject" list="ots-subjects" value={d.subject} onChange={(e) => set("subject", e.target.value)} placeholder="JavaScript" />
                <datalist id="ots-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-topic">Topic</Label>
                <Input id="q-topic" value={d.topic} onChange={(e) => set("topic", e.target.value)} placeholder="Closures" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <OptionSelect value={d.difficulty} onChange={(v) => set("difficulty", v)} options={QUESTION_DIFFICULTIES.map((x) => ({ value: x.value, label: x.label }))} aria-label="Difficulty" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="q-marks">Marks</Label>
                <Input id="q-marks" type="number" min={0.25} step={0.25} value={d.marks} onChange={(e) => set("marks", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-neg">Negative marks</Label>
                <Input id="q-neg" type="number" min={0} step={0.25} value={d.negativeMarks} onChange={(e) => set("negativeMarks", e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Negative marks only apply in tests (or sections) with negative marking switched on, and only to wrong answers — never to skipped ones.</p>
            <div className="space-y-1.5">
              <Label htmlFor="q-tags">Tags (comma separated)</Label>
              <Input id="q-tags" value={d.tags} onChange={(e) => set("tags", e.target.value)} placeholder="es6, interview" />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" onClick={() => save(false)} disabled={pending}>
                {pending && <Loader2 className="size-3.5 animate-spin" />} {id ? "Save question" : "Create question"}
              </Button>
              {!id && (
                <Button type="button" variant="outline" onClick={() => save(true)} disabled={pending}>
                  Save & add another
                </Button>
              )}
            </div>
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5 text-sm font-bold">
              <Eye className="size-4" /> Candidate preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {preview.view ? (
              <QuestionRenderer prompt={d.prompt || "Question text…"} media={d.media?.url ? d.media : null} view={preview.view} response={previewResponse} onChange={setPreviewResponse} inputId="preview" />
            ) : (
              <p className="text-xs text-muted-foreground">{preview.error}</p>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">Try answering — nothing is saved. The answer key is never sent to candidates.</p>
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
