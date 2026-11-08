/**
 * The OTS question engine: ONE registry of question types. Everything the
 * rest of the system does with a question — validate an author's definition,
 * strip the answer key before a candidate sees it, normalise a candidate's
 * response, grade it, and describe the correct answer on a result page — is
 * a per-type function here. Tests, papers, attempts and evaluation are all
 * type-agnostic and only ever call through `QUESTION_TYPES[type]`.
 *
 * Adding a type = adding one entry (plus an editor + renderer case in the
 * UI); nothing in the test / attempt / evaluation code changes.
 *
 * Pure (no server-only imports) so the editor and renderer can share the
 * type metadata. Answer keys are only ever stripped on the server — the
 * client receives `publicDefinition` output, never a raw definition.
 */

export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "multiple_select"
  | "true_false"
  | "yes_no"
  | "short_answer"
  | "long_answer"
  | "fill_blank"
  | "code_output"
  | "coding"
  | "sql_query"
  | "debugging"
  | "match_following"
  | "ordering"
  | "image_based"
  | "audio_based"
  | "video_based";

export type QuestionGroup = "objective" | "text" | "technical" | "matching" | "media";

export const QUESTION_GROUPS: { value: QuestionGroup; label: string }[] = [
  { value: "objective", label: "Objective" },
  { value: "text", label: "Text" },
  { value: "technical", label: "Technical" },
  { value: "matching", label: "Matching" },
  { value: "media", label: "Media" },
];

// ── Definitions (author-side, include answer keys) ─────────────────────────

export interface ChoiceOption {
  id: string;
  text: string;
}
export interface ChoiceDef {
  options: ChoiceOption[];
  correct: string[];
}
export interface TextDef {
  acceptedAnswers: string[];
  caseSensitive: boolean;
  maxLength: number | null;
  rubric: string;
}
export interface FillBlankDef {
  /** One entry per `[[n]]` placeholder in the prompt, in order. */
  blanks: { id: string; accepted: string[] }[];
  caseSensitive: boolean;
}
export interface CodeDef {
  language: string;
  /** Shown to the candidate: the snippet (code output / debugging) or starter code (coding / SQL). */
  code: string;
  /** SQL questions: the schema the query runs against. */
  schema: string;
  acceptedAnswers: string[];
  testCases: { id: string; input: string; expectedOutput: string; hidden: boolean }[];
  rubric: string;
}
export interface MatchDef {
  pairs: { id: string; left: string; right: string }[];
}
export interface OrderingDef {
  /** The CORRECT order. */
  items: { id: string; text: string }[];
}

export type QuestionDefinition = ChoiceDef | TextDef | FillBlankDef | CodeDef | MatchDef | OrderingDef;

// ── Public (candidate-side) shapes — never contain an answer key ───────────

export type PublicDefinition =
  | { kind: "choice"; multiple: boolean; options: ChoiceOption[] }
  | { kind: "text"; long: boolean; maxLength: number | null }
  | { kind: "fill_blank"; blankIds: string[] }
  | { kind: "code"; language: string; code: string; schema: string; editable: boolean; answerMode: "code" | "text"; sampleTests: { input: string; expectedOutput: string }[] }
  | { kind: "match"; left: { id: string; text: string }[]; right: { id: string; text: string }[] }
  | { kind: "ordering"; items: { id: string; text: string }[] };

// ── Responses ──────────────────────────────────────────────────────────────

export type QuestionResponse =
  | { selected: string[] }
  | { text: string }
  | { blanks: Record<string, string> }
  | { code: string }
  | { pairs: Record<string, string> }
  | { order: string[] };

export type Grade =
  | { status: "correct" | "incorrect" | "partial"; fraction: number }
  | { status: "manual" };

export class QuestionInputError extends Error {}

type Rng = () => number;

