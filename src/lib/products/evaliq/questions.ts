import "server-only";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/mongodb";
import { parseCsv } from "@/lib/products/rankmax-ai/csv-parse";
import { COLLECTIONS, createStamp, escapeRx, newId, nextCode, notDeleted, updateStamp, type AuditFields } from "@/lib/products/evaliq/db";
import { OtsInputError, NotFoundError } from "@/lib/products/evaliq/viewer";
import { QUESTION_DIFFICULTIES, QUESTION_STATUSES, type QuestionStatus } from "@/lib/products/evaliq/constants";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LIST,
  QuestionInputError,
  isQuestionType,
  type ChoiceDef,
  type CodeDef,
  type FillBlankDef,
  type MatchDef,
  type OrderingDef,
  type QuestionDefinition,
  type QuestionType,
  type TextDef,
} from "@/lib/products/evaliq/question-types";

/**
 * The central, reusable Question Bank. A question is authored once and can
 * be picked manually into any number of tests or drawn by a test's automatic
 * selection rules. Attempts freeze a snapshot of every question they use, so
 * editing or archiving a question never changes a result already taken.
 */

export type QuestionDifficulty = "beginner" | "intermediate" | "advanced" | "expert";

export interface QuestionMedia {
  kind: "image" | "audio" | "video";
  /** https URL, or an `/api/evaliq/media/...` path for an uploaded file. */
  url: string;
  caption: string;
}

export interface Question extends AuditFields {
  _id: string;
  code: string;
  type: QuestionType;
  prompt: string;
  media: QuestionMedia | null;
  categoryId: string | null;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  marks: number;
  negativeMarks: number;
  explanation: string;
  tags: string[];
  status: QuestionStatus;
  definition: QuestionDefinition;
  /** Bumped on every content edit — lets reports tell an attempt's snapshot apart from the current version. */
  version: number;
}

export interface QuestionInput {
  type: QuestionType;
  prompt: string;
  media: QuestionMedia | null;
  categoryId: string | null;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  marks: number;
  negativeMarks: number;
  explanation: string;
  tags: string[];
  status: QuestionStatus;
  definition: QuestionDefinition;
}

const MEDIA_URL = /^(https:\/\/[^\s]+|\/api\/ots\/media\/[A-Za-z0-9/_.-]+)$/;

export function parseQuestionInput(raw: Record<string, unknown>): QuestionInput {
  const type = raw.type;
  if (!isQuestionType(type)) throw new OtsInputError("Choose a question type.");
  const spec = QUESTION_TYPES[type];
  const prompt = String(raw.prompt ?? "").trim().slice(0, 10000);
  if (!prompt) throw new OtsInputError("Write the question.");

  let media: QuestionMedia | null = null;
  const m = (raw.media ?? null) as { kind?: unknown; url?: unknown; caption?: unknown } | null;
  if (m && typeof m.url === "string" && m.url.trim()) {
    const url = m.url.trim();
    if (!MEDIA_URL.test(url)) throw new OtsInputError("Media must be an https:// link or an uploaded file.");
    const kind = m.kind === "audio" || m.kind === "video" ? m.kind : "image";
    media = { kind, url, caption: String(m.caption ?? "").trim().slice(0, 300) };
  }
  if (spec.requiresMedia && (!media || media.kind !== spec.requiresMedia)) throw new OtsInputError(`${spec.label}s need ${spec.requiresMedia === "image" ? "an image" : `a ${spec.requiresMedia} clip`}.`);

  const difficulty = QUESTION_DIFFICULTIES.some((d) => d.value === raw.difficulty) ? (raw.difficulty as QuestionDifficulty) : "intermediate";
  const marks = Number(raw.marks);
  if (!Number.isFinite(marks) || marks <= 0 || marks > 1000) throw new OtsInputError("Marks must be a positive number.");
  const negativeMarks = Math.max(0, Number(raw.negativeMarks) || 0);
  if (negativeMarks > marks) throw new OtsInputError("Negative marks cannot exceed the question's marks.");
  const status = QUESTION_STATUSES.some((s) => s.value === raw.status) ? (raw.status as QuestionStatus) : "active";
  const tags = (Array.isArray(raw.tags) ? raw.tags : String(raw.tags ?? "").split(","))
    .map((t) => String(t).trim().toLowerCase().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20);

  let definition: QuestionDefinition;
  try {
    definition = spec.normalizeDefinition(raw.definition, prompt);
  } catch (err) {
    if (err instanceof QuestionInputError) throw new OtsInputError(err.message);
    throw err;
  }
  return {
    type,
    prompt,
    media,
    categoryId: typeof raw.categoryId === "string" && raw.categoryId ? raw.categoryId : null,
    subject: String(raw.subject ?? "").trim().slice(0, 80),
    topic: String(raw.topic ?? "").trim().slice(0, 80),
    difficulty,
    marks: Math.round(marks * 100) / 100,
    negativeMarks: Math.round(negativeMarks * 100) / 100,
    explanation: String(raw.explanation ?? "").trim().slice(0, 5000),
    tags: Array.from(new Set(tags)),
    status,
    definition,
  };
}

