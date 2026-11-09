"use server";

import { revalidatePath } from "next/cache";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import { compareVersions, createDocument, deleteDocument, getDocument, getDocumentActivity, listDocumentVersions, revertToVersion } from "@/lib/products/playbook-ai/documents";
import { exportDocument } from "@/lib/products/playbook-ai/exports-store";
import { listHandoffs, senderViewer, sendItemToContractFlow, type SendItemInput } from "@/lib/products/playbook-ai/handoff";
import { searchParties, PartyError } from "@/lib/products/contractflow-ai/parties";
import { isPartyType, type PickerHit } from "@/lib/products/contractflow-ai/party-types";
import { assembleItemDoc, generateItemSection, auditWizardAi } from "@/lib/products/playbook-ai/ai/item-generate";
import type { RawBlock } from "@/lib/products/playbook-ai/ai/schema";
import { acceptPbSuggestions, applyPbIssue, askPb, loadPbChat, rejectPbSuggestions, reviewPb, sendPbChat, transformPb, undoPbChat } from "@/lib/products/playbook-ai/pb-edit";
import type { ChatTurn, ReviewIssue, TextAction } from "@/lib/products/playbook-ai/ai/edit-types";
import { previewLibraryPdf, sendInfoFor, setItemMeta, useLibraryItem } from "@/lib/products/playbook-ai/items";
import { previewLibraryFile } from "@/lib/products/playbook-ai/library-preview";
import { getTemplateDef } from "@/lib/products/playbook-ai/catalogue/registry";
import { CATEGORY_LABELS } from "@/lib/products/playbook-ai/catalogue/types";
import { buildLibraryDoc } from "@/lib/products/playbook-ai/item-library";
import { isItemKind, ITEM_KIND_INFO, type ItemKind, type ItemMeta, type ItemSendInfo } from "@/lib/products/playbook-ai/items-types";
import type { GeneratedSection, ItemDetails } from "@/lib/products/playbook-ai/item-sections";
import { cleanItemMeta } from "@/lib/products/playbook-ai/items-types";

/**
 * Server actions behind the SOPs / Documents / KPIs screens. The signed-in person comes from the session, never from an argument; the data
 * layer re-checks every permission. Expected failures come back as values, never as thrown errors.
 */

type Fail = { ok: false; message: string };
const SIGNED_OUT: Fail = { ok: false, message: "Please sign in again." };
const actor = async (): Promise<PbActor | null> => getPbActor();
const bust = (kind: ItemKind) => revalidatePath(`/playbook-ai/${ITEM_KIND_INFO[kind].segment}`);

export async function useLibraryItemAction(libraryId: string): Promise<{ ok: true; documentId: string; kind: ItemKind } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const r = await useLibraryItem(a, String(libraryId));
  if (!r.ok) return { ok: false, message: r.error.message };
  const g = await getDocument(a, r.documentId);
  const kind: ItemKind = g.ok && g.document.kind && isItemKind(g.document.kind) ? g.document.kind : "sop";
  bust(kind);
  return { ok: true, documentId: r.documentId, kind };
}

export async function deleteItemAction(id: string): Promise<{ ok: true } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const g = await getDocument(a, String(id));
  const r = await deleteDocument(a, String(id));
  if (!r.ok) return { ok: false, message: r.error.message };
  if (g.ok) bust((g.document.kind as ItemKind | undefined) ?? "document");
  return { ok: true };
}

/** The real PDF of the item as it is saved now, for the preview dialog. */
export async function previewItemAction(id: string): Promise<{ ok: true; pdfBase64: string; pages: number | null } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const r = await exportDocument(a, { id: String(id), format: "pdf", version: "draft" });
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, pdfBase64: Buffer.from(r.file.bytes).toString("base64"), pages: r.file.pages };
}

export interface ItemDetailsData {
  id: string;
  title: string;
  kind: ItemKind;
  status: string;
  meta: ItemMeta;
  createdAt: string;
  updatedAt: string;
  versions: { number: number; label: string | null; by: string; at: string; note: string | null }[];
  activity: { at: string; by: string; summary: string }[];
  sends: { cloneId: string; partyName: string; sentAt: string; versionNumber: number }[];
  send: ItemSendInfo | null;
}