export interface QuestionTypeSpec {
  label: string;
  group: QuestionGroup;
  description: string;
  /** Can this question (as authored) be graded without a human? */
  autoGradable: (def: QuestionDefinition) => boolean;
  normalizeDefinition: (raw: unknown, prompt: string) => QuestionDefinition;
  publicDefinition: (def: QuestionDefinition, opts: { shuffle: boolean; rng: Rng }) => PublicDefinition;
  /** null = unanswered. */
  normalizeResponse: (raw: unknown, def: QuestionDefinition) => QuestionResponse | null;
  evaluate: (def: QuestionDefinition, response: QuestionResponse) => Grade;
  /** Human-readable correct answer for result pages (only shown when the test allows it). */
  correctAnswer: (def: QuestionDefinition) => string;
  /** Human-readable rendering of a candidate's response. */
  describeResponse: (def: QuestionDefinition, response: QuestionResponse | null) => string;
  /** Media questions must carry media. */
  requiresMedia?: "image" | "audio" | "video";
}

// ── helpers ────────────────────────────────────────────────────────────────

const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, max = 50) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [])
    .map((x) => str(x, 1000))
    .filter(Boolean)
    .slice(0, max);
const shortId = (i: number) => `o${i + 1}`;

export function shuffled<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normText(s: string, caseSensitive: boolean): string {
  const t = s.replace(/\s+/g, " ").trim();
  return caseSensitive ? t : t.toLowerCase();
}

function matchesAny(answer: string, accepted: string[], caseSensitive: boolean): boolean {
  const a = normText(answer, caseSensitive);
  return accepted.some((x) => normText(x, caseSensitive) === a);
}

function grade(fraction: number): Grade {
  const f = Math.max(0, Math.min(1, fraction));
  return { status: f >= 0.9999 ? "correct" : f <= 0 ? "incorrect" : "partial", fraction: f };
}

// ── choice family ──────────────────────────────────────────────────────────

function normalizeOptions(raw: unknown): ChoiceOption[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: ChoiceOption[] = [];
  list.forEach((o, i) => {
    const text = str(typeof o === "string" ? o : (o as { text?: unknown })?.text, 1000);
    if (!text) return;
    let id = str((o as { id?: unknown })?.id, 40).replace(/[^a-zA-Z0-9_-]/g, "") || shortId(i);
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    out.push({ id, text });
  });
  return out.slice(0, 12);
}

function choiceSpec(opts: { label: string; group: QuestionGroup; description: string; multiple: false | "partial" | "all"; fixed?: ChoiceOption[]; requiresMedia?: "image" | "audio" | "video" }): QuestionTypeSpec {
  /** True/False and Yes/No always use their fixed options, whatever the stored definition carries. */
  const optionsOf = (def: QuestionDefinition) => opts.fixed ?? (def as ChoiceDef).options ?? [];
  return {
    label: opts.label,
    group: opts.group,
    description: opts.description,
    requiresMedia: opts.requiresMedia,
    autoGradable: () => true,
    normalizeDefinition(raw) {
      const r = (raw ?? {}) as { options?: unknown; correct?: unknown };
      const options = opts.fixed ?? normalizeOptions(r.options);
      if (options.length < 2) throw new QuestionInputError("Add at least two options.");
      const ids = new Set(options.map((o) => o.id));
      const correct = Array.from(new Set((Array.isArray(r.correct) ? r.correct : [r.correct]).map((c) => str(c, 40)).filter((c) => ids.has(c))));
      if (correct.length === 0) throw new QuestionInputError("Mark the correct option.");
      if (!opts.multiple && correct.length > 1) throw new QuestionInputError("Only one option can be correct for this question type.");
      return { options, correct } satisfies ChoiceDef;
    },
    publicDefinition(def, { shuffle, rng }) {
      // True/False and Yes/No keep their natural order even when options are shuffled.
      const options = shuffle && !opts.fixed ? shuffled(optionsOf(def), rng) : optionsOf(def);
      return { kind: "choice", multiple: opts.multiple !== false, options };
    },
    normalizeResponse(raw, def) {
      const ids = new Set(optionsOf(def).map((o) => o.id));
      const sel = (raw as { selected?: unknown })?.selected;
      const selected = Array.from(new Set((Array.isArray(sel) ? sel : []).map((x) => String(x)).filter((x) => ids.has(x))));
      if (selected.length === 0) return null;
      return { selected: opts.multiple === false ? selected.slice(0, 1) : selected };
    },
    evaluate(def, response) {
      const d = def as ChoiceDef;
      const selected = (response as { selected: string[] }).selected;
      const correct = new Set(d.correct);
      if (opts.multiple === "partial") {
        // Partial credit: each right pick earns 1/|correct|, each wrong pick cancels one right pick.
        const right = selected.filter((s) => correct.has(s)).length;
        const wrong = selected.length - right;
        return grade((right - wrong) / correct.size);
      }
      const exact = selected.length === correct.size && selected.every((s) => correct.has(s));
      return grade(exact ? 1 : 0);
    },
    correctAnswer(def) {
      const d = def as ChoiceDef;
      return optionsOf(def).filter((o) => d.correct.includes(o.id)).map((o) => o.text).join(" · ");
    },
    describeResponse(def, response) {
      if (!response) return "Not answered";
      const sel = (response as { selected: string[] }).selected;
      return optionsOf(def).filter((o) => sel.includes(o.id)).map((o) => o.text).join(" · ") || "Not answered";
    },
  };
}

