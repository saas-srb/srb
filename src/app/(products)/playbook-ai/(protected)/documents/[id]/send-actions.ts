"use server";

import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { getSendContext, listHandoffs, senderViewer, sendForSignature, type SendInput } from "@/lib/products/playbook-ai/handoff";
import type { HandoffRecord, SendContext } from "@/lib/products/playbook-ai/handoff-types";
import { searchParties, PartyError } from "@/lib/products/contractflow-ai/parties";
import { isPartyType, type PickerHit } from "@/lib/products/contractflow-ai/party-types";
import { getStampGuidance, type StampGuidance } from "@/lib/products/contractflow-ai/stamp/guidance";
import { jurisdictionByCode } from "@/lib/products/contractflow-ai/stamp/structure";

/** Server actions behind the "Send for signature" dialog. The signed-in person comes from the session; the data layer re-checks everything. */
type Fail = { ok: false; message: string };
const SIGNED_OUT: Fail = { ok: false, message: "Please sign in again." };

export async function loadSendContextAction(documentId: string, versionNumber?: number): Promise<{ ok: true; context: SendContext } | Fail> {
  const a = await getPbActor();
  if (!a) return SIGNED_OUT;
  const r = await getSendContext(a, String(documentId), Number.isInteger(versionNumber) ? versionNumber : undefined);
  return r.ok ? { ok: true, context: r.context } : { ok: false, message: r.message };
}

export async function searchPartyAction(documentId: string, type: string, q: string): Promise<{ ok: true; hits: PickerHit[] } | Fail> {
  const a = await getPbActor();
  if (!a) return SIGNED_OUT;
  const ctx = await getSendContext(a, String(documentId));
  if (!ctx.ok) return { ok: false, message: ctx.message };
  if (ctx.context.issues.some((i) => i.code === "permission")) return { ok: false, message: "You do not have the right to send documents for signature." };
  if (!isPartyType(type)) return { ok: false, message: "Unknown party type." };
  try {
    return { ok: true, hits: await searchParties(senderViewer(a), { type, q: String(q ?? ""), limit: 10 }) };
  } catch (e) {
    return { ok: false, message: e instanceof PartyError ? e.message : "The search failed." };
  }
}

export async function stampGuidanceAction(state: string, category: string): Promise<{ ok: true; guidance: StampGuidance } | Fail> {
  const a = await getPbActor();
  if (!a) return SIGNED_OUT;
  if (!jurisdictionByCode(String(state))) return { ok: false, message: "Choose a state or union territory." };
  return { ok: true, guidance: await getStampGuidance({ state: String(state), category: String(category) }) };
}

export async function sendForSignatureAction(input: SendInput): Promise<{ ok: true; cloneId: string } | (Fail & { issues?: { code: string; message: string }[] })> {
  const a = await getPbActor();
  if (!a) return SIGNED_OUT;
  const r = await sendForSignature(a, input);
  return r.ok ? { ok: true, cloneId: r.cloneId } : { ok: false, message: r.message, issues: r.issues };
}

export async function listHandoffsAction(documentId: string): Promise<HandoffRecord[]> {
  const a = await getPbActor();
  return a ? listHandoffs(a, String(documentId)) : [];
}
