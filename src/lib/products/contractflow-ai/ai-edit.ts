import "server-only";
import { randomUUID } from "node:crypto";
import { lpmsCan } from "@/lib/lpms-roles";
import { attachmentRecord, prepareAttachments } from "@/lib/products/playbook-ai/ai/attachments";
import { applyOps, proposeEdit, MAX_MESSAGE } from "@/lib/products/playbook-ai/ai/edit-core";
import { askDocument, reviewDocument, transformText, type ToolCtx } from "@/lib/products/playbook-ai/ai/ai-tools";
import type { ChatChange, ReviewIssue, TextAction } from "@/lib/products/playbook-ai/ai/edit-types";
import { diffDocs } from "@/lib/products/playbook-ai/diff";
import { ITEM_KIND_INFO } from "@/lib/products/playbook-ai/items-types";
import { cfCloneChat } from "./cf-db";
import type { ChatTurn, CloneChatDoc, CloneResult } from "./clone-types";
import { getClone, isCloneLocked, restoreCloneVersion, saveCloneContent } from "./clones";
import type { LpmsViewer } from "./types";

/**
 * "Edit with AI" for ContractFlow clones. The shared core (`playbook-ai/ai/edit-core.ts`) asks the model and validates; this file stores the
 * result as a NEW VERSION of the clone, keeps the conversation, and handles Undo. Refused once a signature locks the clone.
 */

// ── The chat ──────────────────────────────────────────────────────────────────────────────────────────────────
const toTurn = (r: CloneChatDoc): ChatTurn => ({ id: r._id, role: r.role, text: r.text, at: r.at.toISOString(), versionNumber: r.versionNumber, previousVersionNumber: r.previousVersionNumber, changes: r.changes, undone: r.undone, ...(r.steps?.length ? { steps: r.steps } : {}), ...(r.suggestions?.length ? { suggestions: r.suggestions } : {}), ...(r.attachments?.length ? { attachments: r.attachments.map((a) => ({ name: a.name, size: a.size })) } : {}) });

export async function listChat(v: LpmsViewer, cloneId: string): Promise<CloneResult<{ turns: ChatTurn[]; canEdit: boolean; reason: string | null }>> {
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  const rows = await (await cfCloneChat()).find({ cloneId }).sort({ at: 1 }).limit(100).toArray();
  const blocked = chatBlockedReason(v, g.clone);
  return { ok: true, turns: rows.map(toTurn), canEdit: blocked === null, reason: blocked };
}

function chatBlockedReason(v: LpmsViewer, c: Parameters<typeof isCloneLocked>[0] & { status: string }): string | null {
  if (!lpmsCan({ roles: v.roles, permissionOverrides: v.overrides }, "EDIT")) return "You can read this document but not edit it.";
  if (isCloneLocked(c)) return "A signature has been applied, so this document is locked and AI edits are off. Void it and create a new one to change it.";
  if (!["clone_draft", "ready", "sent"].includes(c.status)) return `This document is ${c.status.replace("_", " ")} and cannot be edited.`;
  return null;
}