// ── text family ────────────────────────────────────────────────────────────

function textSpec(opts: { label: string; description: string; long: boolean }): QuestionTypeSpec {
  return {
    label: opts.label,
    group: "text",
    description: opts.description,
    autoGradable: (def) => !opts.long && (def as TextDef).acceptedAnswers.length > 0,
    normalizeDefinition(raw) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const maxLength = Number(r.maxLength);
      return {
        acceptedAnswers: opts.long ? [] : strList(r.acceptedAnswers, 30),
        caseSensitive: r.caseSensitive === true,
        maxLength: Number.isFinite(maxLength) && maxLength > 0 ? Math.min(Math.round(maxLength), 20000) : null,
        rubric: str(r.rubric, 4000),
      } satisfies TextDef;
    },
    publicDefinition(def) {
      return { kind: "text", long: opts.long, maxLength: (def as TextDef).maxLength };
    },
    normalizeResponse(raw, def) {
      const max = (def as TextDef).maxLength ?? 20000;
      const text = typeof (raw as { text?: unknown })?.text === "string" ? ((raw as { text: string }).text).slice(0, max) : "";
      return text.trim() ? { text } : null;
    },
    evaluate(def, response) {
      const d = def as TextDef;
      if (opts.long || d.acceptedAnswers.length === 0) return { status: "manual" };
      return grade(matchesAny((response as { text: string }).text, d.acceptedAnswers, d.caseSensitive) ? 1 : 0);
    },
    correctAnswer(def) {
      const d = def as TextDef;
      return d.acceptedAnswers.length ? d.acceptedAnswers.join(" / ") : d.rubric ? `Evaluated manually — ${d.rubric}` : "Evaluated manually";
    },
    describeResponse(_def, response) {
      return response ? (response as { text: string }).text : "Not answered";
    },
  };
}

// ── technical family ───────────────────────────────────────────────────────

