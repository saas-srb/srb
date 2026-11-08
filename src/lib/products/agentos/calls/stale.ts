import "server-only";
import { getConference } from "@/lib/products/agentos/calls/conference-state";
import { reconcileConferenceNow } from "@/lib/products/agentos/calls/conference";
import { applyConversationUpdate, settleCall, type EngineDeps } from "@/lib/products/agentos/calls/engine";
import { ownTwilio } from "@/lib/products/agentos/calls/numbers";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import type { CallDoc } from "@/lib/products/agentos/calls/types";
import { workspaceAgentClient } from "@/lib/products/agentos/voice/connection";

/**
 * Calls that look stuck are checked with the provider on demand, not only by the 5-minute cron (which does not run locally unless
 * RUN_SCHEDULER=1): when the call dialog opens, when a duplicate is found, when the Active calls list is shown, and after a person ends a call.
 *   - conference call: Twilio's status of the lead's leg (GET call by sid);
 *   - direct call with a conversation: ElevenLabs' conversation;
 *   - direct call without one: Twilio's status of the call sid, if it has one.
 * Only moves a call forward, never dials, never throws.
 */

/** A call still dialing / in progress this long after its last update, with no progress, is asked about. */
export const STALE_AFTER_MS = 3 * 60 * 1000;
const LIVE = ["dialing", "in_progress"] as const;

export interface StaleDeps extends EngineDeps {
  /** Twilio for calls ElevenLabs placed directly (default: the company's own account). */
  twilio?: () => Promise<{ accountSid: string; authToken: string } | null>;
  fetch?: typeof fetch;
}

/** Asks the provider about one live call and settles it when the provider says it is over. True when the call was settled or moved. */
export async function reconcileCallNow(callId: string, deps: StaleDeps = {}): Promise<boolean> {
  try {
    const calls = await callsCollection();
    const call = await calls.findOne({ _id: callId });
    if (!call || !(LIVE as readonly string[]).includes(call.status)) return false;
    if (await getConference(callId)) return await reconcileConferenceNow(callId, deps.conference);
    if (call.conversationId) {
      const client = await (deps.client ?? workspaceAgentClient)();
      if (!client) return false;
      const detail = await client.getConversation(call.conversationId);
      const r = await applyConversationUpdate({ conversationId: call.conversationId, agentId: detail.agentId || null, detail }, deps);
      return Boolean(r.status && r.status !== call.status);
    }
    return await settleFromTwilio(call, deps);
  } catch (e) {
    console.error("[agentos calls] reconcile failed", e instanceof Error ? e.message.slice(0, 120) : "error");
    return false;
  }
}

async function settleFromTwilio(call: CallDoc, deps: StaleDeps): Promise<boolean> {
  if (!call.callSid) return false;
  const acct = await (deps.twilio ?? ownTwilio)();
  if (!acct) return false;
  const res = await (deps.fetch ?? fetch)(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(acct.accountSid)}/Calls/${encodeURIComponent(call.callSid)}.json`, {
    headers: { authorization: `Basic ${Buffer.from(`${acct.accountSid}:${acct.authToken}`).toString("base64")}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return false;
  const t = (await res.json().catch(() => null)) as { status?: string; duration?: string | null } | null;
  const secs = t?.duration && /^\d{1,7}$/.test(t.duration) ? Number(t.duration) : 0;
  const over: Record<string, { status: CallDoc["status"]; message: string | null }> = {
    completed: { status: secs > 0 ? "completed" : "no_answer", message: secs > 0 ? null : "Nobody answered." },
    busy: { status: "busy", message: "The line was busy." },
    "no-answer": { status: "no_answer", message: "Nobody answered." },
    failed: { status: "failed", message: "The call couldn't be connected." },
    canceled: { status: "failed", message: "The call was cancelled before anyone answered." },
  };
  const verdict = t?.status ? over[t.status] : undefined;
  if (!verdict) return false;
  return settleCall(call._id, { status: verdict.status, failure: verdict.message ? { code: "provider_error", message: verdict.message } : undefined, durationSecs: secs || undefined }, deps);
}

/** Checks the live calls that have been quiet for STALE_AFTER_MS (one person's, or everyone's when `initiatorId` is omitted). */
export async function reconcileStaleCalls(opts: { initiatorId?: string; limit?: number } = {}, deps: StaleDeps = {}): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const rows = await (await callsCollection())
    .find({ status: { $in: [...LIVE] }, direction: { $in: ["outbound", "inbound"] }, updatedAt: { $lte: new Date(now.getTime() - STALE_AFTER_MS) }, ...(opts.initiatorId ? { "initiatedBy.userId": opts.initiatorId } : {}) })
    .sort({ updatedAt: 1 })
    .limit(opts.limit ?? 10)
    .toArray();
  let moved = 0;
  for (const c of rows) if (await reconcileCallNow(c._id, deps)) moved++;
  return moved;
}