export async function sendChatMessage(v: LpmsViewer, cloneId: string, message: string, files: File[] = [], opts: { scopeBlockIds?: string[]; mode?: "apply" | "suggest" } = {}): Promise<CloneResult<{ reply: ChatTurn; user: ChatTurn }>> {
  const text = String(message ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, MAX_MESSAGE);
  if (text.length < 3) return { ok: false, error: { code: "invalid", message: "Tell the assistant what to change." } };
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  const clone = g.clone;
  const blocked = chatBlockedReason(v, clone);
  if (blocked) return { ok: false, error: { code: clone.signatureCount > 0 || clone.lockedAt ? "locked" : "forbidden", message: blocked } };

  const prepared = files.length ? await prepareAttachments(files) : { ok: true as const, items: [] };
  if (!prepared.ok) return { ok: false, error: { code: "invalid", message: prepared.message } };
  const chat = await cfCloneChat();
  const history = await chat.find({ cloneId }).sort({ at: -1 }).limit(8).toArray();
  const outcome = await proposeEdit({
    doc: clone.pbdoc, values: clone.variableSnapshot.values, message: text,
    history: [...history].reverse().map((h) => ({ role: h.role, text: h.text })),
    docTitle: clone.title, kindName: ITEM_KIND_INFO[(clone.kind as keyof typeof ITEM_KIND_INFO | undefined) ?? "document"].docLabel,
    company: String(clone.variableSnapshot.values["company.name"] ?? "the company"), user: { id: v.userId, name: v.email }, runDocumentId: `clone:${cloneId}`, baseSha: clone.contentSha256, attachments: prepared.items, scopeBlockIds: opts.scopeBlockIds?.slice(0, 200) ?? null, mode: opts.mode,
  });
  if (outcome.kind === "limited") return { ok: false, error: { code: "unavailable", message: outcome.message } };

  const userRow: CloneChatDoc = { _id: randomUUID(), cloneId, role: "user", text, at: new Date(), by: v.userId, versionNumber: null, previousVersionNumber: null, changes: null, undone: false, ...(prepared.items.length ? { attachments: prepared.items.map(attachmentRecord) } : {}) };
  await chat.insertOne(userRow);
  const reply = async (t: string, extra: Partial<CloneChatDoc> = {}): Promise<CloneResult<{ reply: ChatTurn; user: ChatTurn }>> => {
    const row: CloneChatDoc = { _id: randomUUID(), cloneId, role: "assistant", text: t, at: new Date(), by: null, versionNumber: null, previousVersionNumber: null, changes: null, undone: false, ...extra };
    await chat.insertOne(row);
    return { ok: true, reply: toTurn(row), user: toTurn(userRow) };
  };
  if (outcome.kind === "refused") return reply(outcome.message);
  if (outcome.kind === "reply") return reply(outcome.reply);
  if (outcome.kind === "suggestion") return reply(outcome.reply, { steps: outcome.steps, ops: outcome.ops, suggestions: outcome.items.map((i) => ({ ...i, state: "pending" as const })) });
  const saved = await saveCloneContent(v, { id: cloneId, doc: outcome.doc, baseRev: clone.rev, source: "ai", note: `AI: ${outcome.summary || "edit"}` });
  if (!saved.ok) return { ok: false, error: saved.error };
  return reply(outcome.reply, { versionNumber: saved.rev, previousVersionNumber: clone.rev, changes: outcome.changes, steps: outcome.steps });
}

/** Reverts one AI change: possible only while it is still the newest version (anything later would be lost). The revert is itself a new version. */
export async function undoChatChange(v: LpmsViewer, cloneId: string, turnId: string): Promise<CloneResult<{ rev: number }>> {
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  const blocked = chatBlockedReason(v, g.clone);
  if (blocked) return { ok: false, error: { code: "locked", message: blocked } };
  const chat = await cfCloneChat();
  const turn = await chat.findOne({ _id: String(turnId).slice(0, 64), cloneId });
  if (!turn || turn.role !== "assistant" || turn.versionNumber === null || turn.previousVersionNumber === null) return { ok: false, error: { code: "not_found", message: "That change cannot be undone." } };
  if (turn.undone) return { ok: false, error: { code: "bad_status", message: "That change was already undone." } };
  if (g.clone.rev !== turn.versionNumber) return { ok: false, error: { code: "conflict", message: "The document has changed since. Use Versions to go back to an earlier copy." } };
  const r = await restoreCloneVersion(v, cloneId, turn.previousVersionNumber, g.clone.rev, `Undid the AI change (back to version ${turn.previousVersionNumber})`);
  if (!r.ok) return r;
  await chat.updateOne({ _id: turn._id }, { $set: { undone: true } });
  return { ok: true, rev: r.rev };
}


// ── Suggestions, ask, review, text tools ─────────────────────────────────────────────────────────────────────────
function toolCtx(v: LpmsViewer, clone: Awaited<ReturnType<typeof getClone>> & { ok: true }): ToolCtx {
  const c = clone.clone;
  return {
    doc: c.pbdoc, values: c.variableSnapshot.values, docTitle: c.title, kindName: ITEM_KIND_INFO[(c.kind as keyof typeof ITEM_KIND_INFO | undefined) ?? "document"].docLabel,
    company: String(c.variableSnapshot.values["company.name"] ?? "the company"), legal: false, user: { id: v.userId, name: v.email }, runDocumentId: `clone:${c._id}`, baseSha: c.contentSha256,
  };
}

