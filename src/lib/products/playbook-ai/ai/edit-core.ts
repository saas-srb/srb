import "server-only";
import { getOpenAI } from "@/lib/openai";
import { withAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { getPrompt } from "@/lib/prompts/store";
import { DEFAULT_TEXT_MODEL, resolveForCall } from "@/lib/products/viralpulse-ai/models";
import { inline } from "@/lib/products/playbook-ai/catalogue/build";
import { buildAllowSet, checkText } from "@/lib/products/playbook-ai/ai/guard";
import { dataBlock, makeFactBag, textBlock, type FactInput } from "@/lib/products/playbook-ai/ai/facts";
import { checkAiLimits, finishRun, startRun } from "@/lib/products/playbook-ai/ai/runs";
import { diffDocs } from "@/lib/products/playbook-ai/diff";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import { getPbSettings } from "@/lib/products/playbook-ai/pb-settings";
import type { PreparedAttachment } from "@/lib/products/playbook-ai/ai/attachments";
import type { ChatChange } from "@/lib/products/playbook-ai/ai/edit-types";

/**
 * The product-neutral core of "Edit with AI" (ContractFlow clones and Playbook items share it). The model answers with a short list of
 * operations on blocks (replace, insert, delete), never a rewritten document; this module builds the prompt from the registry
 * (`playbook.edit.chat`, pinned rules included), checks every word the model wrote with the fact guard, applies the operations to a copy of
 * the document and validates the result against PBDoc. It never saves anything: the caller stores the returned document as a new version
 * through its own data layer, after its own permission and lock checks. Rate limits (`pb_ai_runs`) and metering are applied here.
 */
const FEATURE = "Playbook AI";

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const MAX_OPS = 30;
export const MAX_MESSAGE = 1500;

// ── Reading the document for the model ────────────────────────────────────────────────────────────────────────
function markup(content: unknown): string {
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const n of content) {
    if (!isNode(n)) continue;
    if (n.type === "text") {
      const marks = Array.isArray(n.marks) ? n.marks.filter(isNode).map((m) => m.type) : [];
      out += marks.includes("bold") && str(n.text).trim() ? `**${str(n.text)}**` : str(n.text);
    } else if (n.type === "var") out += `{{${str(n.key)}${n.format ? `|${str(n.format)}` : ""}${n.fallback ? `|${str(n.fallback)}` : ""}}}`;
    else if (n.type === "placeholder") out += `[[${str(n.key)}|${str(n.label)}${n.hint ? `|${str(n.hint)}` : ""}]]`;
    else if (n.type === "hardBreak") out += "\n";
    else if (n.type === "field") out += `<${str(n.field)}>`;
  }
  return out;
}

function plain(b: Node): string {
  if (b.type === "paragraph" || b.type === "heading" || b.type === "clause") return markup(b.content);
  if (b.type === "bulletList" || b.type === "orderedList") return (Array.isArray(b.items) ? b.items : []).filter(isNode).map((it) => (Array.isArray(it.content) ? it.content.filter(isNode).map(plain).join(" ") : "")).join(" | ");
  if (b.type === "callout") return (Array.isArray(b.content) ? b.content.filter(isNode).map(plain).join(" ") : "");
  if (b.type === "table") return (Array.isArray(b.rows) ? b.rows : []).filter(isNode).map((r) => (Array.isArray(r.cells) ? r.cells.filter(isNode).map((c) => (Array.isArray(c.content) ? c.content.filter(isNode).map(plain).join(" ") : "")).join(" ; ") : "")).join(" || ");
  return "";
}

interface Listed { id: string; type: string; text: string; locked: boolean; depth: number }

