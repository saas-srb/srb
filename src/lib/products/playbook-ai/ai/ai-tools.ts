import "server-only";
import { randomUUID } from "node:crypto";
import { getOpenAI } from "@/lib/openai";
import { withAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { getPrompt } from "@/lib/prompts/store";
import { DEFAULT_TEXT_MODEL, resolveForCall } from "@/lib/products/viralpulse-ai/models";
import { buildAllowSet, checkText } from "@/lib/products/playbook-ai/ai/guard";
import { dataBlock, makeFactBag, textBlock, type FactInput } from "@/lib/products/playbook-ai/ai/facts";
import { checkAiLimits, finishRun, startRun } from "@/lib/products/playbook-ai/ai/runs";
import { documentForModel, documentText, listBlocks, MAX_MESSAGE } from "@/lib/products/playbook-ai/ai/edit-core";
import type { PreparedAttachment } from "@/lib/products/playbook-ai/ai/attachments";
import { TEXT_ACTION_LABEL, type ReviewIssue, type TextAction } from "@/lib/products/playbook-ai/ai/edit-types";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { getPbSettings } from "@/lib/products/playbook-ai/pb-settings";

/**
 * The smaller AI tools of the editor: rewrite or write text (selection toolbar and "Help me write"), ask about the document, and review it.
 * All three use registry prompts with pinned rules, the per-user and per-company limits, the run log and metering, and none of them changes the
 * document: the caller shows the result for the person to accept. Texts the model writes go through the fact guard.
 */
export interface ToolCtx {
  doc: PBDoc;
  values: Record<string, string | number | boolean>;
  docTitle: string;
  kindName: string;
  company: string;
  legal: boolean;
  user: { id: string; name: string | null };
  runDocumentId: string;
  baseSha: string | null;
}
type Fail = { ok: false; message: string };
type Client = { responses: { create(p: Record<string, unknown>): Promise<{ output_text?: string; status?: string }> } };

async function callJson(c: ToolCtx, typeId: string, promptKey: string, vars: Record<string, string>, input: unknown, schemaName: string, schema: Record<string, unknown>): Promise<{ ok: true; json: Record<string, unknown> } | Fail> {
  const settings = await getPbSettings();
  const limited = await checkAiLimits({ id: c.user.id }, settings.ai);
  if (limited) return { ok: false, message: limited.message };
  const runId = await startRun({ documentId: c.runDocumentId, sectionKey: typeId, action: "generate", typeId, templateRef: null, userId: c.user.id, userName: c.user.name, baseSha: c.baseSha });
  const t0 = Date.now();
  try {
    const instructions = await getPrompt(promptKey, vars);
    const client = (await getOpenAI({ timeoutMs: 55_000, maxRetries: 1 })) as unknown as Client;
    const chosen = await resolveForCall("text", settings.ai.model || DEFAULT_TEXT_MODEL);
    const res = await withAiFeature("Playbook AI", () => client.responses.create({ model: chosen.model, instructions, input, max_output_tokens: Math.min(settings.ai.maxOutputTokens, 6000), text: { format: { type: "json_schema", name: schemaName, schema, strict: true } }, store: false }));
    let json: unknown = null;
    try { json = res.status === "incomplete" || !res.output_text ? null : JSON.parse(res.output_text); } catch { json = null; }
    if (typeof json !== "object" || json === null || Array.isArray(json)) { await finishRun(runId, { status: "failed", error: "unreadable answer", model: chosen.model, durationMs: Date.now() - t0 }); return { ok: false, message: "The AI answer could not be read. Try again." }; }
    await finishRun(runId, { status: "proposed", model: chosen.model, promptKey, durationMs: Date.now() - t0 });
    return { ok: true, json: json as Record<string, unknown> };
  } catch (e) {
    await finishRun(runId, { status: "failed", error: (e instanceof Error ? e.message : "error").slice(0, 300), durationMs: Date.now() - t0 });
    return { ok: false, message: "The AI request failed. Try again in a moment." };
  }
}

const factInputs = (c: ToolCtx): FactInput[] => Object.entries(c.values).map(([key, value]) => ({ key, label: key, value, source: { type: "document", ref: null, label: "Document values" } }));
const clean = (s: unknown, n: number): string => (typeof s === "string" ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").slice(0, n) : "");

const ACTION_HELP: Record<TextAction, string> = {
  rewrite: "Rewrite the selected text so it reads better. Keep the meaning and every obligation.",
  shorten: "Make the selected text shorter without losing any obligation or fact.",
  expand: "Expand the selected text with more explanation, using only what the document already says.",
  simplify: "Rewrite the selected text in plain, simple language. Keep the meaning.",
  formal: "Rewrite the selected text in a more formal tone. Keep the meaning.",
  friendly: "Rewrite the selected text in a warmer, friendlier tone. Keep the meaning.",
  fix: "Fix grammar, spelling and punctuation only. Do not change the wording otherwise.",
  bullets: "Turn the selected text into a bullet list, one item per point, each starting with \"- \".",
  summarise: "Summarise the selected text in one to three sentences.",
  custom: "Follow the INSTRUCTION to change the selected text.",
  write: "Write new text at the cursor as the INSTRUCTION asks, using only what the document, attachments and instruction contain.",
};

export async function transformText(c: ToolCtx & { action: TextAction; instruction?: string; selected: string }): Promise<{ ok: true; text: string } | Fail> {
  if (!(c.action in ACTION_HELP)) return { ok: false, message: "Unknown action." };
  const selected = clean(c.selected, 8000).trim();
  const instruction = clean(c.instruction, 800).trim();
  if (c.action !== "write" && selected.length < 2) return { ok: false, message: "Select some text first." };
  if ((c.action === "custom" || c.action === "write") && instruction.length < 3) return { ok: false, message: "Tell the assistant what to do." };
  const input = [textBlock("document", documentForModel(c.doc), 24_000), selected ? textBlock("selected text", selected, 8000) : "", instruction ? dataBlock("instruction", instruction, 800) : "", "Write the result now."].filter(Boolean).join("\n\n");
  const r = await callJson(c, "edit.text", "playbook.edit.selection", { company_name: c.company, doc_title: c.docTitle, action: TEXT_ACTION_LABEL[c.action], action_help: ACTION_HELP[c.action] }, input, "playbook_text", { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } });
  if (!r.ok) return r;
  const text = clean(r.json.text, 12_000).trim();
  if (!text) return { ok: false, message: "The AI did not return any text. Try again." };
  const allow = buildAllowSet(makeFactBag(factInputs(c)), [documentText(c.doc), selected, instruction]);
  const flagged = checkText(text.replace(/\{\{[^}]*\}\}|\[\[[^\]]*\]\]/g, " "), allow);
  if (flagged.length) return { ok: false, message: `The AI wrote a value that is not in the document or in your instruction ("${flagged[0].text}"), so it was not used. Put the value in your instruction and try again.` };
  return { ok: true, text };
}

