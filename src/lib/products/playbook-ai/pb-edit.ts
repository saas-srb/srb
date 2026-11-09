import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { playbookCan } from "@/lib/playbook-roles";
import { attachmentRecord, prepareAttachments } from "@/lib/products/playbook-ai/ai/attachments";
import { applyOps, MAX_MESSAGE, proposeEdit, type EditOp } from "@/lib/products/playbook-ai/ai/edit-core";
import { askDocument, reviewDocument, transformText, type ToolCtx } from "@/lib/products/playbook-ai/ai/ai-tools";
import type { ChatChange, ChatTurn, ReviewIssue, SuggestionCard, TextAction } from "@/lib/products/playbook-ai/ai/edit-types";
import { diffDocs } from "@/lib/products/playbook-ai/diff";
import { recordPbAudit } from "@/lib/products/playbook-ai/pb-audit";
import { getDocument, getDocumentVersion, revertToVersion, saveDraft, saveVersion } from "@/lib/products/playbook-ai/documents";
import type { PbActor, PbDocumentRecord } from "@/lib/products/playbook-ai/documents-types";
import { getCatalogueMeta } from "@/lib/products/playbook-ai/catalogue/registry";
import { ITEM_KIND_INFO } from "@/lib/products/playbook-ai/items-types";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import { loadVariableValues } from "@/lib/products/playbook-ai/variables-adapters";

/**
 * "Edit with AI" for Playbook items. The shared core (`ai/edit-core.ts`, `ai/ai-tools.ts`) asks the model and validates. Here every applied change
 * is stored through the A4 versions API: the state before is saved as a version, the change becomes the new draft, and the result is saved as a
 * named version, so the history shows what the AI did and Undo reverts to the version before it. Only a draft the person can edit and that is not
 * locked by someone else can be changed.
 */
interface ChatRow {
  _id: string; documentId: string; role: "user" | "assistant"; text: string; at: Date; by: string | null;
  versionNumber: number | null; previousVersionNumber: number | null; changes: ChatChange[] | null; undone: boolean;
  attachments?: { name: string; size: number; mime: string; storageKey: string }[];
  steps?: string[]; ops?: EditOp[]; suggestions?: SuggestionCard[];
}
const col = async () => (await getDb()).collection<ChatRow>(PB_COLLECTIONS.editChat);
const toTurn = (r: ChatRow): ChatTurn => ({
  id: r._id, role: r.role, text: r.text, at: r.at.toISOString(), versionNumber: r.versionNumber, previousVersionNumber: r.previousVersionNumber, changes: r.changes, undone: r.undone,
  ...(r.attachments?.length ? { attachments: r.attachments.map((a) => ({ name: a.name, size: a.size })) } : {}), ...(r.steps?.length ? { steps: r.steps } : {}), ...(r.suggestions?.length ? { suggestions: r.suggestions } : {}),
});
type Fail = { ok: false; message: string };

function blockedReason(actor: PbActor, d: PbDocumentRecord, canEdit: boolean): string | null {
  if (!playbookCan(actor, "USE_AI")) return "You are not allowed to use AI drafting.";
  if (!canEdit) return "You can read this document but not edit it.";
  if (d.status !== "draft") return `This document is ${d.status.replace("_", " ")} and cannot be edited. Revise it first.`;
  if (d.lock && d.lock.expiresAt > new Date() && d.lock.userId !== actor.id) return `${d.lock.name || "Someone"} is editing this document right now.`;
  return null;
}

async function open(actor: PbActor, documentId: string, need: "edit" | "read"): Promise<{ ok: true; d: PbDocumentRecord; canEdit: boolean } | Fail> {
  const g = await getDocument(actor, String(documentId));
  if (!g.ok) return { ok: false, message: g.error.message };
  if (need === "edit") {
    const b = blockedReason(actor, g.document, g.capabilities.edit);
    if (b) return { ok: false, message: b };
  } else if (!playbookCan(actor, "USE_AI")) return { ok: false, message: "You are not allowed to use AI drafting." };
  return { ok: true, d: g.document, canEdit: g.capabilities.edit };
}