/** Every block the model may refer to, in reading order. Sections that are locked are marked and cannot be changed. */
export function listBlocks(doc: PBDoc): Listed[] {
  const out: Listed[] = [];
  const walk = (blocks: unknown[], locked: boolean, depth: number) => {
    for (const raw of blocks) {
      if (!isNode(raw)) continue;
      const id = str(raw.id);
      const t = str(raw.type);
      if (t === "section") { out.push({ id, type: `section "${str(raw.title)}"`, text: "", locked: raw.locked === true, depth }); walk(Array.isArray(raw.children) ? raw.children : [], locked || raw.locked === true, depth + 1); }
      else if (t === "conditional" || t === "repeat") walk(Array.isArray(raw.children) ? raw.children : [], locked, depth + 1);
      else if (t === "paragraph" || t === "heading" || t === "clause" || t === "callout") out.push({ id, type: t === "heading" ? `heading level ${String(raw.level)}` : t, text: plain(raw), locked, depth });
      else if (t === "bulletList" || t === "orderedList" || t === "table") {
        out.push({ id, type: t, text: plain(raw), locked, depth });
        // paragraphs inside list items and cells can be rewritten in place
        const inner: Node[] = t === "table" ? (Array.isArray(raw.rows) ? raw.rows : []).filter(isNode).flatMap((r) => (Array.isArray(r.cells) ? r.cells : []).filter(isNode).flatMap((c) => (Array.isArray(c.content) ? c.content : []).filter(isNode))) : (Array.isArray(raw.items) ? raw.items : []).filter(isNode).flatMap((it) => (Array.isArray(it.content) ? it.content : []).filter(isNode));
        for (const p of inner) if (p.type === "paragraph") out.push({ id: str(p.id), type: "paragraph (inside)", text: plain(p), locked, depth: depth + 1 });
      } else if (t === "signatureBlock") out.push({ id, type: "signature block", text: str(raw.label), locked: true, depth });
    }
  };
  walk(doc.body as unknown[], false, 0);
  return out;
}

export function documentText(doc: PBDoc): string {
  return listBlocks(doc).map((b) => b.text).filter(Boolean).join("\n");
}

export function documentForModel(doc: PBDoc): string {
  return listBlocks(doc).map((b) => `${"  ".repeat(b.depth)}[${b.id}] ${b.type}${b.locked ? " LOCKED" : ""}${b.text ? `: ${b.text.replace(/\s+/g, " ").slice(0, 700)}` : ""}`).join("\n");
}

// ── The model's answer ────────────────────────────────────────────────────────────────────────────────────────
export interface EditOp { op: "replace" | "insert" | "delete"; blockId: string | null; blockType: "paragraph" | "heading" | "clause" | "bullets" | "none"; level: number; text: string }
interface EditAnswer { reply: string; summary: string; operations: EditOp[]; attachmentText: string; steps: string[] }

const EDIT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["reply", "summary", "steps", "operations", "attachmentText"],
  properties: {
    reply: { type: "string" },
    summary: { type: "string" },
    attachmentText: { type: "string" },
    steps: { type: "array", maxItems: 12, items: { type: "string" } },
    operations: {
      type: "array", maxItems: MAX_OPS,
      items: {
        type: "object", additionalProperties: false, required: ["op", "blockId", "blockType", "level", "text"],
        properties: {
          op: { type: "string", enum: ["replace", "insert", "delete"] },
          blockId: { type: ["string", "null"] },
          blockType: { type: "string", enum: ["paragraph", "heading", "clause", "bullets", "none"] },
          level: { type: "integer" },
          text: { type: "string" },
        },
      },
    },
  },
} as const;