function codeSpec(opts: { label: string; description: string; mode: "output" | "coding" | "sql" | "debugging" }): QuestionTypeSpec {
  const answerMode = opts.mode === "output" ? "text" : "code";
  return {
    label: opts.label,
    group: "technical",
    description: opts.description,
    // Code output is compared as text. Coding / SQL / debugging answers are
    // marked by an evaluator — the `testCases` are stored so a sandboxed
    // runner can be plugged in here later without changing the data model.
    autoGradable: (def) => opts.mode === "output" && (def as CodeDef).acceptedAnswers.length > 0,
    normalizeDefinition(raw) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const tcs = Array.isArray(r.testCases) ? r.testCases : [];
      const def: CodeDef = {
        language: str(r.language, 40) || (opts.mode === "sql" ? "sql" : "javascript"),
        code: typeof r.code === "string" ? r.code.slice(0, 20000) : "",
        schema: typeof r.schema === "string" ? r.schema.slice(0, 20000) : "",
        acceptedAnswers: strList(r.acceptedAnswers, 20),
        testCases: tcs.slice(0, 20).map((t, i) => {
          const x = (t ?? {}) as Record<string, unknown>;
          return { id: str(x.id, 40) || `t${i + 1}`, input: String(x.input ?? "").slice(0, 4000), expectedOutput: String(x.expectedOutput ?? "").slice(0, 4000), hidden: x.hidden === true };
        }),
        rubric: str(r.rubric, 4000),
      };
      if ((opts.mode === "output" || opts.mode === "debugging") && !def.code.trim()) throw new QuestionInputError("Add the code snippet the candidate will read.");
      if (opts.mode === "output" && def.acceptedAnswers.length === 0) throw new QuestionInputError("Add the expected output.");
      return def;
    },
    publicDefinition(def) {
      const d = def as CodeDef;
      return {
        kind: "code",
        language: d.language,
        code: d.code,
        schema: d.schema,
        editable: opts.mode !== "output",
        answerMode,
        sampleTests: d.testCases.filter((t) => !t.hidden).map((t) => ({ input: t.input, expectedOutput: t.expectedOutput })),
      };
    },
    normalizeResponse(raw) {
      if (answerMode === "text") {
        const text = typeof (raw as { text?: unknown })?.text === "string" ? (raw as { text: string }).text.slice(0, 5000) : "";
        return text.trim() ? { text } : null;
      }
      const code = typeof (raw as { code?: unknown })?.code === "string" ? (raw as { code: string }).code.slice(0, 50000) : "";
      return code.trim() ? { code } : null;
    },
    evaluate(def, response) {
      const d = def as CodeDef;
      if (opts.mode !== "output" || d.acceptedAnswers.length === 0) return { status: "manual" };
      // Output comparison ignores trailing whitespace on each line and surrounding blank lines.
      const norm = (s: string) => s.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").trim();
      const ans = norm((response as { text: string }).text);
      return grade(d.acceptedAnswers.some((a) => norm(a) === ans) ? 1 : 0);
    },
    correctAnswer(def) {
      const d = def as CodeDef;
      if (d.acceptedAnswers.length) return d.acceptedAnswers.join(" / ");
      return d.rubric ? `Evaluated manually — ${d.rubric}` : "Evaluated manually";
    },
    describeResponse(_def, response) {
      if (!response) return "Not answered";
      return "code" in response ? response.code : (response as { text: string }).text;
    },
  };
}

// ── registry ───────────────────────────────────────────────────────────────