async function toolCtx(actor: PbActor, d: PbDocumentRecord): Promise<ToolCtx> {
  const loaded = await loadVariableValues(actor, { doc: { title: d.title, docNumber: d.docNumber, version: d.versionSeq + 1, status: d.status, issuedAt: d.issuedAt, authorId: d.createdBy }, links: d.links, inputs: d.inputs });
  const company = await loadCompanyValues();
  const values: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries({ ...company, ...loaded.values })) if (v !== null && v !== undefined) values[k] = v as string | number | boolean;
  const meta = d.docTypeId ? getCatalogueMeta(d.docTypeId) : null;
  return {
    doc: d.pbdoc, values, docTitle: d.title, kindName: ITEM_KIND_INFO[(d.kind as keyof typeof ITEM_KIND_INFO | undefined) ?? "document"].docLabel,
    company: String(values["company.name"] ?? "the company"), legal: !!meta?.legal.review, user: { id: d.createdBy === actor.id ? actor.id : actor.id, name: actor.name || actor.email }, runDocumentId: `doc:${d._id}`, baseSha: d.contentSha256,
  };
}

export async function loadPbChat(actor: PbActor, documentId: string): Promise<{ ok: true; turns: ChatTurn[]; canEdit: boolean; reason: string | null } | Fail> {
  const g = await getDocument(actor, String(documentId));
  if (!g.ok) return { ok: false, message: g.error.message };
  const rows = await (await col()).find({ documentId: g.document._id }).sort({ at: 1 }).limit(100).toArray();
  const reason = blockedReason(actor, g.document, g.capabilities.edit);
  return { ok: true, turns: rows.map(toTurn), canEdit: reason === null, reason };
}

/** Saves the state before as a version, makes `doc` the draft, and saves it as a named version. */
async function commit(actor: PbActor, d: PbDocumentRecord, doc: PbDocumentRecord["pbdoc"], label: string, note: string): Promise<{ ok: true; before: number; after: number } | Fail> {
  const before = await saveVersion(actor, { id: d._id, label: "Before AI edit", kind: "auto" });
  if (!before.ok) return { ok: false, message: before.error.message };
  const saved = await saveDraft(actor, { id: d._id, rev: d.rev, pbdoc: doc }, "edit");
  if (!saved.ok) return { ok: false, message: saved.error.message };
  const after = await saveVersion(actor, { id: d._id, label, changeNote: note.slice(0, 500), kind: "manual" });
  if (!after.ok) return { ok: false, message: after.error.message };
  return { ok: true, before: before.version.number, after: after.version.number };
}