async function col() {
  const db = await getDb();
  return db.collection<Question>(COLLECTIONS.questions);
}

export async function getQuestion(id: string): Promise<Question | null> {
  return (await col()).findOne({ _id: id, ...notDeleted });
}

export async function requireQuestion(id: string): Promise<Question> {
  const q = await getQuestion(id);
  if (!q) throw new NotFoundError();
  return q;
}

export async function createQuestion(input: QuestionInput, actorId: string): Promise<Question> {
  const doc: Question = { _id: newId(), code: await nextCode("Q", "question_code", 5), ...input, version: 1, ...createStamp(actorId) };
  await (await col()).insertOne(doc);
  return doc;
}

export async function updateQuestion(id: string, input: QuestionInput, actorId: string): Promise<{ before: Question; after: Question }> {
  const before = await requireQuestion(id);
  const after: Question = { ...before, ...input, version: before.version + 1, ...updateStamp(actorId) };
  await (await col()).updateOne({ _id: id }, { $set: { ...input, version: after.version, ...updateStamp(actorId) } });
  return { before, after };
}

export async function duplicateQuestion(id: string, actorId: string): Promise<Question> {
  const q = await requireQuestion(id);
  const input: QuestionInput = { type: q.type, prompt: q.prompt, media: q.media, categoryId: q.categoryId, subject: q.subject, topic: q.topic, difficulty: q.difficulty, marks: q.marks, negativeMarks: q.negativeMarks, explanation: q.explanation, tags: q.tags, status: "draft", definition: q.definition };
  return createQuestion(input, actorId);
}

export async function setQuestionStatus(id: string, status: QuestionStatus, actorId: string): Promise<Question> {
  const q = await requireQuestion(id);
  await (await col()).updateOne({ _id: id }, { $set: { status, ...updateStamp(actorId) } });
  return { ...q, status };
}

/** Deleting is only allowed while no test selects the question by hand (attempts keep their own snapshot). */
export async function deleteQuestion(id: string, actorId: string): Promise<Question> {
  const q = await requireQuestion(id);
  const usage = (await questionUsage([id])).get(id);
  if (usage && usage.tests.length > 0) throw new OtsInputError(`Used in ${usage.tests.length} test${usage.tests.length === 1 ? "" : "s"} (${usage.tests.map((t) => t.name).slice(0, 3).join(", ")}). Remove it from those tests or archive it instead.`);
  await (await col()).updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return q;
}

export interface QuestionUsage {
  tests: { id: string; name: string; code: string }[];
  attempts: number;
}

