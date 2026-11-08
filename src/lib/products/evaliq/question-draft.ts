import type { ChoiceDef, CodeDef, FillBlankDef, MatchDef, OrderingDef, QuestionType, TextDef } from "@/lib/products/evaliq/question-types";
import type { Question } from "@/lib/products/evaliq/questions";

/** Question editor state + converters. Pure (importable by server pages AND the client editor). */

/** Loose editor state — the server re-validates everything with the question-type registry. */
export interface QuestionDraft {
  type: QuestionType;
  prompt: string;
  media: { kind: "image" | "audio" | "video"; url: string; caption: string } | null;
  categoryId: string;
  subject: string;
  topic: string;
  difficulty: string;
  marks: string;
  negativeMarks: string;
  explanation: string;
  tags: string;
  status: string;
  // definition fields (superset across types)
  options: { id: string; text: string }[];
  correct: string[];
  acceptedAnswers: string;
  caseSensitive: boolean;
  maxLength: string;
  rubric: string;
  blanks: string[];
  language: string;
  code: string;
  schema: string;
  testCases: { id: string; input: string; expectedOutput: string; hidden: boolean }[];
  pairs: { id: string; left: string; right: string }[];
  items: { id: string; text: string }[];
}

export const EMPTY_DRAFT: QuestionDraft = {
  type: "single_choice",
  prompt: "",
  media: null,
  categoryId: "",
  subject: "",
  topic: "",
  difficulty: "intermediate",
  marks: "1",
  negativeMarks: "0",
  explanation: "",
  tags: "",
  status: "active",
  options: [
    { id: "o1", text: "" },
    { id: "o2", text: "" },
    { id: "o3", text: "" },
    { id: "o4", text: "" },
  ],
  correct: [],
  acceptedAnswers: "",
  caseSensitive: false,
  maxLength: "",
  rubric: "",
  blanks: [""],
  language: "javascript",
  code: "",
  schema: "",
  testCases: [],
  pairs: [
    { id: "p1", left: "", right: "" },
    { id: "p2", left: "", right: "" },
  ],
  items: [
    { id: "s1", text: "" },
    { id: "s2", text: "" },
    { id: "s3", text: "" },
  ],
};


/** Existing question → editor state. */
export function questionToDraft(q: Question): QuestionDraft {
  const d: QuestionDraft = {
    ...EMPTY_DRAFT,
    type: q.type,
    prompt: q.prompt,
    media: q.media ? { ...q.media } : null,
    categoryId: q.categoryId ?? "",
    subject: q.subject,
    topic: q.topic,
    difficulty: q.difficulty,
    marks: String(q.marks),
    negativeMarks: String(q.negativeMarks),
    explanation: q.explanation,
    tags: q.tags.join(", "),
    status: q.status,
  };
  const def = q.definition;
  if ("options" in def) {
    d.options = (def as ChoiceDef).options.map((o) => ({ ...o }));
    d.correct = [...(def as ChoiceDef).correct];
  } else if ("blanks" in def) {
    d.blanks = (def as FillBlankDef).blanks.map((b) => b.accepted.join(" | "));
    d.caseSensitive = (def as FillBlankDef).caseSensitive;
  } else if ("pairs" in def) d.pairs = (def as MatchDef).pairs.map((p) => ({ ...p }));
  else if ("items" in def) d.items = (def as OrderingDef).items.map((x) => ({ ...x }));
  else if ("testCases" in def) {
    const c = def as CodeDef;
    Object.assign(d, { language: c.language, code: c.code, schema: c.schema, acceptedAnswers: c.acceptedAnswers.join("\n"), testCases: c.testCases.map((t) => ({ ...t })), rubric: c.rubric });
  } else {
    const t = def as TextDef;
    Object.assign(d, { acceptedAnswers: t.acceptedAnswers.join("\n"), caseSensitive: t.caseSensitive, maxLength: t.maxLength ? String(t.maxLength) : "", rubric: t.rubric });
  }
  return d;
}