export async function sendPbChat(actor: PbActor, documentId: string, message: string, files: File[] = [], opts: { scopeBlockIds?: string[]; mode?: "apply" | "suggest" } = {}): Promise<{ ok: true; user: ChatTurn; reply: ChatTurn } | Fail> {
  const text = String(message ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, MAX_MESSAGE);
  if (text.length < 3) return { ok: false, message: "Tell the assistant what to change." };
  const o = await open(actor, documentId, "edit");
  if (!o.ok) return o;
  const d = o.d;
  const prepared = files.length ? await prepareAttachments(files) : { ok: true as const, items: [] };
  if (!prepared.ok) return { ok: false, message: prepared.message };
  const chat = await col();
  const history = await chat.find({ documentId: d._id }).sort({ at: -1 }).limit(8).toArray();
  const ctx = await toolCtx(actor, d);
  const outcome = await proposeEdit({
    doc: d.pbdoc, values: ctx.values, message: text, history: [...history].reverse().map((h) => ({ role: h.role, text: h.text })),
    docTitle: d.title, kindName: ctx.kindName, company: ctx.company, user: ctx.user, runDocumentId: ctx.runDocumentId, baseSha: d.contentSha256, attachments: prepared.items,
    scopeBlockIds: opts.scopeBlockIds?.slice(0, 200) ?? null, mode: opts.mode,
  });
  if (outcome.kind === "limited") return { ok: false, message: outcome.message };

  const userRow: ChatRow = { _id: randomUUID(), documentId: d._id, role: "user", text, at: new Date(), by: actor.id, versionNumber: null, previousVersionNumber: null, changes: null, undone: false, ...(prepared.items.length ? { attachments: prepared.items.map(attachmentRecord) } : {}) };
  await chat.insertOne(userRow);
  if (prepared.items.length) await recordPbAudit({ actor, action: "edit", entity: "document", entityId: d._id, documentId: d._id, summary: `Attached to Edit with AI: ${prepared.items.map((a) => `${a.name} (${Math.ceil(a.size / 1024)} KB)`).join(", ")}`, metadata: { files: prepared.items.map((a) => ({ name: a.name, size: a.size })) } }).catch(() => {});
  const reply = async (t: string, extra: Partial<ChatRow> = {}): Promise<{ ok: true; user: ChatTurn; reply: ChatTurn }> => {
    const row: ChatRow = { _id: randomUUID(), documentId: d._id, role: "assistant", text: t, at: new Date(), by: null, versionNumber: null, previousVersionNumber: null, changes: null, undone: false, ...extra };
    await chat.insertOne(row);
    return { ok: true, user: toTurn(userRow), reply: toTurn(row) };
  };
  if (outcome.kind === "refused") return reply(outcome.message);
  if (outcome.kind === "reply") return reply(outcome.reply);
  if (outcome.kind === "suggestion") return reply(outcome.reply, { steps: outcome.steps, ops: outcome.ops, suggestions: outcome.items.map((i) => ({ ...i, state: "pending" as const })) });
  const c = await commit(actor, d, outcome.doc, `AI: ${outcome.summary || "edit"}`, text);
  if (!c.ok) return c;
  return reply(outcome.reply, { versionNumber: c.after, previousVersionNumber: c.before, changes: outcome.changes, steps: outcome.steps });
}

/** Applies the accepted suggestions of one turn (the others stay as they are) as one new version. */
export async function acceptPbSuggestions(actor: PbActor, documentId: string, turnId: string, indexes: number[]): Promise<{ ok: true; reply: ChatTurn } | Fail> {
  const o = await open(actor, documentId, "edit");
  if (!o.ok) return o;
  const chat = await col();
  const row = await chat.findOne({ _id: String(turnId).slice(0, 64), documentId: o.d._id });
  if (!row || !row.ops || !row.suggestions) return { ok: false, message: "That suggestion no longer exists." };
  const pick = [...new Set(indexes.filter((i) => Number.isInteger(i)))].filter((i) => row.suggestions![i]?.state === "pending" && !row.suggestions![i]?.skipped);
  if (pick.length === 0) return { ok: false, message: "Nothing to apply." };
  const applied = applyOps(o.d.pbdoc, pick.map((i) => row.ops![i]));
  if (!applied.doc) return { ok: false, message: `Those changes could not be applied (${applied.skipped[0] ?? "the document changed"}). Ask again.` };
  const diff = diffDocs(o.d.pbdoc, applied.doc);
  const changes: ChatChange[] = diff.entries.filter((e) => e.kind !== "unchanged").slice(0, 40).map((e) => ({ kind: e.kind, before: e.before?.slice(0, 600) ?? null, after: e.after?.slice(0, 600) ?? null, blockId: e.id }));
  const c = await commit(actor, o.d, applied.doc, `AI: ${pick.length} accepted change${pick.length === 1 ? "" : "s"}`, row.text);
  if (!c.ok) return c;
  const suggestions = row.suggestions.map((s, i) => (pick.includes(i) ? { ...s, state: "accepted" as const } : s));
  await chat.updateOne({ _id: row._id }, { $set: { suggestions, versionNumber: c.after, previousVersionNumber: c.before, changes } });
  return { ok: true, reply: toTurn({ ...row, suggestions, versionNumber: c.after, previousVersionNumber: c.before, changes }) };
}

