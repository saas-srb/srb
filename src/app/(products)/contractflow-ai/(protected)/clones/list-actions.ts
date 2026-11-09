"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { checkRenderable, renderClone } from "@/lib/products/contractflow-ai/clone-render";
import { resendToSigner, sendCloneToSigners } from "@/lib/products/contractflow-ai/dispatch";
import { deleteClone, getClone, markCloneReady, renameClone, restoreCloneVersion, updateSendPlan, voidClone } from "@/lib/products/contractflow-ai/clones";
import { compareCloneVersions, listCloneVersions } from "@/lib/products/contractflow-ai/clone-versions";
import { PartyError, linkParty, searchParties } from "@/lib/products/contractflow-ai/parties";
import { acceptSuggestions, applyCloneIssue, askClone, listChat, rejectSuggestions, reviewClone, sendChatMessage, transformClone, undoChatChange } from "@/lib/products/contractflow-ai/ai-edit";
import { ensureSealed } from "@/lib/products/contractflow-ai/seal";
import { getRequest } from "@/lib/products/contractflow-ai/requests";
import { isLinkedType, isPartyType, type PickerHit } from "@/lib/products/contractflow-ai/party-types";
import type { ReviewIssue, TextAction } from "@/lib/products/playbook-ai/ai/edit-types";
import { CLONE_STATUS_LABEL, type ChatTurn, type CloneStatus } from "@/lib/products/contractflow-ai/clone-types";
import type { NewSigner } from "@/lib/products/contractflow-ai/requests-types";
import { listEvents } from "@/lib/products/contractflow-ai/events";
import type { DiffZone, WordSegment } from "@/lib/products/playbook-ai/diff";

/** Server actions behind the ContractFlow lists and the document page. The person comes from the session; the data layer checks every permission again. */
type Fail = { ok: false; message: string };
const SIGNED_OUT: Fail = { ok: false, message: "Please sign in again." };
const bust = () => { for (const p of ["sops", "documents", "kpis"]) revalidatePath(`/contractflow-ai/${p}`); revalidatePath("/contractflow-ai"); };

export async function deleteCloneAction(id: string): Promise<{ ok: true } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await deleteClone(v, String(id));
  if (!r.ok) return { ok: false, message: r.error.message };
  bust();
  return { ok: true };
}

export async function previewCloneAction(id: string): Promise<{ ok: true; pdfBase64: string } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await renderClone(v, String(id), "pdf");
  return r.ok ? { ok: true, pdfBase64: r.file.buffer.toString("base64") } : { ok: false, message: r.error.message };
}

export async function searchPartyCfAction(type: string, q: string): Promise<{ ok: true; hits: PickerHit[] } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  if (!isPartyType(type)) return { ok: false, message: "Unknown kind of party." };
  try {
    return { ok: true, hits: await searchParties({ ...v, sendForSignature: true }, { type, q: String(q ?? "").slice(0, 80), limit: 10 }) };
  } catch (e) {
    return { ok: false, message: e instanceof PartyError ? e.message : "The search failed." };
  }
}

export interface SendCloneInput {
  id: string;
  party?: { type: string; partyId?: string | null; recordId?: string | null; displayName?: string };
  signers: NewSigner[];
  orderMode: "parallel" | "sequential";
  expiryDays: number;
}

/** Sets the recipients, checks the document renders without blanks, marks it ready and emails each signer their own link. */
export async function sendCloneAction(input: SendCloneInput): Promise<{ ok: true; message: string } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  let party = input.party ? { type: input.party.type, partyId: input.party.partyId ?? null, displayName: input.party.displayName } : undefined;
  if (party && isPartyType(party.type) && isLinkedType(party.type) && !party.partyId) {
    try {
      const linked = await linkParty({ ...v, sendForSignature: true }, { type: party.type, recordId: String(input.party?.recordId ?? "") });
      party = { type: party.type, partyId: linked.id, displayName: linked.displayName };
    } catch (e) {
      return { ok: false, message: e instanceof PartyError ? e.message : "The recipient could not be set up." };
    }
  }
  const planned = await updateSendPlan(v, String(input.id), { party, signers: input.signers, orderMode: input.orderMode, expiryDays: input.expiryDays });
  if (!planned.ok) return { ok: false, message: planned.error.message };
  let clone = planned.clone;
  if (clone.status === "clone_draft") {
    const check = await checkRenderable(clone);
    if (!check.ok) return { ok: false, message: `This document cannot be sent yet: ${check.message}` };
    const ready = await markCloneReady(v, clone._id, { rendered: true });
    if (!ready.ok) return { ok: false, message: ready.error.message };
    clone = ready.clone;
  }
  const sent = await sendCloneToSigners(v, clone._id);
  if (!sent.ok) return { ok: false, message: sent.error.message };
  bust();
  const { delivered, notDelivered } = sent.result;
  return { ok: true, message: notDelivered.length ? `Sent to ${delivered.length}. Could not email ${notDelivered.join(", ")}; check the addresses and the email connection, then use Resend.` : `Sent to ${delivered.length} ${delivered.length === 1 ? "signer" : "signers"} by email.` };
}