export async function questionUsage(ids: string[]): Promise<Map<string, QuestionUsage>> {
  const out = new Map<string, QuestionUsage>(ids.map((id) => [id, { tests: [], attempts: 0 }]));
  if (ids.length === 0) return out;
  const db = await getDb();
  const [tests, attempts] = await Promise.all([
    db
      .collection<{ _id: string; name: string; code: string; sections: { questionIds: string[] }[] }>(COLLECTIONS.tests)
      .find({ deletedAt: null, "sections.questionIds": { $in: ids } }, { projection: { name: 1, code: 1, "sections.questionIds": 1 } })
      .toArray(),
    db
      .collection(COLLECTIONS.attempts)
      .aggregate<{ _id: string; n: number }>([{ $match: { "paper.qid": { $in: ids } } }, { $unwind: "$paper" }, { $match: { "paper.qid": { $in: ids } } }, { $group: { _id: "$paper.qid", n: { $sum: 1 } } }])
      .toArray(),
  ]);
  for (const t of tests) {
    const used = new Set(t.sections.flatMap((s) => s.questionIds));
    for (const id of ids) if (used.has(id)) out.get(id)!.tests.push({ id: t._id, name: t.name, code: t.code });
  }
  for (const a of attempts) if (out.has(a._id)) out.get(a._id)!.attempts = a.n;
  return out;
}

export interface QuestionFilter {
  q?: string;
  type?: string;
  categoryId?: string;
  difficulty?: string;
  status?: string;
  subject?: string;
  topic?: string;
  tag?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  ids?: string[];
}

function buildFilter(f: QuestionFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (f.ids) filter._id = { $in: f.ids };
  if (f.type && isQuestionType(f.type)) filter.type = f.type;
  else if (f.type?.startsWith("group:")) filter.type = { $in: QUESTION_TYPE_LIST.filter((t) => t.group === f.type!.slice(6)).map((t) => t.value) };
  if (f.categoryId) filter.categoryId = f.categoryId === "none" ? null : f.categoryId;
  if (f.difficulty) filter.difficulty = f.difficulty;
  if (f.status === "all") {
    // everything
  } else if (f.status) filter.status = f.status;
  else filter.status = { $ne: "archived" };
  if (f.subject) filter.subject = { $regex: `^${escapeRx(f.subject)}$`, $options: "i" };
  if (f.topic) filter.topic = { $regex: `^${escapeRx(f.topic)}$`, $options: "i" };
  if (f.tag) filter.tags = f.tag.toLowerCase();
  if (f.q?.trim()) {
    const rx = new RegExp(escapeRx(f.q.trim()), "i");
    filter.$or = [{ prompt: rx }, { code: rx }, { subject: rx }, { topic: rx }, { tags: rx }];
  }
  return filter;
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  updated: { updatedAt: -1 },
  created: { createdAt: -1 },
  code: { code: 1 },
  marks: { marks: -1, updatedAt: -1 },
  difficulty: { difficulty: 1, updatedAt: -1 },
};