export async function acceptSuggestions(v: LpmsViewer, cloneId: string, turnId: string, indexes: number[]): Promise<CloneResult<{ reply: ChatTurn }>> {
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  const blocked = chatBlockedReason(v, g.clone);
  if (blocked) return { ok: false, error: { code: "locked", message: blocked } };
  const chat = await cfCloneChat();
  const row = await chat.findOne({ _id: String(turnId).slice(0, 64), cloneId });
  if (!row || !row.ops || !row.suggestions) return { ok: false, error: { code: "not_found", message: "That suggestion no longer exists." } };
  const sug = row.suggestions;
  const pick = [...new Set(indexes.filter((i) => Number.isInteger(i)))].filter((i) => sug[i]?.state === "pending" && !sug[i]?.skipped);
  if (pick.length === 0) return { ok: false, error: { code: "invalid", message: "Nothing to apply." } };
  const applied = applyOps(g.clone.pbdoc, pick.map((i) => row.ops![i]));
  if (!applied.doc) return { ok: false, error: { code: "invalid", message: `Those changes could not be applied (${applied.skipped[0] ?? "the document changed"}). Ask again.` } };
  const saved = await saveCloneContent(v, { id: cloneId, doc: applied.doc, baseRev: g.clone.rev, source: "ai", note: `AI: ${pick.length} accepted change${pick.length === 1 ? "" : "s"}` });
  if (!saved.ok) return { ok: false, error: saved.error };
  const diff = diffDocs(g.clone.pbdoc, applied.doc);
  const changes: ChatChange[] = diff.entries.filter((e) => e.kind !== "unchanged").slice(0, 40).map((e) => ({ kind: e.kind, before: e.before?.slice(0, 600) ?? null, after: e.after?.slice(0, 600) ?? null, blockId: e.id }));
  const suggestions = sug.map((s2, i) => (pick.includes(i) ? { ...s2, state: "accepted" as const } : s2));
  await chat.updateOne({ _id: row._id }, { $set: { suggestions, versionNumber: saved.rev, previousVersionNumber: g.clone.rev, changes } });
  return { ok: true, reply: toTurn({ ...row, suggestions, versionNumber: saved.rev, previousVersionNumber: g.clone.rev, changes }) };
}

export async function rejectSuggestions(v: LpmsViewer, cloneId: string, turnId: string): Promise<CloneResult> {
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  const chat = await cfCloneChat();
  const row = await chat.findOne({ _id: String(turnId).slice(0, 64), cloneId });
  if (!row?.suggestions) return { ok: false, error: { code: "not_found", message: "That suggestion no longer exists." } };
  await chat.updateOne({ _id: row._id }, { $set: { suggestions: row.suggestions.map((s2) => (s2.state === "pending" ? { ...s2, state: "rejected" as const } : s2)) } });
  return { ok: true };
}

export async function askClone(v: LpmsViewer, cloneId: string, message: string, files: File[] = []): Promise<CloneResult<{ answer: string; references: { blockId: string; quote: string }[] }>> {
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  if (!lpmsCan({ roles: v.roles, permissionOverrides: v.overrides }, "VIEW")) return { ok: false, error: { code: "forbidden", message: "You may not view documents." } };
  const prepared = files.length ? await prepareAttachments(files) : { ok: true as const, items: [] };
  if (!prepared.ok) return { ok: false, error: { code: "invalid", message: prepared.message } };
  const history = await (await cfCloneChat()).find({ cloneId }).sort({ at: -1 }).limit(6).toArray();
  const r = await askDocument({ ...toolCtx(v, g), question: message, history: [...history].reverse().map((h) => ({ role: h.role, text: h.text })), attachments: prepared.items });
  return r.ok ? { ok: true, answer: r.answer, references: r.references } : { ok: false, error: { code: "unavailable", message: r.message } };
}

export async function reviewClone(v: LpmsViewer, cloneId: string): Promise<CloneResult<{ issues: ReviewIssue[] }>> {
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  const r = await reviewDocument(toolCtx(v, g));
  return r.ok ? { ok: true, issues: r.issues } : { ok: false, error: { code: "unavailable", message: r.message } };
}

export async function applyCloneIssue(v: LpmsViewer, cloneId: string, issue: { blockId: string | null; replacement: string }): Promise<CloneResult> {
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  const blocked = chatBlockedReason(v, g.clone);
  if (blocked) return { ok: false, error: { code: "locked", message: blocked } };
  if (!issue.blockId || !issue.replacement.trim()) return { ok: false, error: { code: "invalid", message: "There is no automatic fix for this one." } };
  const applied = applyOps(g.clone.pbdoc, [{ op: "replace", blockId: issue.blockId, blockType: "none", level: 0, text: issue.replacement.slice(0, 4000) }]);
  if (!applied.doc) return { ok: false, error: { code: "invalid", message: `That fix could not be applied (${applied.skipped[0] ?? "the document changed"}).` } };
  const saved = await saveCloneContent(v, { id: cloneId, doc: applied.doc, baseRev: g.clone.rev, source: "ai", note: "AI: proofreading fix" });
  return saved.ok ? { ok: true } : { ok: false, error: saved.error };
}

export async function transformClone(v: LpmsViewer, cloneId: string, input: { action: TextAction; instruction?: string; selected: string }): Promise<CloneResult<{ text: string }>> {
  const g = await getClone(v, cloneId);
  if (!g.ok) return g;
  const blocked = chatBlockedReason(v, g.clone);
  if (blocked) return { ok: false, error: { code: "locked", message: blocked } };
  const r = await transformText({ ...toolCtx(v, g), ...input });
  return r.ok ? { ok: true, text: r.text } : { ok: false, error: { code: "unavailable", message: r.message } };
}