function parseAnswer(raw: string | undefined): EditAnswer | null {
  if (!raw) return null;
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return null; }
  if (!isNode(j) || typeof j.reply !== "string" || typeof j.summary !== "string" || !Array.isArray(j.operations)) return null;
  const ops: EditOp[] = [];
  for (const o of j.operations.slice(0, MAX_OPS)) {
    if (!isNode(o) || !["replace", "insert", "delete"].includes(str(o.op))) return null;
    ops.push({ op: o.op as EditOp["op"], blockId: typeof o.blockId === "string" ? o.blockId : null, blockType: (["paragraph", "heading", "clause", "bullets", "none"].includes(str(o.blockType)) ? o.blockType : "none") as EditOp["blockType"], level: Number.isInteger(o.level) ? (o.level as number) : 0, text: str(o.text).slice(0, 4000) });
  }
  return { reply: j.reply.slice(0, 1200), summary: j.summary.slice(0, 120), operations: ops, attachmentText: str(j.attachmentText).slice(0, 8000), steps: Array.isArray(j.steps) ? j.steps.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 12) : [] };
}

// ── Applying operations (pure) ────────────────────────────────────────────────────────────────────────────────
function findContainer(blocks: Node[], id: string, locked: boolean): { arr: Node[]; index: number; locked: boolean } | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (str(b.id) === id) return { arr: blocks, index: i, locked };
    const t = str(b.type);
    if ((t === "section" || t === "conditional" || t === "repeat") && Array.isArray(b.children)) {
      const r = findContainer(b.children as Node[], id, locked || (t === "section" && b.locked === true));
      if (r) return r;
    }
  }
  return null;
}

/** Finds a block anywhere (including paragraphs inside list items and cells); returns the block, and whether it sits in a locked section. */
function findAnyBlock(blocks: Node[], id: string, locked: boolean): { block: Node; locked: boolean } | null {
  for (const b of blocks) {
    if (str(b.id) === id) return { block: b, locked };
    const t = str(b.type);
    if ((t === "section" || t === "conditional" || t === "repeat") && Array.isArray(b.children)) {
      const r = findAnyBlock(b.children as Node[], id, locked || (t === "section" && b.locked === true));
      if (r) return r;
    } else if (t === "bulletList" || t === "orderedList") {
      for (const it of (Array.isArray(b.items) ? b.items : []).filter(isNode)) { const r = findAnyBlock(Array.isArray(it.content) ? (it.content as Node[]) : [], id, locked); if (r) return r; }
    } else if (t === "table") {
      for (const row of (Array.isArray(b.rows) ? b.rows : []).filter(isNode)) for (const c of (Array.isArray(row.cells) ? row.cells : []).filter(isNode)) { const r = findAnyBlock(Array.isArray(c.content) ? (c.content as Node[]) : [], id, locked); if (r) return r; }
    } else if (t === "callout") { const r = findAnyBlock(Array.isArray(b.content) ? (b.content as Node[]) : [], id, locked); if (r) return r; }
  }
  return null;
}

/** The nearest flow-level container holding `id` (the body, or the children of a section, condition or repeat), and the index of the flow block that contains it. */
function flowPosition(blocks: Node[], id: string, locked: boolean): { arr: Node[]; index: number; locked: boolean } | null {
  const direct = findContainer(blocks, id, locked);
  if (direct) return direct;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const t = str(b.type);
    if ((t === "section" || t === "conditional" || t === "repeat") && Array.isArray(b.children)) {
      const r = flowPosition(b.children as Node[], id, locked || (t === "section" && b.locked === true));
      if (r) return r;
    } else if (findAnyBlock([b], id, locked)) return { arr: blocks, index: i, locked };
  }
  return null;
}

const newBlock = (op: EditOp): Node | null => {
  const text = op.text.trim();
  if (!text) return null;
  if (op.blockType === "bullets") {
    const items = text.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 30);
    return items.length ? { type: "bulletList", items: items.map((l) => ({ content: [{ type: "paragraph", content: inline(l) }] })) } : null;
  }
  if (op.blockType === "heading") return { type: "heading", level: op.level >= 1 && op.level <= 3 ? op.level : 2, content: inline(text) };
  if (op.blockType === "clause") return { type: "clause", level: op.level >= 1 && op.level <= 3 ? op.level : 1, numbered: true, content: inline(text) };
  if (op.blockType === "paragraph") return { type: "paragraph", content: inline(text) };
  return null;
};

