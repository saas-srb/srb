import "server-only";
import { recordAudit } from "@/lib/products/agentos/audit";
import { endConferenceCall } from "@/lib/products/agentos/calls/conference";
import { getConference } from "@/lib/products/agentos/calls/conference-state";
import { cancelCall, loadCallForViewer, settleCall } from "@/lib/products/agentos/calls/engine";
import { endCall as endDirectCall, type LiveDeps } from "@/lib/products/agentos/calls/live";
import { ownTwilio } from "@/lib/products/agentos/calls/numbers";
import { getBot } from "@/lib/products/agentos/bots";
import { reconcileCallNow, reconcileStaleCalls, type StaleDeps } from "@/lib/products/agentos/calls/stale";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import type { CallFailure, ExistingCallInfo } from "@/lib/products/agentos/calls/types";
import { NotFoundError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";

/**
 * "End this call" for the dialog, the call list and the Active calls strip. One entry point for every kind of call:
 *   scheduled        -> cancelled before it is dialed;
 *   conference call  -> Twilio hang-up of the lead and the conference;
 *   direct call      -> ElevenLabs end_call, falling back to a Twilio hang-up by call sid.
 * Allowed for the person who placed the call and for anyone with VOICE_CALL_TAKEOVER or VOICE_CALL_MANAGE. Afterwards the provider is asked
 * once so the call is settled at once, and a call the person ended themselves no longer blocks calling the same number (cancelledBy).
 */
export type EndDeps = LiveDeps & StaleDeps;

export async function endCallNow(viewer: AibotsViewer, callId: string, deps: EndDeps = {}): Promise<{ ok: true; via: "cancelled" | "twilio" | "elevenlabs" | "already_over" } | { ok: false; failure: CallFailure }> {
  const c = await loadCallForViewer(viewer, callId, true);
  const mine = c.initiatedBy?.userId === viewer.userId;
  if (!mine && !can(viewer, "VOICE_CALL_TAKEOVER") && !can(viewer, "VOICE_CALL_MANAGE")) throw new NotFoundError();
  if (c.status === "scheduled") {
    const r = await cancelCall(viewer, c._id);
    return r.ok ? { ok: true, via: "cancelled" } : r;
  }
  if (c.status !== "dialing" && c.status !== "in_progress") return { ok: true, via: "already_over" };
  const calls = await callsCollection();
  let via: "twilio" | "elevenlabs" | null = null;
  if (await getConference(c._id)) {
    const r = await endConferenceCall(viewer, c._id, deps.conference);
    if (!r.ok) return r;
    via = "twilio";
  } else {
    const r = c.conversationId ? await endDirectCall(viewer, c._id, deps) : null;
    if (r?.ok) via = r.via;
    else {
      // No conversation yet (still ringing) or ElevenLabs could not end it: hang up the phone call itself.
      const acct = c.callSid ? await (deps.twilio ?? ownTwilio)() : null;
      const res = acct && c.callSid
        ? await (deps.fetch ?? fetch)(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(acct.accountSid)}/Calls/${encodeURIComponent(c.callSid)}.json`, {
            method: "POST",
            headers: { authorization: `Basic ${Buffer.from(`${acct.accountSid}:${acct.authToken}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ Status: "completed" }),
            signal: AbortSignal.timeout(15_000),
          }).catch(() => null)
        : null;
      if (!res?.ok) return { ok: false, failure: { code: "provider_error", message: "The call couldn't be ended from here. Hang up from the phone, or try again." } };
      via = "twilio";
    }
  }
  await calls.updateOne({ _id: c._id }, { $set: { cancelledBy: viewer.userId, updatedAt: new Date() } });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: c._id, botId: c.agentId, summary: "Ended a call", metadata: { via } });
  // Settle now when the provider already says it is over; otherwise record that the person ended it (the provider's callbacks add the details).
  const moved = await reconcileCallNow(c._id, deps);
  const after = await calls.findOne({ _id: c._id });
  if (!moved && after && (after.status === "dialing" || after.status === "in_progress")) {
    await settleCall(c._id, { status: c.status === "in_progress" ? "completed" : "cancelled", failure: c.status === "in_progress" ? undefined : { code: "cancelled", message: "Ended by a team member before it was answered." } }, deps);
  }
  return { ok: true, via };
}

export interface ActiveCallRow extends ExistingCallInfo {
  targetLabel: string | null;
  direction: "outbound" | "inbound";
}

/** The calls ringing or in progress right now that this person may see (their own; everyone's with take-over / manage / oversight), for the Active calls strip. */
export async function listActiveCalls(viewer: AibotsViewer, deps: StaleDeps = {}): Promise<ActiveCallRow[]> {
  const oversee = can(viewer, "VOICE_CALL_TAKEOVER") || can(viewer, "VOICE_CALL_MANAGE");
  await reconcileStaleCalls(oversee ? {} : { initiatorId: viewer.userId }, deps).catch(() => 0);
  const rows = await (await callsCollection())
    .find({ status: { $in: ["dialing", "in_progress"] }, direction: { $in: ["outbound", "inbound"] }, ...(oversee ? {} : { "initiatedBy.userId": viewer.userId }) }, { projection: { transcript: 0 } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  const names = new Map<string, string>();
  for (const id of new Set(rows.map((r) => r.agentId))) names.set(id, (await getBot(id))?.name ?? "Deleted agent");
  return rows.map((c) => {
    const mine = c.initiatedBy?.userId === viewer.userId;
    return {
      id: c._id, agentName: names.get(c.agentId)!, purpose: c.purpose, status: c.status, at: (c.dialedAt ?? c.createdAt).toISOString(), startedBy: c.initiatedBy?.email ?? null, mine,
      canEnd: mine || oversee, canCancel: false, canLive: mine || oversee, testMode: c.testMode === true, targetLabel: c.target?.label ?? null, direction: c.direction as "outbound" | "inbound",
    };
  });
}