export async function listQuestions(f: QuestionFilter) {
  const c = await col();
  const page = Math.max(f.page ?? 1, 1);
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 200);
  const filter = buildFilter(f);
  const [items, total] = await Promise.all([
    c.find(filter).sort(SORTS[f.sort ?? ""] ?? SORTS.updated).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    c.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function exportQuestionDocs(f: QuestionFilter, cap = 10000): Promise<Question[]> {
  return (await col()).find(buildFilter(f)).sort({ code: 1 }).limit(cap).toArray();
}

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return [];
  return (await col()).find({ _id: { $in: ids }, ...notDeleted }).toArray();
}

/** Distinct subjects / topics / tags for filter + autocomplete. */
export async function questionFacets(): Promise<{ subjects: string[]; topics: string[]; tags: string[] }> {
  const c = await col();
  const [subjects, topics, tags] = await Promise.all([c.distinct("subject", notDeleted), c.distinct("topic", notDeleted), c.distinct("tags", notDeleted)]);
  const clean = (xs: unknown[]) => (xs.filter((x) => typeof x === "string" && x) as string[]).sort((a, b) => a.localeCompare(b));
  return { subjects: clean(subjects), topics: clean(topics), tags: clean(tags) };
}

// ── Automatic-selection pool ────────────────────────────────────────────────

export interface SelectionRule {
  id: string;
  count: number;
  difficulty: string;
  categoryId: string;
  type: string;
  subject: string;
  topic: string;
  tag: string;
}

/** Active questions matching a rule (never archived / draft). */
export function ruleFilter(rule: SelectionRule, excludeIds: string[] = []): Record<string, unknown> {
  const f: Record<string, unknown> = { ...notDeleted, status: "active" };
  if (rule.difficulty) f.difficulty = rule.difficulty;
  if (rule.categoryId) f.categoryId = rule.categoryId;
  if (rule.type) f.type = rule.type;
  if (rule.subject) f.subject = { $regex: `^${escapeRx(rule.subject)}$`, $options: "i" };
  if (rule.topic) f.topic = { $regex: `^${escapeRx(rule.topic)}$`, $options: "i" };
  if (rule.tag) f.tags = rule.tag.toLowerCase();
  if (excludeIds.length) f._id = { $nin: excludeIds };
  return f;
}

export async function countPool(rule: SelectionRule, excludeIds: string[] = []): Promise<number> {
  return (await col()).countDocuments(ruleFilter(rule, excludeIds));
}

/** Average marks of the questions a rule could draw — used to estimate a test's total when draws vary. */
export async function avgPoolMarks(rule: SelectionRule, excludeIds: string[] = []): Promise<number> {
  const [row] = await (await col()).aggregate<{ avg: number }>([{ $match: ruleFilter(rule, excludeIds) }, { $group: { _id: null, avg: { $avg: "$marks" } } }]).toArray();
  return row?.avg ?? 0;
}

export async function poolIds(rule: SelectionRule, excludeIds: string[] = []): Promise<string[]> {
  const rows = await (await col()).find(ruleFilter(rule, excludeIds), { projection: { _id: 1 } }).limit(5000).toArray();
  return rows.map((r) => r._id);
}

// ── Import / export (CSV & Excel) ───────────────────────────────────────────

export const IO_COLUMNS = [
  { header: "Type", key: "type", width: 18 },
  { header: "Question", key: "question", width: 60 },
  { header: "Option A", key: "option_a", width: 24 },
  { header: "Option B", key: "option_b", width: 24 },
  { header: "Option C", key: "option_c", width: 24 },
  { header: "Option D", key: "option_d", width: 24 },
  { header: "Option E", key: "option_e", width: 24 },
  { header: "Option F", key: "option_f", width: 24 },
  { header: "Correct Answer", key: "correct_answer", width: 24 },
  { header: "Category", key: "category", width: 18 },
  { header: "Subject", key: "subject", width: 16 },
  { header: "Topic", key: "topic", width: 16 },
  { header: "Difficulty", key: "difficulty", width: 13 },
  { header: "Marks", key: "marks", width: 8 },
  { header: "Negative Marks", key: "negative_marks", width: 10 },
  { header: "Explanation", key: "explanation", width: 40 },
  { header: "Tags", key: "tags", width: 20 },
  { header: "Code", key: "code_snippet", width: 40 },
  { header: "Language", key: "language", width: 12 },
  { header: "Media URL", key: "media_url", width: 30 },
  { header: "Status", key: "status", width: 10 },
] as const;
const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d", "option_e", "option_f"] as const;
const LETTERS = "ABCDEF";

export const IMPORT_HELP = [
  "Single Choice / Multiple Choice / Multiple Select / Image/Audio/Video-Based: options in Option A–F, Correct Answer = letters (e.g. B or A,C).",
  "True / False and Yes / No: Correct Answer = True/False or Yes/No.",
  "Short Answer / Code Output: Correct Answer = accepted answers separated by | (leave empty to mark manually).",
  "Fill in the Blank: write [[1]], [[2]] in the question; Correct Answer = each blank's answers separated by ||, alternatives by |.",
  "Match the Following: each Option = left => right.",
  "Ordering / Sequence: Option A–F in the correct order.",
  "Long Answer / Coding / SQL / Debugging: Correct Answer = rubric (optional); Code = snippet / starter code.",
];

function typeFromCell(v: string): QuestionType | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  const hit = QUESTION_TYPE_LIST.find((t) => t.value === s.replace(/[\s/-]+/g, "_") || t.label.toLowerCase() === s);
  return hit ? hit.value : null;
}