export interface ApplyReport { doc: PBDoc | null; applied: number; skipped: string[] }

export function applyOps(doc: PBDoc, ops: readonly EditOp[]): ApplyReport {
  const copy = structuredClone(doc) as unknown as { body: Node[] };
  const skipped: string[] = [];
  let applied = 0;
  for (const op of ops) {
    if (op.op === "replace") {
      const f = op.blockId ? findAnyBlock(copy.body, op.blockId, false) : null;
      if (!f) { skipped.push("a block that does not exist"); continue; }
      if (f.locked) { skipped.push("a locked section"); continue; }
      if (!["paragraph", "heading", "clause"].includes(str(f.block.type))) { skipped.push(`a ${str(f.block.type)} (only text blocks can be rewritten)`); continue; }
      if (!op.text.trim()) { skipped.push("an empty replacement"); continue; }
      f.block.content = inline(op.text.trim());
      applied++;
    } else if (op.op === "delete") {
      const pos = op.blockId ? findContainer(copy.body, op.blockId, false) : null;
      if (!pos) { skipped.push("a block that cannot be deleted on its own"); continue; }
      const t = str(pos.arr[pos.index].type);
      if (pos.locked) { skipped.push("a locked section"); continue; }
      if (["signatureBlock", "section", "toc"].includes(t)) { skipped.push(`a ${t}`); continue; }
      pos.arr.splice(pos.index, 1);
      applied++;
    } else {
      const block = newBlock(op);
      if (!block) { skipped.push("an insertion with no usable text"); continue; }
      if (op.blockId === null) { copy.body.splice(0, 0, block); applied++; continue; }
      const pos = flowPosition(copy.body, op.blockId, false);
      if (!pos) { skipped.push("an insertion after a block that does not exist"); continue; }
      if (pos.locked) { skipped.push("a locked section"); continue; }
      pos.arr.splice(pos.index + 1, 0, block);
      applied++;
    }
  }
  if (applied === 0) return { doc: null, applied, skipped };
  const parsed = parseDoc(copy, { assignIds: true });
  return parsed.ok ? { doc: parsed.doc, applied, skipped } : { doc: null, applied: 0, skipped: [...skipped, `the result was not a valid document (${parsed.issues[0]?.message ?? "invalid"})`] };
}

/** The words the model wrote (replacements and insertions), for the fact guard. */
export const writtenTexts = (ops: readonly EditOp[]): string[] => ops.filter((o) => o.op !== "delete" && o.text.trim()).map((o) => o.text.replace(/\{\{[^}]*\}\}|\[\[[^\]]*\]\]/g, " "));

export interface EditRequest {
  doc: PBDoc;
  /** Frozen or live values of the document's variables, as facts the guard accepts. */
  values: Record<string, string | number | boolean>;
  message: string;
  history: { role: "user" | "assistant"; text: string }[];
  docTitle: string;
  kindName: string;
  company: string;
  user: { id: string; name: string | null };
  /** Names the run in `pb_ai_runs` (for example `clone:<id>` or `doc:<id>`). */
  runDocumentId: string;
  baseSha: string | null;
  attachments?: PreparedAttachment[];
  /** Only these blocks may change (selection or section scope). Null or absent: the whole document. */
  scopeBlockIds?: string[] | null;
  /** "suggest": return the operations for the person to accept or reject one by one instead of applying them. */
  mode?: "apply" | "suggest";
}

export type EditOutcome =
  | { kind: "limited"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "reply"; reply: string }
  | { kind: "change"; reply: string; summary: string; steps: string[]; doc: PBDoc; changes: ChatChange[]; attachmentsUsed: boolean }
  | { kind: "suggestion"; reply: string; summary: string; steps: string[]; ops: EditOp[]; items: SuggestionItem[] };