export async function itemDetailsAction(id: string): Promise<{ ok: true; data: ItemDetailsData } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const g = await getDocument(a, String(id));
  if (!g.ok) return { ok: false, message: g.error.message };
  const d = g.document;
  const [vers, act, handoffs, send] = await Promise.all([listDocumentVersions(a, d._id), getDocumentActivity(a, d._id, 1), listHandoffs(a, d._id), sendInfoFor([d._id])]);
  return {
    ok: true,
    data: {
      id: d._id, title: d.title, kind: (d.kind as ItemKind | undefined) ?? "document", status: d.status, meta: d.meta ?? {}, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
      versions: vers.ok ? vers.versions.map((v) => ({ number: v.number, label: v.label, by: v.authorName ?? "", at: v.createdAt.toISOString(), note: v.changeNote })) : [],
      activity: act.ok ? act.items.slice(0, 30).map((e) => ({ at: e.createdAt.toISOString(), by: e.actorEmail ?? "", summary: e.summary ?? e.action })) : [],
      sends: handoffs.map((h) => ({ cloneId: h.cloneId, partyName: h.partyName, sentAt: h.sentAt.toISOString(), versionNumber: h.versionNumber })),
      send: send.get(d._id) ?? null,
    },
  };
}

export async function searchPartyForItemAction(type: string, q: string): Promise<{ ok: true; hits: PickerHit[] } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  if (!isPartyType(type)) return { ok: false, message: "Unknown kind of party." };
  try {
    return { ok: true, hits: await searchParties(senderViewer(a), { type, q: String(q ?? "").slice(0, 80), limit: 10 }) };
  } catch (e) {
    return { ok: false, message: e instanceof PartyError ? e.message : "The search failed." };
  }
}

export async function sendItemAction(input: SendItemInput): Promise<{ ok: true; cloneId: string } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const r = await sendItemToContractFlow(a, input);
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/playbook-ai/sops"); revalidatePath("/playbook-ai/documents"); revalidatePath("/playbook-ai/kpis");
  return { ok: true, cloneId: r.cloneId };
}

export async function updateItemDetailsAction(id: string, patch: { title?: string; department?: string; designation?: string; description?: string; reviewPeriod?: string }): Promise<{ ok: true } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const r = await setItemMeta(a, String(id), patch);
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}

// ── Create wizard ──────────────────────────────────────────────────────────────────────────────────────────────

export async function generateSectionAction(input: { kind: ItemKind; sectionKey: string; details: ItemDetails; instruction?: string }): Promise<{ ok: true; section: GeneratedSection } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  if (!isItemKind(input.kind)) return { ok: false, message: "Unknown kind." };
  const r = await generateItemSection(a, { kind: input.kind, sectionKey: String(input.sectionKey), details: input.details, instruction: input.instruction ? String(input.instruction).slice(0, 600) : undefined });
  return r.ok ? { ok: true, section: r.section } : { ok: false, message: r.error.message };
}

/** Saves the wizard's result as a new draft. `sections` are the (possibly edited) generated sections; or a ready document from the editor step. */
export async function saveWizardItemAction(input: { kind: ItemKind; details: ItemDetails; sections?: { title: string; blocks: RawBlock[] }[]; ai: boolean }): Promise<{ ok: true; documentId: string } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  if (!isItemKind(input.kind)) return { ok: false, message: "Unknown kind." };
  const d = input.details;
  const pbdoc = input.sections && input.sections.length > 0 ? assembleItemDoc(input.sections.slice(0, 40).map((s) => ({ title: String(s.title).slice(0, 200), blocks: Array.isArray(s.blocks) ? s.blocks.slice(0, 400) : [] }))) : undefined;
  if (input.sections && input.sections.length > 0 && !pbdoc) return { ok: false, message: "The generated content could not be turned into a document. Regenerate the sections that failed." };
  const r = await createDocument(a, { title: String(d.title ?? ""), kind: input.kind, meta: cleanItemMeta({ department: d.department, designation: d.designation, description: d.description, reviewPeriod: d.reviewPeriod }), pbdoc });
  if (!r.ok) return { ok: false, message: r.error.message };
  if (input.ai) await auditWizardAi(a, r.document._id, input.kind);
  bust(input.kind);
  return { ok: true, documentId: r.document._id };
}

export async function previewLibraryAction(libraryId: string): Promise<{ ok: true; pdfBase64: string } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const r = await previewLibraryPdf(a, String(libraryId));
  return r.ok ? { ok: true, pdfBase64: r.pdfBase64 } : { ok: false, message: r.error.message };
}