/** One spreadsheet row → raw question input (validated later by `parseQuestionInput`). */
function rowToRaw(row: Record<string, string>, categoryByName: Map<string, string>): Record<string, unknown> {
  const type = typeFromCell(row.type ?? "");
  if (!type) throw new OtsInputError(`Unknown question type "${row.type ?? ""}".`);
  const options = OPTION_KEYS.map((k) => (row[k] ?? "").trim()).filter(Boolean);
  const correct = (row.correct_answer ?? "").trim();
  const bars = (s: string) => s.split("|").map((x) => x.trim()).filter(Boolean);
  let definition: Record<string, unknown> = {};
  const group = QUESTION_TYPES[type].group;
  if (type === "true_false" || type === "yes_no") definition = { correct: [correct.toLowerCase()] };
  else if (group === "objective" || group === "media") {
    definition = {
      options: options.map((text, i) => ({ id: `o${i + 1}`, text })),
      correct: correct
        .split(/[,;\s]+/)
        .map((l) => LETTERS.indexOf(l.trim().toUpperCase()))
        .filter((i) => i >= 0)
        .map((i) => `o${i + 1}`),
    };
  } else if (type === "short_answer") definition = { acceptedAnswers: bars(correct) };
  else if (type === "long_answer") definition = { rubric: correct };
  else if (type === "fill_blank") definition = { blanks: correct.split("||").map((b) => ({ accepted: bars(b) })) };
  else if (type === "match_following")
    definition = {
      pairs: options.map((o, i) => {
        const [left, right] = o.split("=>").map((x) => x.trim());
        return { id: `p${i + 1}`, left: left ?? "", right: right ?? "" };
      }),
    };
  else if (type === "ordering") definition = { items: options.map((text, i) => ({ id: `s${i + 1}`, text })) };
  else definition = { language: row.language ?? "", code: row.code_snippet ?? "", acceptedAnswers: type === "code_output" ? bars(correct) : [], rubric: type === "code_output" ? "" : correct };

  const media = (row.media_url ?? "").trim();
  const mediaKind = type === "audio_based" ? "audio" : type === "video_based" ? "video" : "image";
  const catName = (row.category ?? "").trim().toLowerCase();
  return {
    type,
    prompt: row.question ?? "",
    definition,
    media: media ? { kind: mediaKind, url: media, caption: "" } : null,
    categoryId: catName ? categoryByName.get(catName) ?? null : null,
    subject: row.subject ?? "",
    topic: row.topic ?? "",
    difficulty: (row.difficulty ?? "intermediate").trim().toLowerCase() || "intermediate",
    marks: (row.marks ?? "").trim() || "1",
    negativeMarks: row.negative_marks ?? "0",
    explanation: row.explanation ?? "",
    tags: row.tags ?? "",
    status: (row.status ?? "active").trim().toLowerCase() || "active",
  };
}

