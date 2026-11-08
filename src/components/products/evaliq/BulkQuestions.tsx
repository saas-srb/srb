"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { bulkCreateQuestionsAction } from "@/app/(products)/evaliq/(protected)/actions";
import { QUESTION_TYPES, type QuestionType } from "@/lib/products/evaliq/question-types";
import { QUESTION_DIFFICULTIES } from "@/lib/products/evaliq/constants";

/**
 * Bulk question creation from a simple text format — fastest way to type up
 * an objective paper. Every parsed question is still validated by the server
 * through the same question-type registry as the editor.
 */

const SAMPLE = `Q: Which array method returns a new array with the results of calling a function on every element?
A) forEach
B) map
C) filter
D) reduce
Answer: B
Explanation: map() returns a new array; forEach() returns undefined.

Q: Which of these are JavaScript primitive types?
A) string
B) object
C) symbol
D) array
Answer: A, C

Q: typeof null returns "object" in JavaScript.
Answer: True

Q: What keyword stops a loop immediately?
Answer: break`;

interface Parsed {
  type: QuestionType;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

function parse(text: string): Parsed[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length)
    .map((lines) => {
      let prompt = "";
      const options: string[] = [];
      let answer = "";
      let explanation = "";
      for (const l of lines) {
        const opt = l.match(/^([A-H])[).:-]\s*(.+)$/);
        if (/^q[:.)]/i.test(l)) prompt = l.replace(/^q[:.)]\s*/i, "");
        else if (/^answer\s*:/i.test(l)) answer = l.replace(/^answer\s*:\s*/i, "");
        else if (/^explanation\s*:/i.test(l)) explanation = l.replace(/^explanation\s*:\s*/i, "");
        else if (opt) options.push(opt[2]);
        else prompt = prompt ? `${prompt}\n${l}` : l;
      }
      const letters = answer.toUpperCase().split(/[,\s]+/).filter((x) => /^[A-H]$/.test(x));
      let type: QuestionType;
      if (options.length >= 2) type = letters.length > 1 ? "multiple_select" : "single_choice";
      else if (/^(true|false)$/i.test(answer)) type = "true_false";
      else if (/^(yes|no)$/i.test(answer)) type = "yes_no";
      else type = answer ? "short_answer" : "long_answer";
      return { type, prompt, options, answer, explanation };
    });
}

function toRaw(p: Parsed, common: { categoryId: string; subject: string; difficulty: string; marks: string }): Record<string, unknown> {
  let definition: Record<string, unknown> = {};
  if (p.type === "single_choice" || p.type === "multiple_select") {
    const letters = p.answer.toUpperCase().split(/[,\s]+/).filter(Boolean);
    definition = { options: p.options.map((text, i) => ({ id: `o${i + 1}`, text })), correct: letters.map((l) => `o${"ABCDEFGH".indexOf(l) + 1}`) };
  } else if (p.type === "true_false" || p.type === "yes_no") definition = { correct: [p.answer.toLowerCase()] };
  else if (p.type === "short_answer") definition = { acceptedAnswers: p.answer.split("|").map((x) => x.trim()) };
  return { type: p.type, prompt: p.prompt, definition, explanation: p.explanation, categoryId: common.categoryId, subject: common.subject, difficulty: common.difficulty, marks: common.marks, negativeMarks: 0, status: "active" };
}

export default function BulkQuestions({ categories }: { categories: { value: string; label: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [common, setCommon] = useState({ categoryId: "", subject: "", difficulty: "intermediate", marks: "1" });
  const [pending, start] = useTransition();
  const parsed = useMemo(() => parse(text), [text]);

  function create() {
    start(async () => {
      const res = await bulkCreateQuestionsAction(parsed.map((p) => toRaw(p, common)));
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`${res.created} questions created`);
        router.push("/evaliq/questions?sort=created");
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="bulk">Questions (blank line between questions, max 50)</Label>
          <Button type="button" size="xs" variant="ghost" onClick={() => setText(SAMPLE)}>
            Insert example
          </Button>
        </div>
        <Textarea id="bulk" value={text} onChange={(e) => setText(e.target.value)} rows={22} className="font-mono text-xs" placeholder={SAMPLE} />
        <p className="text-[11px] text-muted-foreground">Options A)–H) with “Answer: B” → Single Choice; “Answer: A, C” → Multiple Select; “Answer: True/False” or “Yes/No”; no options with an answer → Short Answer (alternatives separated by |); no answer → Long Answer. Other types: use the editor or Import.</p>
      </div>
      <div className="space-y-3 self-start">
        <div className="space-y-1.5">
          <Label>Category for all</Label>
          <OptionSelect value={common.categoryId} onChange={(v) => setCommon((c) => ({ ...c, categoryId: v }))} options={categories} noneLabel="Uncategorised" aria-label="Category" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-subject">Subject</Label>
          <Input id="bulk-subject" value={common.subject} onChange={(e) => setCommon((c) => ({ ...c, subject: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>Difficulty</Label>
            <OptionSelect value={common.difficulty} onChange={(v) => setCommon((c) => ({ ...c, difficulty: v }))} options={QUESTION_DIFFICULTIES.map((d) => ({ value: d.value, label: d.label }))} aria-label="Difficulty" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-marks">Marks each</Label>
            <Input id="bulk-marks" type="number" min={0.25} step={0.25} value={common.marks} onChange={(e) => setCommon((c) => ({ ...c, marks: e.target.value }))} />
          </div>
        </div>
        <div className="rounded-xl border border-border/50 p-3">
          <p className="mb-2 text-xs font-semibold">{`${parsed.length} question${parsed.length === 1 ? "" : "s"} detected`}</p>
          <ol className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {parsed.map((p, i) => (
              <li key={i} className="truncate">
                <span className="font-semibold text-primary">{QUESTION_TYPES[p.type].label}</span> · {p.prompt || <span className="text-rose-500">missing question text</span>}
              </li>
            ))}
          </ol>
        </div>
        <Button type="button" className="w-full" disabled={pending || parsed.length === 0 || parsed.length > 50} onClick={create}>
          {pending && <Loader2 className="size-3.5 animate-spin" />} {`Create ${parsed.length} question${parsed.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