// ── Edit with AI ───────────────────────────────────────────────────────────────────────────────────────────────
export async function pbChatLoadAction(id: string): Promise<{ ok: true; turns: ChatTurn[]; canEdit: boolean; reason: string | null } | Fail> {
  const a = await actor();
  return a ? loadPbChat(a, String(id)) : SIGNED_OUT;
}
export async function pbChatSendAction(id: string, form: FormData): Promise<{ ok: true; user: ChatTurn; reply: ChatTurn } | Fail> {
  const a = await actor();
  return a ? sendPbChat(a, String(id), String(form.get("message") ?? ""), form.getAll("files").filter((f): f is File => f instanceof File), parseOpts(form)) : SIGNED_OUT;
}
export async function pbChatUndoAction(id: string, turnId: string): Promise<{ ok: true } | Fail> {
  const a = await actor();
  return a ? undoPbChat(a, String(id), String(turnId)) : SIGNED_OUT;
}

function parseOpts(form: FormData): { scopeBlockIds?: string[]; mode?: "apply" | "suggest" } {
  let scope: string[] | undefined;
  try { const v: unknown = JSON.parse(String(form.get("scope") ?? "null")); if (Array.isArray(v)) scope = v.filter((x): x is string => typeof x === "string").slice(0, 200); } catch { scope = undefined; }
  return { scopeBlockIds: scope, mode: form.get("mode") === "suggest" ? "suggest" : "apply" };
}
export async function pbChatAskAction(id: string, form: FormData): Promise<{ ok: true; answer: string; references: { blockId: string; quote: string }[] } | Fail> {
  const a = await actor();
  return a ? askPb(a, String(id), String(form.get("message") ?? ""), form.getAll("files").filter((f): f is File => f instanceof File)) : SIGNED_OUT;
}
export async function pbReviewAction(id: string): Promise<{ ok: true; issues: ReviewIssue[] } | Fail> {
  const a = await actor();
  return a ? reviewPb(a, String(id)) : SIGNED_OUT;
}
export async function pbApplyIssueAction(id: string, issue: { blockId: string | null; replacement: string }): Promise<{ ok: true } | Fail> {
  const a = await actor();
  return a ? applyPbIssue(a, String(id), { blockId: issue.blockId ? String(issue.blockId) : null, replacement: String(issue.replacement ?? "") }) : SIGNED_OUT;
}
export async function pbAcceptAction(id: string, turnId: string, indexes: number[]): Promise<{ ok: true; reply: ChatTurn } | Fail> {
  const a = await actor();
  return a ? acceptPbSuggestions(a, String(id), String(turnId), Array.isArray(indexes) ? indexes.map(Number) : []) : SIGNED_OUT;
}
export async function pbRejectAction(id: string, turnId: string): Promise<{ ok: true } | Fail> {
  const a = await actor();
  return a ? rejectPbSuggestions(a, String(id), String(turnId)) : SIGNED_OUT;
}
export async function pbTransformAction(id: string, input: { action: TextAction; instruction?: string; selected: string }): Promise<{ ok: true; text: string } | Fail> {
  const a = await actor();
  return a ? transformPb(a, String(id), { action: input.action, instruction: input.instruction ? String(input.instruction) : undefined, selected: String(input.selected ?? "") }) : SIGNED_OUT;
}

// ── Versions tab ───────────────────────────────────────────────────────────────────────────────────────────────
export async function pbVersionsAction(id: string): Promise<{ ok: true; versions: { number: number; summary: string; source: string; by: string; at: string; statuses: { status: string; at: string; note: string | null }[] }[] } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const r = await listDocumentVersions(a, String(id));
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, versions: [...r.versions].sort((x, y) => y.number - x.number).map((v) => ({ number: v.number, summary: v.label || v.changeNote || (v.kind === "auto" ? "Automatic checkpoint" : "Saved version"), source: v.kind === "auto" ? "edit" : v.label?.startsWith("AI") ? "ai" : v.kind === "revert" ? "restore" : "edit", by: v.authorName ?? "", at: v.createdAt.toISOString(), statuses: [] })) };
}
export async function pbCompareAction(id: string, from: number, to: number): Promise<{ ok: true; summary: string; identical: boolean; rows: { id: string; zone: "header" | "body" | "footer"; blockType: string; kind: string; before: string | null; after: string | null; words: { text: string; op: "equal" | "add" | "remove" }[] | null }[] } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const r = await compareVersions(a, { id: String(id), from: Number(from), to: Number(to) });
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, summary: r.summary, identical: r.diff.identical, rows: r.diff.entries.filter((e) => e.kind !== "unchanged").slice(0, 300).map((e) => ({ id: e.id, zone: e.zone, blockType: e.blockType, kind: e.kind, before: e.before, after: e.after, words: e.words })) };
}
export async function pbRestoreAction(id: string, n: number): Promise<{ ok: true } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const g = await getDocument(a, String(id));
  if (!g.ok) return { ok: false, message: g.error.message };
  const r = await revertToVersion(a, { id: g.document._id, number: Number(n), rev: g.document.rev });
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}

