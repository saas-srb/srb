"use server";

import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { sealIssuedVersion } from "@/lib/products/playbook-ai/exports-store";

/**
 * Seals the PDF and Word copies of an issued document. Call it right after issuing (the issue action does) so the stored bytes carry the
 * letterhead and company details of the day it was issued. Safe to call again: an already sealed version is left as it is.
 */
export async function sealIssuedDocumentAction(documentId: string): Promise<{ ok: true; version: number } | { ok: false; message: string }> {
  const actor = await getPbActor();
  if (!actor) return { ok: false, message: "Sign in to continue." };
  if (typeof documentId !== "string" || documentId.length > 64) return { ok: false, message: "That document does not exist." };
  const r = await sealIssuedVersion(actor, documentId);
  return r.ok ? { ok: true, version: r.version } : { ok: false, message: r.error.message };
}