/** One suggested operation with what it would change, for the accept / reject cards. */
export interface SuggestionItem { index: number; op: EditOp["op"]; blockId: string | null; before: string | null; after: string | null; skipped: string | null }

export async function proposeEdit(r: EditRequest): Promise<EditOutcome> {
  const settings = await getPbSettings();
  const limited = await checkAiLimits({ id: r.user.id }, settings.ai);
  if (limited) return { kind: "limited", message: limited.message };
  const runId = await startRun({ documentId: r.runDocumentId, sectionKey: "edit_chat", action: "generate", typeId: "edit.chat", templateRef: null, userId: r.user.id, userName: r.user.name, baseSha: r.baseSha });
  const t0 = Date.now();
  const refuse = async (message: string, note?: string): Promise<EditOutcome> => {
    await finishRun(runId, { status: "failed", error: (note ?? message).slice(0, 500), durationMs: Date.now() - t0 });
    return { kind: "refused", message };
  };
  try {
    const instructions = await getPrompt("playbook.edit.chat", { company_name: r.company, doc_title: r.docTitle, doc_kind: r.kindName });
    const atts = r.attachments ?? [];
    const attachmentTexts = atts.filter((a) => a.text).map((a) => a.text as string);
    const textInput = [
      textBlock("document", documentForModel(r.doc), 30_000),
      ...atts.filter((a) => a.text).map((a) => textBlock(`attachment ${a.name}`, a.text as string, 20_000)),
      atts.some((a) => a.dataUrl) ? `The person also attached: ${atts.filter((a) => a.dataUrl).map((a) => a.name).join(", ")} (images or PDFs, shown to you). Read them. If any is unreadable, say so in reply and do not guess.` : "",
      r.history.length ? textBlock("conversation", r.history.map((h) => `${h.role === "user" ? "Person" : "Assistant"}: ${h.text}`).join("\n"), 4000) : "",
      r.scopeBlockIds && r.scopeBlockIds.length ? `SCOPE: change only these blocks (ids): ${r.scopeBlockIds.join(", ")}. Insert only directly after one of them. If the request needs anything else, say so in reply.` : "",
      dataBlock("message", r.message, MAX_MESSAGE),
      "Answer with the JSON now.",
    ].filter(Boolean).join("\n\n");
    const media = atts.filter((a) => a.dataUrl);
    const input: unknown = media.length
      ? [{ role: "user", content: [{ type: "input_text", text: textInput }, ...media.map((a) => (a.kind === "pdf" ? { type: "input_file", filename: a.name, file_data: a.dataUrl } : { type: "input_image", image_url: a.dataUrl }))] }]
      : textInput;

    const client = await getOpenAI({ timeoutMs: 55_000, maxRetries: 1 });
    const chosen = await resolveForCall("text", settings.ai.model || DEFAULT_TEXT_MODEL);
    const res = await withAiFeature(FEATURE, () => (client as unknown as { responses: { create(p: Record<string, unknown>): Promise<{ output_text?: string; status?: string; usage?: { input_tokens?: number; output_tokens?: number } | null }> } }).responses.create({
      model: chosen.model, instructions, input, max_output_tokens: Math.min(settings.ai.maxOutputTokens, 6000),
      text: { format: { type: "json_schema", name: "playbook_edit", schema: EDIT_SCHEMA, strict: true } }, store: false,
    }));
    const answer = res.status === "incomplete" ? null : parseAnswer(res.output_text);
    const tokens = { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 };
    if (!answer) { await finishRun(runId, { ...tokens, model: chosen.model }); return await refuse("I could not turn that into a safe change. Try asking again with a shorter, more specific instruction."); }
    if (answer.operations.length === 0) {
      await finishRun(runId, { status: "proposed", model: chosen.model, promptKey: "playbook.edit.chat", ...tokens, durationMs: Date.now() - t0 });
      return { kind: "reply", reply: answer.reply || "I did not change anything." };
    }
    const facts: FactInput[] = Object.entries(r.values).map(([key, value]) => ({ key, label: key, value, source: { type: "document", ref: null, label: "Document values" } }));
    const allow = buildAllowSet(makeFactBag(facts), [documentText(r.doc), r.message, ...attachmentTexts, answer.attachmentText, ...r.history.filter((h) => h.role === "user").map((h) => h.text)]);
    const flagged = writtenTexts(answer.operations).flatMap((t) => checkText(t, allow));
    if (flagged.length) {
      await finishRun(runId, { status: "failed", error: `fact guard: ${flagged[0].text}`, model: chosen.model, ...tokens, durationMs: Date.now() - t0 });
      return { kind: "refused", message: `I did not change the document, because my answer contained a value that is not in the document or in your message ("${flagged[0].text}"). If you want it in, type the value in your instruction.` };
    }
    const scope = r.scopeBlockIds && r.scopeBlockIds.length ? new Set(r.scopeBlockIds) : null;
    const inScope = (o: EditOp) => !scope || (o.blockId !== null && scope.has(o.blockId));
    const ops = answer.operations.filter(inScope);
    const outOfScope = answer.operations.length - ops.length;
    if (ops.length === 0) { await finishRun(runId, { status: "failed", error: "all operations outside the scope", model: chosen.model, ...tokens }); return { kind: "refused", message: "That change is outside the part of the document you selected. Widen the scope to the section or the whole document." }; }
    if (r.mode === "suggest") {
      const listed = new Map(listBlocks(r.doc).map((b) => [b.id, b]));
      const items: SuggestionItem[] = ops.map((o, index) => {
        const b = o.blockId ? listed.get(o.blockId) : undefined;
        const locked = b?.locked === true;
        return { index, op: o.op, blockId: o.blockId, before: o.op === "insert" ? null : b?.text.slice(0, 600) ?? null, after: o.op === "delete" ? null : o.text.slice(0, 600), skipped: locked ? "This part is locked and cannot be changed by AI." : o.op !== "insert" && !b ? "That block no longer exists." : null };
      });
      await finishRun(runId, { status: "proposed", model: chosen.model, promptKey: "playbook.edit.chat", ...tokens, durationMs: Date.now() - t0 });
      return { kind: "suggestion", reply: answer.reply || "Here are my suggested changes.", summary: answer.summary, steps: answer.steps, ops, items };
    }
    const applied = applyOps(r.doc, ops);
    if (!applied.doc) { await finishRun(runId, { status: "failed", error: applied.skipped[0] ?? "no operation applied", model: chosen.model, ...tokens }); return { kind: "refused", message: `I could not make that change (${applied.skipped[0] ?? "nothing applied"}). Try describing it differently.` }; }
    const diff = diffDocs(r.doc, applied.doc);
    const changes: ChatChange[] = diff.entries.filter((e) => e.kind !== "unchanged").slice(0, 40).map((e) => ({ kind: e.kind, before: e.before?.slice(0, 600) ?? null, after: e.after?.slice(0, 600) ?? null, blockId: e.id }));
    await finishRun(runId, { status: "proposed", model: chosen.model, promptKey: "playbook.edit.chat", ...tokens, durationMs: Date.now() - t0 });
    const reply = `${answer.reply || "Done."}${outOfScope ? ` (${outOfScope} change${outOfScope === 1 ? " was" : "s were"} outside your selection and left out.)` : ""}${applied.skipped.length ? ` (I skipped ${applied.skipped.length} change${applied.skipped.length === 1 ? "" : "s"}: ${applied.skipped.slice(0, 2).join("; ")}.)` : ""}`;
    return { kind: "change", reply, summary: answer.summary, steps: answer.steps, doc: applied.doc, changes, attachmentsUsed: atts.length > 0 };
  } catch (e) {
    return await refuse("The AI request failed. Try again in a moment.", e instanceof Error ? e.message : "error");
  }
}