/** File > Make a copy. */
export async function copyItemAction(id: string): Promise<{ ok: true; documentId: string } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const g = await getDocument(a, String(id));
  if (!g.ok) return { ok: false, message: g.error.message };
  const d = g.document;
  const r = await createDocument(a, { title: `Copy of ${d.title}`.slice(0, 200), kind: (d.kind as ItemKind | undefined) ?? "document", meta: d.meta, pbdoc: d.pbdoc, docTypeId: d.docTypeId, inputs: d.inputs, lists: d.lists });
  if (!r.ok) return { ok: false, message: r.error.message };
  bust(((d.kind as ItemKind | undefined) ?? "document"));
  return { ok: true, documentId: r.document._id };
}

/** Blank-template download from the library (PDF or Word), with the company letterhead and fill-in blanks. */
export async function downloadLibraryAction(libraryId: string, format: "pdf" | "docx"): Promise<{ ok: true; base64: string; filename: string; mime: string } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const id = String(libraryId);
  const r = await previewLibraryFile(a, id.startsWith("sop.") ? "sop" : id.startsWith("kpi.") ? "kpi" : "document", id, format === "docx" ? "docx" : "pdf");
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, base64: r.bytes.toString("base64"), filename: r.filename, mime: format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf" };
}

export interface LibraryDetails {
  title: string;
  purpose: string;
  kindLabel: string;
  party: string | null;
  signature: string | null;
  legal: { review: boolean; statute: boolean };
  stamp: { rule: "none" | "maybe" | "likely"; category: string | null };
  inputs: { label: string; required: boolean }[];
  sections: { title: string; ai: boolean }[];
  pages: number;
}

/** Details for a library card: documents from the catalogue template, SOPs and KPI sheets from their built content. */
export async function libraryDetailsAction(libraryId: string): Promise<{ ok: true; data: LibraryDetails } | Fail> {
  const a = await actor();
  if (!a) return SIGNED_OUT;
  const id = String(libraryId);
  const words = (x: unknown): number => JSON.stringify(x).replace(/"[a-zA-Z]+":/g, " ").replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1).length;
  if (id.startsWith("sop.") || id.startsWith("kpi.")) {
    const b = buildLibraryDoc(id);
    if (!b) return { ok: false, message: "That library entry does not exist." };
    const heads = b.doc.body.filter((x) => x.type === "heading").map((x) => ({ title: plainOf(x), ai: false }));
    return { ok: true, data: { title: b.info.title, purpose: b.info.summary, kindLabel: b.info.kind === "sop" ? "Standard Operating Procedure" : "Employee KPI sheet", party: null, signature: "Approval block added automatically", legal: { review: false, statute: false }, stamp: { rule: "none", category: null }, inputs: [], sections: heads, pages: Math.max(2, Math.ceil(words(b.doc.body) / 380)) } };
  }
  const def = getTemplateDef(id);
  if (!def) return { ok: false, message: "That template does not exist." };
  return { ok: true, data: {
    title: def.name, purpose: def.purpose, kindLabel: CATEGORY_LABELS[def.category], party: def.party === "none" ? null : def.party, signature: def.sign === "yes" ? "Signed (sent for e-signature)" : def.sign === "optional" ? "Signature optional" : "Not signed",
    legal: def.legal, stamp: { rule: def.stamp.rule, category: def.stamp.category ?? null },
    inputs: def.inputs.map((i) => ({ label: i.label, required: i.required })),
    sections: def.sections.filter((s) => !s.draftOnly).map((s) => ({ title: s.title, ai: s.aiMode !== "fixed" })),
    pages: Math.max(1, Math.ceil(words(def.sections.filter((s) => !s.draftOnly).map((s) => s.body)) / 380)),
  } };
}
const plainOf = (b: { content?: unknown }): string => (Array.isArray(b.content) ? (b.content as { text?: string }[]).map((n) => n.text ?? "").join("") : "");