export async function rejectPbSuggestions(actor: PbActor, documentId: string, turnId: string): Promise<{ ok: true } | Fail> {
  const o = await open(actor, documentId, "edit");
  if (!o.ok) return o;
  const chat = await col();
  const row = await chat.findOne({ _id: String(turnId).slice(0, 64), documentId: o.d._id });
  if (!row?.suggestions) return { ok: false, message: "That suggestion no longer exists." };
  await chat.updateOne({ _id: row._id }, { $set: { suggestions: row.suggestions.map((s) => (s.state === "pending" ? { ...s, state: "rejected" as const } : s)) } });
  return { ok: true };
}

export async function undoPbChat(actor: PbActor, documentId: string, turnId: string): Promise<{ ok: true } | Fail> {
  const o = await open(actor, documentId, "edit");
  if (!o.ok) return o;
  const d = o.d;
  const chat = await col();
  const turn = await chat.findOne({ _id: String(turnId).slice(0, 64), documentId: d._id });
  if (!turn || turn.role !== "assistant" || turn.versionNumber === null || turn.previousVersionNumber === null) return { ok: false, message: "That change cannot be undone." };
  if (turn.undone) return { ok: false, message: "That change was already undone." };
  const v = await getDocumentVersion(actor, d._id, turn.versionNumber);
  if (!v.ok || v.version.contentSha256 !== d.contentSha256) return { ok: false, message: "The document has changed since. Use the version history to go back to an earlier copy." };
  const r = await revertToVersion(actor, { id: d._id, number: turn.previousVersionNumber, rev: d.rev });
  if (!r.ok) return { ok: false, message: r.error.message };
  await chat.updateOne({ _id: turn._id }, { $set: { undone: true } });
  return { ok: true };
}

// ── Ask, review, text tools ──────────────────────────────────────────────────────────────────────────────────────
export async function askPb(actor: PbActor, documentId: string, message: string, files: File[] = []): Promise<{ ok: true; answer: string; references: { blockId: string; quote: string }[] } | Fail> {
  const o = await open(actor, documentId, "read");
  if (!o.ok) return o;
  const prepared = files.length ? await prepareAttachments(files) : { ok: true as const, items: [] };
  if (!prepared.ok) return { ok: false, message: prepared.message };
  const chat = await col();
  const history = await chat.find({ documentId: o.d._id }).sort({ at: -1 }).limit(6).toArray();
  return askDocument({ ...(await toolCtx(actor, o.d)), question: message, history: [...history].reverse().map((h) => ({ role: h.role, text: h.text })), attachments: prepared.items });
}

export async function reviewPb(actor: PbActor, documentId: string): Promise<{ ok: true; issues: ReviewIssue[] } | Fail> {
  const o = await open(actor, documentId, "read");
  return o.ok ? reviewDocument(await toolCtx(actor, o.d)) : o;
}

/** Applies one review suggestion (a replacement of one block's text) as a new version. */
export async function applyPbIssue(actor: PbActor, documentId: string, issue: { blockId: string | null; replacement: string }): Promise<{ ok: true } | Fail> {
  const o = await open(actor, documentId, "edit");
  if (!o.ok) return o;
  if (!issue.blockId || !issue.replacement.trim()) return { ok: false, message: "There is no automatic fix for this one. Edit the document by hand or ask the assistant." };
  const applied = applyOps(o.d.pbdoc, [{ op: "replace", blockId: issue.blockId, blockType: "none", level: 0, text: issue.replacement.slice(0, 4000) }]);
  if (!applied.doc) return { ok: false, message: `That fix could not be applied (${applied.skipped[0] ?? "the document changed"}).` };
  const c = await commit(actor, o.d, applied.doc, "AI: proofreading fix", "Applied a proofreading suggestion");
  return c.ok ? { ok: true } : c;
}

export async function transformPb(actor: PbActor, documentId: string, input: { action: TextAction; instruction?: string; selected: string }): Promise<{ ok: true; text: string } | Fail> {
  const o = await open(actor, documentId, "edit");
  return o.ok ? transformText({ ...(await toolCtx(actor, o.d)), ...input }) : o;
}
