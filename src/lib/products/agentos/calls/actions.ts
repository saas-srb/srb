"use server";

import { revalidatePath } from "next/cache";
import { cancelCall, requestCall, retryCall } from "@/lib/products/agentos/calls/engine";
import { rescheduleCall } from "@/lib/products/agentos/calls/manage";
import { endCallNow } from "@/lib/products/agentos/calls/end";
import { reconcileStaleCalls } from "@/lib/products/agentos/calls/stale";
import { loadCallOptions, type CallOptions } from "@/lib/products/agentos/calls/options";
import { NO_ACCOUNT_MESSAGE, NO_PERMISSION_MESSAGE, runCallAction, type ActionResult } from "@/lib/products/agentos/calls/action-run";
import { BRIEFING_NOTICE, buildBriefing, cleanSelection, type BriefingSectionInfo } from "@/lib/products/agentos/calls/briefing";
import { usesBriefing } from "@/lib/products/agentos/calls/purposes";
import type { CallFailure, CallStatus } from "@/lib/products/agentos/calls/types";

/**
 * CROSS-PRODUCT CALL ACTIONS
 * --------------------------
 * Any product's client component may import these. The person is resolved from the AgentOS session cookie (the same way
 * `listAgentsFor` does), never from an argument, so someone without an AgentOS account or the "Place voice calls" permission gets a
 * clear message instead of a call. Every guard runs again on the server; nothing the browser sends is trusted.
 */

export interface PlacedCall {
  id: string;
  status: CallStatus;
  scheduledFor: string | null;
  /** True when the same idempotency key had already created this call (a double click or a retry). */
  deduplicated: boolean;
}