export const QUESTION_TYPES: Record<QuestionType, QuestionTypeSpec> = {
  single_choice: choiceSpec({ label: "Single Choice", group: "objective", description: "Pick exactly one correct option.", multiple: false }),
  multiple_choice: choiceSpec({ label: "Multiple Choice", group: "objective", description: "Several options can be correct; partial credit per correct pick, wrong picks cancel right ones.", multiple: "partial" }),
  multiple_select: choiceSpec({ label: "Multiple Select", group: "objective", description: "Select every correct option — all-or-nothing marking.", multiple: "all" }),
  true_false: choiceSpec({ label: "True / False", group: "objective", description: "A statement that is true or false.", multiple: false, fixed: [{ id: "true", text: "True" }, { id: "false", text: "False" }] }),
  yes_no: choiceSpec({ label: "Yes / No", group: "objective", description: "A yes-or-no question.", multiple: false, fixed: [{ id: "yes", text: "Yes" }, { id: "no", text: "No" }] }),
  short_answer: textSpec({ label: "Short Answer", description: "A word or sentence. Auto-marked when accepted answers are given, otherwise evaluated manually.", long: false }),
  long_answer: textSpec({ label: "Long Answer", description: "An essay-style answer, always evaluated manually.", long: true }),
  fill_blank: {
    label: "Fill in the Blank",
    group: "text",
    description: "Write [[1]], [[2]]… in the question where blanks go; partial credit per blank.",
    autoGradable: (def) => (def as FillBlankDef).blanks.every((b) => b.accepted.length > 0),
    normalizeDefinition(raw, prompt) {
      const r = (raw ?? {}) as { blanks?: unknown; caseSensitive?: unknown };
      const count = new Set(Array.from(prompt.matchAll(/\[\[(\d+)\]\]/g)).map((m) => m[1])).size;
      if (count === 0) throw new QuestionInputError("Mark each blank in the question text as [[1]], [[2]] …");
      const list = Array.isArray(r.blanks) ? r.blanks : [];
      const blanks = Array.from({ length: count }, (_, i) => {
        const b = (list[i] ?? {}) as { accepted?: unknown };
        return { id: String(i + 1), accepted: strList(b.accepted, 20) };
      });
      if (blanks.some((b) => b.accepted.length === 0)) throw new QuestionInputError("Give at least one accepted answer for every blank.");
      return { blanks, caseSensitive: r.caseSensitive === true } satisfies FillBlankDef;
    },
    publicDefinition(def) {
      return { kind: "fill_blank", blankIds: (def as FillBlankDef).blanks.map((b) => b.id) };
    },
    normalizeResponse(raw, def) {
      const d = def as FillBlankDef;
      const src = ((raw as { blanks?: unknown })?.blanks ?? {}) as Record<string, unknown>;
      const blanks: Record<string, string> = {};
      for (const b of d.blanks) {
        const v = typeof src[b.id] === "string" ? (src[b.id] as string).slice(0, 500) : "";
        if (v.trim()) blanks[b.id] = v;
      }
      return Object.keys(blanks).length ? { blanks } : null;
    },
    evaluate(def, response) {
      const d = def as FillBlankDef;
      const ans = (response as { blanks: Record<string, string> }).blanks;
      const right = d.blanks.filter((b) => ans[b.id] !== undefined && matchesAny(ans[b.id], b.accepted, d.caseSensitive)).length;
      return grade(right / d.blanks.length);
    },
    correctAnswer(def) {
      return (def as FillBlankDef).blanks.map((b) => `[${b.id}] ${b.accepted.join(" / ")}`).join("  ");
    },
    describeResponse(def, response) {
      if (!response) return "Not answered";
      const ans = (response as { blanks: Record<string, string> }).blanks;
      return (def as FillBlankDef).blanks.map((b) => `[${b.id}] ${ans[b.id] ?? "—"}`).join("  ");
    },
  },
  code_output: codeSpec({ label: "Code Output", description: "Read a snippet and type exactly what it prints.", mode: "output" }),
  coding: codeSpec({ label: "Coding Question", description: "Write code in an editor. Evaluated manually against the rubric and test cases.", mode: "coding" }),
  sql_query: codeSpec({ label: "SQL Query", description: "Write a query against the given schema. Evaluated manually.", mode: "sql" }),
  debugging: codeSpec({ label: "Debugging Question", description: "Find and fix the bug in the given code. Evaluated manually.", mode: "debugging" }),
  match_following: {
    label: "Match the Following",
    group: "matching",
    description: "Match every left item to its right item; partial credit per pair.",
    autoGradable: () => true,
    normalizeDefinition(raw) {
      const list = Array.isArray((raw as { pairs?: unknown })?.pairs) ? ((raw as { pairs: unknown[] }).pairs) : [];
      const pairs = list
        .map((p, i) => {
          const x = (p ?? {}) as Record<string, unknown>;
          return { id: str(x.id, 40) || `p${i + 1}`, left: str(x.left, 500), right: str(x.right, 500) };
        })
        .filter((p) => p.left && p.right)
        .slice(0, 12);
      if (pairs.length < 2) throw new QuestionInputError("Add at least two complete pairs.");
      if (new Set(pairs.map((p) => p.id)).size !== pairs.length) throw new QuestionInputError("Pair ids must be unique.");
      return { pairs } satisfies MatchDef;
    },
    publicDefinition(def, { rng }) {
      const d = def as MatchDef;
      // The right column is ALWAYS shuffled — otherwise the answer is the row order.
      return {
        kind: "match",
        left: d.pairs.map((p) => ({ id: p.id, text: p.left })),
        right: shuffled(d.pairs.map((p) => ({ id: p.id, text: p.right })), rng),
      };
    },
    normalizeResponse(raw, def) {
      const d = def as MatchDef;
      const ids = new Set(d.pairs.map((p) => p.id));
      const src = ((raw as { pairs?: unknown })?.pairs ?? {}) as Record<string, unknown>;
      const pairs: Record<string, string> = {};
      for (const [k, v] of Object.entries(src)) if (ids.has(k) && typeof v === "string" && ids.has(v)) pairs[k] = v;
      return Object.keys(pairs).length ? { pairs } : null;
    },
    evaluate(def, response) {
      const d = def as MatchDef;
      const ans = (response as { pairs: Record<string, string> }).pairs;
      return grade(d.pairs.filter((p) => ans[p.id] === p.id).length / d.pairs.length);
    },
    correctAnswer(def) {
      return (def as MatchDef).pairs.map((p) => `${p.left} → ${p.right}`).join(" · ");
    },
    describeResponse(def, response) {
      if (!response) return "Not answered";
      const d = def as MatchDef;
      const ans = (response as { pairs: Record<string, string> }).pairs;
      return d.pairs.map((p) => `${p.left} → ${d.pairs.find((x) => x.id === ans[p.id])?.right ?? "—"}`).join(" · ");
    },
  },
  ordering: {
    label: "Ordering / Sequence",
    group: "matching",
    description: "Put the items in the correct order (enter them in the correct order); partial credit per position.",
    autoGradable: () => true,
    normalizeDefinition(raw) {
      const list = Array.isArray((raw as { items?: unknown })?.items) ? ((raw as { items: unknown[] }).items) : [];
      const items = list
        .map((it, i) => ({ id: str((it as { id?: unknown })?.id, 40) || `s${i + 1}`, text: str(typeof it === "string" ? it : (it as { text?: unknown })?.text, 500) }))
        .filter((x) => x.text)
        .slice(0, 12);
      if (items.length < 2) throw new QuestionInputError("Add at least two items.");
      if (new Set(items.map((p) => p.id)).size !== items.length) throw new QuestionInputError("Item ids must be unique.");
      return { items } satisfies OrderingDef;
    },
    publicDefinition(def, { rng }) {
      const d = def as OrderingDef;
      let items = shuffled(d.items, rng);
      // Never hand out the answer as the starting order.
      if (items.every((x, i) => x.id === d.items[i].id)) items = [...items.slice(1), items[0]];
      return { kind: "ordering", items };
    },
    normalizeResponse(raw, def) {
      const d = def as OrderingDef;
      const ids = new Set(d.items.map((x) => x.id));
      const order = (Array.isArray((raw as { order?: unknown })?.order) ? ((raw as { order: unknown[] }).order) : []).map(String).filter((x) => ids.has(x));
      return order.length === d.items.length && new Set(order).size === order.length ? { order } : null;
    },
    evaluate(def, response) {
      const d = def as OrderingDef;
      const order = (response as { order: string[] }).order;
      return grade(d.items.filter((x, i) => order[i] === x.id).length / d.items.length);
    },
    correctAnswer(def) {
      return (def as OrderingDef).items.map((x, i) => `${i + 1}. ${x.text}`).join("  ");
    },
    describeResponse(def, response) {
      if (!response) return "Not answered";
      const d = def as OrderingDef;
      return (response as { order: string[] }).order.map((id, i) => `${i + 1}. ${d.items.find((x) => x.id === id)?.text ?? "?"}`).join("  ");
    },
  },
  image_based: choiceSpec({ label: "Image-Based Question", group: "media", description: "A single-choice question about an image.", multiple: false, requiresMedia: "image" }),
  audio_based: choiceSpec({ label: "Audio-Based Question", group: "media", description: "A single-choice question about an audio clip.", multiple: false, requiresMedia: "audio" }),
  video_based: choiceSpec({ label: "Video-Based Question", group: "media", description: "A single-choice question about a video.", multiple: false, requiresMedia: "video" }),
};

export const QUESTION_TYPE_LIST = (Object.keys(QUESTION_TYPES) as QuestionType[]).map((value) => ({ value, label: QUESTION_TYPES[value].label, group: QUESTION_TYPES[value].group }));

export function isQuestionType(v: unknown): v is QuestionType {
  return typeof v === "string" && v in QUESTION_TYPES;
}

export function questionTypeLabel(t: string): string {
  return isQuestionType(t) ? QUESTION_TYPES[t].label : t;
}

/** Deterministic PRNG (mulberry32) so an attempt's shuffles are reproducible from its seed. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