export function questionToRow(q: Question, categoryName: string): Record<string, string | number> {
  const row: Record<string, string | number> = {
    type: QUESTION_TYPES[q.type].label,
    question: q.prompt,
    correct_answer: "",
    category: categoryName,
    subject: q.subject,
    topic: q.topic,
    difficulty: q.difficulty,
    marks: q.marks,
    negative_marks: q.negativeMarks,
    explanation: q.explanation,
    tags: q.tags.join(", "),
    code_snippet: "",
    language: "",
    media_url: q.media?.url ?? "",
    status: q.status,
  };
  const d = q.definition;
  const group = QUESTION_TYPES[q.type].group;
  if (q.type === "true_false" || q.type === "yes_no") row.correct_answer = (d as ChoiceDef).correct[0] === "true" || (d as ChoiceDef).correct[0] === "yes" ? (q.type === "true_false" ? "True" : "Yes") : q.type === "true_false" ? "False" : "No";
  else if (group === "objective" || group === "media") {
    const c = d as ChoiceDef;
    c.options.slice(0, 6).forEach((o, i) => (row[OPTION_KEYS[i]] = o.text));
    row.correct_answer = c.options.map((o, i) => (c.correct.includes(o.id) ? LETTERS[i] : "")).filter(Boolean).join(",");
  } else if (q.type === "short_answer") row.correct_answer = (d as TextDef).acceptedAnswers.join(" | ");
  else if (q.type === "long_answer") row.correct_answer = (d as TextDef).rubric;
  else if (q.type === "fill_blank") row.correct_answer = (d as FillBlankDef).blanks.map((b) => b.accepted.join(" | ")).join(" || ");
  else if (q.type === "match_following") (d as MatchDef).pairs.slice(0, 6).forEach((p, i) => (row[OPTION_KEYS[i]] = `${p.left} => ${p.right}`));
  else if (q.type === "ordering") (d as OrderingDef).items.slice(0, 6).forEach((x, i) => (row[OPTION_KEYS[i]] = x.text));
  else {
    const c = d as CodeDef;
    row.code_snippet = c.code;
    row.language = c.language;
    row.correct_answer = q.type === "code_output" ? c.acceptedAnswers.join(" | ") : c.rubric;
  }
  return row;
}

/** Reads an uploaded CSV / XLSX into normalised rows (header → snake_case key). */
export async function readSheet(filename: string, buf: Buffer): Promise<Record<string, string>[]> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv") return parseCsv(buf.toString("utf-8").replace(/^﻿/, ""), 2000).rows;
  if (ext !== "xlsx") throw new OtsInputError("Upload a .csv or .xlsx file.");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const text = (v: ExcelJS.CellValue): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
      if ("richText" in v) return v.richText.map((r) => r.text).join("");
      if ("text" in v) return String(v.text);
      if ("result" in v) return String(v.result ?? "");
      if (v instanceof Date) return v.toISOString();
    }
    return String(v);
  };
  let headers: string[] = [];
  const rows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const vals = (row.values as ExcelJS.CellValue[]).slice(1).map(text);
    if (n === 1) headers = vals.map(norm);
    else if (rows.length < 2000) rows.push(Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""])));
  });
  return rows;
}

export interface ImportPreviewRow {
  line: number;
  ok: boolean;
  error: string | null;
  type: string;
  prompt: string;
}

/** Validates every row; with `commit`, inserts the valid ones. Rows are independent — one bad row never blocks the rest. */
export async function importQuestions(
  rows: Record<string, string>[],
  categoryByName: Map<string, string>,
  actorId: string,
  commit: boolean
): Promise<{ preview: ImportPreviewRow[]; created: number }> {
  const preview: ImportPreviewRow[] = [];
  const valid: QuestionInput[] = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    if (Object.values(row).every((v) => !String(v ?? "").trim())) return;
    try {
      const input = parseQuestionInput(rowToRaw(row, categoryByName));
      valid.push(input);
      preview.push({ line, ok: true, error: null, type: QUESTION_TYPES[input.type].label, prompt: input.prompt.slice(0, 140) });
    } catch (err) {
      const msg = err instanceof OtsInputError || err instanceof QuestionInputError ? err.message : "Invalid row.";
      preview.push({ line, ok: false, error: msg, type: row.type ?? "", prompt: (row.question ?? "").slice(0, 140) });
    }
  });
  let created = 0;
  if (commit) {
    for (const input of valid) {
      await createQuestion(input, actorId);
      created += 1;
    }
  }
  return { preview, created };
}