export interface RequestCallPayload {
  agentId: string;
  purpose: string;
  phone: string;
  target: { product: string; entityType: string; entityId: string; label: string };
  /** Free values for the purpose's variables; the server keeps only the ones the purpose declares. */
  context?: Record<string, string>;
  /** ISO instant, or null/undefined to call now. */
  scheduleAt?: string | null;
  /** Calls managers only. */
  overrideReason?: string;
  /** One per dialog open. */
  idempotencyKey: string;
  /** Keys of the briefing sections the person left ticked (see previewBriefingAction). Omitted = the defaults. */
  briefingSelection?: string[] | null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** What the call dialog shows: the agents, rules and any reason calling isn't possible yet. Safe for people without calling rights (they get the explanation). */
export async function loadCallOptionsAction(): Promise<ActionResult<{ options: CallOptions }>> {
  // Opening the dialog also asks the provider about this person's calls that look stuck, so an ended call doesn't block the number.
  return runCallAction({ noSession: NO_ACCOUNT_MESSAGE }, async (v) => {
    await reconcileStaleCalls({ initiatorId: v.userId, limit: 5 }).catch(() => 0);
    return { options: await loadCallOptions(v) };
  });
}

export async function requestCallAction(input: RequestCallPayload): Promise<ActionResult<{ call: PlacedCall }>> {
  return runCallAction({ permission: "VOICE_CALL", write: true, noSession: NO_ACCOUNT_MESSAGE, noPermission: NO_PERMISSION_MESSAGE }, async (v) => {
    const t = (input?.target ?? {}) as Partial<RequestCallPayload["target"]>;
    const context: Record<string, string> = {};
    if (input?.context && typeof input.context === "object") for (const [k, val] of Object.entries(input.context).slice(0, 30)) context[str(k, 60)] = str(val, 600);
    const res = await requestCall(v, {
      agentId: str(input?.agentId, 64),
      purpose: str(input?.purpose, 40),
      phone: str(input?.phone, 40),
      target: { product: str(t.product, 40), entityType: str(t.entityType, 40), entityId: str(t.entityId, 80), label: str(t.label, 120) },
      context,
      scheduleAt: input?.scheduleAt ? str(input.scheduleAt, 40) : null,
      overrideReason: typeof input?.overrideReason === "string" ? input.overrideReason : undefined,
      idempotencyKey: str(input?.idempotencyKey, 120),
      briefingSelection: cleanSelection(input?.briefingSelection),
    });
    if (!res.ok) return failure(res.failure);
    revalidatePath("/agentos/calls");
    return { ok: true as const, call: { id: res.call.id, status: res.call.status, scheduledFor: res.call.scheduledFor, deduplicated: res.deduplicated } };
  });
}

export interface BriefingPreview {
  /** False when the call's purpose or record has no briefing (nothing to show). */
  available: boolean;
  sections: BriefingSectionInfo[];
  warnings: string[];
  chars: number;
  budget: number;
  notice: string;
}

/**
 * "What the agent will know": the same builder the dial uses, run now for this person and this record, so the person can read it and untick parts
 * (for example the team's notes) before calling. The call itself rebuilds it at dial time with the same selection; if the data changed in between,
 * the agent gets the newer data.
 */
export async function previewBriefingAction(input: { target: RequestCallPayload["target"]; purpose: string; selection?: string[] | null }): Promise<ActionResult<{ preview: BriefingPreview }>> {
  return runCallAction({ permission: "VOICE_CALL", noSession: NO_ACCOUNT_MESSAGE, noPermission: NO_PERMISSION_MESSAGE }, async (v) => {
    const t = (input?.target ?? {}) as Partial<RequestCallPayload["target"]>;
    const purpose = str(input?.purpose, 40);
    const empty: BriefingPreview = { available: false, sections: [], warnings: [], chars: 0, budget: 0, notice: BRIEFING_NOTICE };
    if (!usesBriefing([purpose])) return { preview: empty };
    const b = await buildBriefing(v, { product: str(t.product, 40), entityType: str(t.entityType, 40), entityId: str(t.entityId, 80), label: str(t.label, 120) }, { selection: cleanSelection(input?.selection) });
    return { preview: { available: b.available, sections: b.sections, warnings: b.warnings, chars: b.chars, budget: b.budget, notice: BRIEFING_NOTICE } };
  });
}

function failure(f: CallFailure): { ok: false; error: string; failure: CallFailure } {
  return { ok: false, error: f.message, failure: f };
}

export async function cancelCallAction(callId: string): Promise<ActionResult<{ cancelled: true }>> {
  return runCallAction({ permission: "VOICE_CALL", write: true, noSession: NO_ACCOUNT_MESSAGE, noPermission: NO_PERMISSION_MESSAGE }, async (v) => {
    const res = await cancelCall(v, str(callId, 64));
    if (!res.ok) return failure(res.failure);
    revalidatePath("/agentos/calls");
    return { ok: true as const, cancelled: true as const };
  });
}

export async function rescheduleCallAction(callId: string, input: { scheduleAt: string; overrideReason?: string }): Promise<ActionResult<{ scheduledFor: string }>> {
  return runCallAction({ permission: "VOICE_CALL", write: true, noSession: NO_ACCOUNT_MESSAGE, noPermission: NO_PERMISSION_MESSAGE }, async (v) => {
    const res = await rescheduleCall(v, str(callId, 64), { scheduleAt: str(input?.scheduleAt, 40), overrideReason: typeof input?.overrideReason === "string" ? input.overrideReason : undefined });
    if (!res.ok) return failure(res.failure);
    revalidatePath("/agentos/calls");
    return { ok: true as const, scheduledFor: res.scheduledFor };
  });
}

/** A person decides to try a failed or unanswered call again. Only ever reachable from a signed-in session: nothing retries on its own. */
export async function retryCallAction(callId: string, idempotencyKey: string): Promise<ActionResult<{ call: PlacedCall }>> {
  return runCallAction({ permission: "VOICE_CALL", write: true, noSession: NO_ACCOUNT_MESSAGE, noPermission: NO_PERMISSION_MESSAGE }, async (v) => {
    const res = await retryCall(v, str(callId, 64), str(idempotencyKey, 120));
    if (!res.ok) return failure(res.failure);
    revalidatePath("/agentos/calls");
    return { ok: true as const, call: { id: res.call.id, status: res.call.status, scheduledFor: res.call.scheduledFor, deduplicated: res.deduplicated } };
  });
}

/** Ends a call that is ringing or in progress (or cancels one that is scheduled). The person who placed it, or someone with take-over / manage rights. */
export async function endCallAction(callId: string): Promise<ActionResult<{ ended: true; via: string }>> {
  return runCallAction({ noSession: NO_ACCOUNT_MESSAGE }, async (v) => {
    const res = await endCallNow(v, str(callId, 64));
    if (!res.ok) return failure(res.failure);
    revalidatePath("/agentos/calls");
    return { ok: true as const, ended: true as const, via: res.via };
  });
}