export async function resendCloneAction(cloneId: string, signerId: string): Promise<{ ok: true; message: string } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await resendToSigner(v, String(cloneId), String(signerId));
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, message: r.delivered ? `A new link was emailed to ${r.email}.` : `A new link was made but the email to ${r.email} could not be sent. Check the email connection.` };
}

export async function voidCloneFromListAction(id: string, reason: string): Promise<{ ok: true } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await voidClone(v, String(id), String(reason));
  if (!r.ok) return { ok: false, message: r.error.message };
  bust();
  return { ok: true };
}

export interface CloneDetails {
  id: string;
  title: string;
  kind: string;
  status: string;
  statusLabel: string;
  partyName: string;
  partyType: string;
  createdAt: string;
  updatedAt: string;
  rev: number;
  signers: { id: string; name: string; email: string; role: string; order: number; status: string; signedAt: string | null; viewedAt: string | null; declineReason: string | null }[];
  requestStatus: string | null;
  expiresAt: string | null;
  events: { at: string; type: string }[];
  voidReason: string | null;
  source: { documentId: string; versionNumber: number };
}

export async function cloneDetailsAction(id: string): Promise<{ ok: true; data: CloneDetails } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const g = await getClone(v, String(id));
  if (!g.ok) return { ok: false, message: g.error.message };
  const c = g.clone;
  let signers: CloneDetails["signers"] = [];
  let requestStatus: string | null = null;
  let expiresAt: string | null = null;
  let events: CloneDetails["events"] = [];
  if (c.requestId) {
    try {
      const r = await getRequest(c.requestId);
      requestStatus = r.request.status;
      expiresAt = r.request.expiresAt.toISOString();
      signers = r.signers.map((s) => ({ id: s._id, name: s.name, email: s.email, role: s.role, order: s.order, status: s.status, signedAt: s.signedAt ? s.signedAt.toISOString() : null, viewedAt: s.documentViewedAt ? s.documentViewedAt.toISOString() : null, declineReason: s.declineReason }));
      events = (await listEvents(c.requestId)).map((e) => ({ at: e.at.toISOString(), type: e.type })).slice(-60);
    } catch { /* a request that cannot be read is shown as no signers */ }
  } else {
    signers = c.signerPlan.map((s, i) => ({ id: `plan-${i}`, name: s.name, email: s.email, role: s.role, order: s.order ?? i + 1, status: "planned", signedAt: null, viewedAt: null, declineReason: null }));
  }
  return { ok: true, data: { id: c._id, title: c.title, kind: c.kind ?? "document", status: c.status, statusLabel: CLONE_STATUS_LABEL[c.status as CloneStatus], partyName: c.party.displayName, partyType: c.party.type, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), rev: c.rev, signers, requestStatus, expiresAt, events, voidReason: c.voidReason, source: { documentId: c.source.documentId, versionNumber: c.source.versionNumber } } };
}

// ── Versions ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface VersionRow { number: number; summary: string; source: string; by: string; at: string; statuses: { status: string; at: string; note: string | null }[] }

export async function listVersionsAction(id: string): Promise<{ ok: true; versions: VersionRow[] } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await listCloneVersions(v, String(id));
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, versions: r.versions.map((x) => ({ number: x.number, summary: x.summary, source: x.source, by: x.byName ?? "", at: x.at.toISOString(), statuses: x.statusLog.map((s) => ({ status: s.status, at: s.at.toISOString(), note: s.note })) })) };
}

export interface CompareRow { id: string; zone: DiffZone; blockType: string; kind: string; before: string | null; after: string | null; words: WordSegment[] | null }

export async function compareVersionsAction(id: string, from: number, to: number): Promise<{ ok: true; summary: string; rows: CompareRow[]; identical: boolean } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await compareCloneVersions(v, String(id), Number(from), Number(to));
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, summary: r.summary, identical: r.diff.identical, rows: r.diff.entries.filter((e) => e.kind !== "unchanged").slice(0, 300).map((e) => ({ id: e.id, zone: e.zone, blockType: e.blockType, kind: e.kind, before: e.before, after: e.after, words: e.words })) };
}