export async function askDocument(c: ToolCtx & { question: string; history: { role: "user" | "assistant"; text: string }[]; attachments?: PreparedAttachment[] }): Promise<{ ok: true; answer: string; references: { blockId: string; quote: string }[] } | Fail> {
  const question = clean(c.question, MAX_MESSAGE).trim();
  if (question.length < 3) return { ok: false, message: "Type a question." };
  const atts = c.attachments ?? [];
  const media = atts.filter((a) => a.dataUrl);
  const textInput = [textBlock("document", documentForModel(c.doc), 30_000), ...atts.filter((a) => a.text).map((a) => textBlock(`attachment ${a.name}`, a.text as string, 20_000)), media.length ? `Attached images or PDFs: ${media.map((a) => a.name).join(", ")}. If one is unreadable, say so.` : "", c.history.length ? textBlock("conversation", c.history.map((h) => `${h.role === "user" ? "Person" : "Assistant"}: ${h.text}`).join("\n"), 3000) : "", dataBlock("question", question, MAX_MESSAGE), "Answer with the JSON now."].filter(Boolean).join("\n\n");
  const input: unknown = media.length ? [{ role: "user", content: [{ type: "input_text", text: textInput }, ...media.map((a) => (a.kind === "pdf" ? { type: "input_file", filename: a.name, file_data: a.dataUrl } : { type: "input_image", image_url: a.dataUrl }))] }] : textInput;
  const r = await callJson(c, "ask.chat", "playbook.ask.chat", { company_name: c.company, doc_title: c.docTitle }, input, "playbook_ask", {
    type: "object", additionalProperties: false, required: ["answer", "references"],
    properties: { answer: { type: "string" }, references: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["blockId", "quote"], properties: { blockId: { type: "string" }, quote: { type: "string" } } } } },
  });
  if (!r.ok) return r;
  const ids = new Map(listBlocks(c.doc).map((b) => [b.id, b.text]));
  const refs = (Array.isArray(r.json.references) ? r.json.references : []).flatMap((x) => {
    const o = x as { blockId?: unknown; quote?: unknown };
    return typeof o.blockId === "string" && ids.has(o.blockId) ? [{ blockId: o.blockId, quote: clean(o.quote, 200) }] : [];
  });
  return { ok: true, answer: clean(r.json.answer, 4000).trim() || "I could not find that in the document.", references: refs };
}

