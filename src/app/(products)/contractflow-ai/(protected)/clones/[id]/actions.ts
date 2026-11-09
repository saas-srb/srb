"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { checkRenderable, renderClone } from "@/lib/products/contractflow-ai/clone-render";
import { sendCloneToSigners } from "@/lib/products/contractflow-ai/dispatch";
import { getClone, markCloneReady, recloneVoided, saveCloneContent, voidClone } from "@/lib/products/contractflow-ai/clones";
import type { CloneError } from "@/lib/products/contractflow-ai/clone-types";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";

/**
 * Server actions behind the clone editor. The signed-in person always comes from the session (never from arguments) and the data layer
 * checks every permission again. A stale save returns `code: "CONFLICT"`, which the editor turns into its "someone else changed this" dialog.
 */
export type EditorLoad = { ok: true; id: string; doc: PBDoc; version: string } | { ok: false; code: string; message: string };
export type EditorSave = { ok: true; version: string; savedAt: string } | { ok: false; code: "CONFLICT" | "INVALID" | "FORBIDDEN" | "LOCKED" | "OTHER"; message: string };
export type EditorPreview = { ok: true; pdfBase64: string; pages: number; warnings: string[] } | { ok: false; message: string };
export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; message: string };

const SIGNED_OUT = "Please sign in again.";
const code = (e: CloneError): "CONFLICT" | "INVALID" | "FORBIDDEN" | "LOCKED" | "OTHER" =>
  e.code === "conflict" ? "CONFLICT" : e.code === "invalid" ? "INVALID" : e.code === "forbidden" ? "FORBIDDEN" : e.code === "locked" ? "LOCKED" : "OTHER";

export async function loadCloneForEditor(id: string): Promise<EditorLoad> {
  const v = await getViewer();
  if (!v) return { ok: false, code: "unauthorized", message: SIGNED_OUT };
  const r = await getClone(v, String(id));
  return r.ok ? { ok: true, id: r.clone._id, doc: r.clone.pbdoc, version: String(r.clone.rev) } : { ok: false, code: r.error.code, message: r.error.message };
}

export async function saveCloneFromEditor(input: { id: string; doc: unknown; baseVersion: string }): Promise<EditorSave> {
  const v = await getViewer();
  if (!v) return { ok: false, code: "FORBIDDEN", message: SIGNED_OUT };
  const r = await saveCloneContent(v, { id: String(input.id), doc: input.doc, baseRev: Number(input.baseVersion) });
  return r.ok ? { ok: true, version: String(r.rev), savedAt: r.savedAt } : { ok: false, code: code(r.error), message: r.error.message };
}

export async function previewCloneFromEditor(input: { id: string; doc: unknown }): Promise<EditorPreview> {
  const v = await getViewer();
  if (!v) return { ok: false, message: SIGNED_OUT };
  const r = await renderClone(v, String(input.id), "pdf", { unsavedDoc: input.doc });
  return r.ok ? { ok: true, pdfBase64: r.file.buffer.toString("base64"), pages: r.file.pages ?? 0, warnings: r.file.warnings } : { ok: false, message: r.error.message };
}

export async function markReadyAction(id: string): Promise<ActionResult> {
  const v = await getViewer();
  if (!v) return { ok: false, message: SIGNED_OUT };
  const g = await getClone(v, String(id));
  if (!g.ok) return { ok: false, message: g.error.message };
  const check = await checkRenderable(g.clone);
  if (!check.ok) return { ok: false, message: `This document cannot be marked ready yet: ${check.message}` };
  const r = await markCloneReady(v, g.clone._id, { rendered: true });
  return r.ok ? { ok: true, message: "Marked ready to send." } : { ok: false, message: r.error.message };
}

export async function voidCloneAction(id: string, reason: string): Promise<ActionResult> {
  const v = await getViewer();
  if (!v) return { ok: false, message: SIGNED_OUT };
  const r = await voidClone(v, String(id), String(reason));
  return r.ok ? { ok: true, message: "The document was voided." } : { ok: false, message: r.error.message };
}

/** Replaces a voided clone, then opens the new one. */
export async function recloneAction(id: string, basis: "edited" | "source"): Promise<ActionResult> {
  const v = await getViewer();
  if (!v) return { ok: false, message: SIGNED_OUT };
  if (basis !== "edited" && basis !== "source") return { ok: false, message: "Choose which copy to start from." };
  const r = await recloneVoided(v, String(id), { basis });
  if (!r.ok) return { ok: false, message: r.error.message };
  redirect(`/contractflow-ai/clones/${r.clone._id}`);
}

/** Makes the signature request from the clone's plan and emails each signer their own link. */
export async function sendToSignersAction(id: string): Promise<ActionResult> {
  const v = await getViewer();
  if (!v) return { ok: false, message: SIGNED_OUT };
  const r = await sendCloneToSigners(v, String(id));
  if (!r.ok) return { ok: false, message: r.error.message };
  const { delivered, notDelivered } = r.result;
  return notDelivered.length
    ? { ok: true, message: `Sent to ${delivered.length}. Could not email ${notDelivered.join(", ")}; check the addresses and the email connection, then send again.` }
    : { ok: true, message: `Sent to ${delivered.length} ${delivered.length === 1 ? "signer" : "signers"}.` };
}