export async function restoreVersionAction(id: string, number: number): Promise<{ ok: true } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const g = await getClone(v, String(id));
  if (!g.ok) return { ok: false, message: g.error.message };
  const r = await restoreCloneVersion(v, g.clone._id, Number(number), g.clone.rev);
  if (!r.ok) return { ok: false, message: r.error.message };
  revalidatePath(`/contractflow-ai/clones/${id}`);
  return { ok: true };
}

// ── Edit with AI ───────────────────────────────────────────────────────────────────────────────────────────────

export async function chatLoadAction(id: string): Promise<{ ok: true; turns: ChatTurn[]; canEdit: boolean; reason: string | null } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await listChat(v, String(id));
  return r.ok ? { ok: true, turns: r.turns, canEdit: r.canEdit, reason: r.reason } : { ok: false, message: r.error.message };
}

export async function chatSendAction(id: string, form: FormData): Promise<{ ok: true; user: ChatTurn; reply: ChatTurn } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await sendChatMessage(v, String(id), String(form.get("message") ?? ""), form.getAll("files").filter((f): f is File => f instanceof File), cfOpts(form));
  return r.ok ? { ok: true, user: r.user, reply: r.reply } : { ok: false, message: r.error.message };
}

export async function chatUndoAction(id: string, turnId: string): Promise<{ ok: true } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await undoChatChange(v, String(id), String(turnId));
  if (!r.ok) return { ok: false, message: r.error.message };
  revalidatePath(`/contractflow-ai/clones/${id}`);
  return { ok: true };
}

/** Makes the signed copy again when sealing did not finish (the signatures themselves are never lost). */
export async function sealNowAction(id: string): Promise<{ ok: true } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const g = await getClone(v, String(id));
  if (!g.ok) return { ok: false, message: g.error.message };
  const r = await ensureSealed(g.clone._id);
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/contractflow-ai/clones/${id}`);
  return { ok: true };
}

function cfOpts(form: FormData): { scopeBlockIds?: string[]; mode?: "apply" | "suggest" } {
  let scope: string[] | undefined;
  try { const v: unknown = JSON.parse(String(form.get("scope") ?? "null")); if (Array.isArray(v)) scope = v.filter((x): x is string => typeof x === "string").slice(0, 200); } catch { scope = undefined; }
  return { scopeBlockIds: scope, mode: form.get("mode") === "suggest" ? "suggest" : "apply" };
}
export async function chatAskAction(id: string, form: FormData): Promise<{ ok: true; answer: string; references: { blockId: string; quote: string }[] } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await askClone(v, String(id), String(form.get("message") ?? ""), form.getAll("files").filter((f): f is File => f instanceof File));
  return r.ok ? { ok: true, answer: r.answer, references: r.references } : { ok: false, message: r.error.message };
}
export async function chatReviewAction(id: string): Promise<{ ok: true; issues: ReviewIssue[] } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await reviewClone(v, String(id));
  return r.ok ? { ok: true, issues: r.issues } : { ok: false, message: r.error.message };
}
export async function chatApplyIssueAction(id: string, issue: { blockId: string | null; replacement: string }): Promise<{ ok: true } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await applyCloneIssue(v, String(id), { blockId: issue.blockId ? String(issue.blockId) : null, replacement: String(issue.replacement ?? "") });
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}
export async function chatAcceptAction(id: string, turnId: string, indexes: number[]): Promise<{ ok: true; reply: ChatTurn } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await acceptSuggestions(v, String(id), String(turnId), Array.isArray(indexes) ? indexes.map(Number) : []);
  return r.ok ? { ok: true, reply: r.reply } : { ok: false, message: r.error.message };
}
export async function chatRejectAction(id: string, turnId: string): Promise<{ ok: true } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await rejectSuggestions(v, String(id), String(turnId));
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}
export async function transformCloneAction(id: string, input: { action: TextAction; instruction?: string; selected: string }): Promise<{ ok: true; text: string } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await transformClone(v, String(id), { action: input.action, instruction: input.instruction ? String(input.instruction) : undefined, selected: String(input.selected ?? "") });
  return r.ok ? { ok: true, text: r.text } : { ok: false, message: r.error.message };
}

export async function renameCloneAction(id: string, title: string): Promise<{ ok: true } | Fail> {
  const v = await getViewer();
  if (!v) return SIGNED_OUT;
  const r = await renameClone(v, String(id), String(title));
  if (!r.ok) return { ok: false, message: r.error.message };
  bust();
  return { ok: true };
}