const CATEGORIES: ReviewIssue["category"][] = ["grammar", "clarity", "terminology", "missing_section", "placeholder", "legal_risk"];

/** Placeholders and unresolved variables are found by reading the document, not by asking the model. */
export function placeholderIssues(doc: PBDoc, values: Record<string, unknown>): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  const walk = (n: unknown, blockId: string | null) => {
    if (Array.isArray(n)) { n.forEach((x) => walk(x, blockId)); return; }
    if (typeof n !== "object" || n === null) return;
    const o = n as Record<string, unknown>;
    const here = typeof o.id === "string" && typeof o.type === "string" && ["paragraph", "heading", "clause"].includes(o.type) ? (o.id as string) : blockId;
    if (o.type === "placeholder") out.push({ id: randomUUID(), blockId: here, category: "placeholder", message: `Unfilled placeholder: ${String(o.label ?? o.key)}. Fill it before the document is sent.`, replacement: "" });
    else if (o.type === "var" && typeof o.key === "string" && !o.fallback && (values[o.key] === undefined || values[o.key] === null || String(values[o.key]).trim() === "")) out.push({ id: randomUUID(), blockId: here, category: "placeholder", message: `The value for ${o.key} is empty, so it will be blank in the document.`, replacement: "" });
    for (const v of Object.values(o)) if (typeof v === "object") walk(v, here);
  };
  walk(doc.body, null);
  return out.slice(0, 40);
}

export async function reviewDocument(c: ToolCtx): Promise<{ ok: true; issues: ReviewIssue[] } | Fail> {
  const local = placeholderIssues(c.doc, c.values);
  const r = await callJson(c, "review.doc", "playbook.review.doc", { company_name: c.company, doc_title: c.docTitle, doc_kind: c.kindName, legal_line: c.legal ? "This is a legal document type: also flag risky or one-sided wording, but do not give legal advice." : "" }, [textBlock("document", documentForModel(c.doc), 40_000), "Answer with the JSON now."].join("\n\n"), "playbook_review", {
    type: "object", additionalProperties: false, required: ["issues"],
    properties: { issues: { type: "array", maxItems: 25, items: { type: "object", additionalProperties: false, required: ["blockId", "category", "message", "replacement"], properties: { blockId: { type: ["string", "null"] }, category: { type: "string", enum: CATEGORIES.filter((x) => x !== "placeholder") }, message: { type: "string" }, replacement: { type: "string" } } } } },
  });
  if (!r.ok) return local.length ? { ok: true, issues: local } : r;
  const blocks = new Map(listBlocks(c.doc).map((b) => [b.id, b]));
  const allow = buildAllowSet(makeFactBag(factInputs(c)), [documentText(c.doc)]);
  const model: ReviewIssue[] = [];
  for (const x of Array.isArray(r.json.issues) ? r.json.issues : []) {
    const o = x as { blockId?: unknown; category?: unknown; message?: unknown; replacement?: unknown };
    const id = typeof o.blockId === "string" ? o.blockId : null;
    const b = id ? blocks.get(id) : null;
    if (id && (!b || b.locked)) continue;
    let replacement = clean(o.replacement, 4000).trim();
    if (replacement && (!b || !["paragraph", "heading", "clause"].some((t) => b.type.startsWith(t)) || checkText(replacement.replace(/\{\{[^}]*\}\}|\[\[[^\]]*\]\]/g, " "), allow).length)) replacement = "";
    const category = CATEGORIES.includes(o.category as ReviewIssue["category"]) ? (o.category as ReviewIssue["category"]) : "clarity";
    const message = clean(o.message, 400).trim();
    if (message) model.push({ id: randomUUID(), blockId: id, category, message, replacement });
  }
  return { ok: true, issues: [...local, ...model] };
}
