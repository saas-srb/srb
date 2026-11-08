import "server-only";
import { recordAudit } from "@/lib/products/agentos/audit";
import { checkCallAllowed } from "@/lib/products/agentos/calls/guards";
import { loadCallForViewer, type EngineDeps } from "@/lib/products/agentos/calls/engine";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import type { CallFailure } from "@/lib/products/agentos/calls/types";
import { AibotsInputError, ForbiddenError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";

const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Moves a scheduled call to another time. The call keeps its identity (history, idempotency key); every guard is run again for the
 * NEW time with the call itself excluded from the duplicate check, and nothing changes unless they all pass. Its own caller or a
 * calls manager; a manager may give a reason to place it outside the calling hours.
 */
export async function rescheduleCall(
  viewer: AibotsViewer,
  callId: string,
  input: { scheduleAt: Date | string; overrideReason?: string },
  deps: EngineDeps = {},
): Promise<{ ok: true; scheduledFor: string } | { ok: false; failure: CallFailure }> {
  if (!can(viewer, "VOICE_CALL")) throw new ForbiddenError("VOICE_CALL");
  const c = await loadCallForViewer(viewer, callId);
  if (c.status !== "scheduled" || !c.phone) return { ok: false, failure: { code: "not_live", message: "Only a call that is still scheduled can be moved." } };
  const now = (deps.now ?? (() => new Date()))();
  const at = new Date(input.scheduleAt);
  if (Number.isNaN(at.getTime())) throw new AibotsInputError("That date and time isn't valid.");
  if (at.getTime() < now.getTime() + 60_000) return { ok: false, failure: { code: "schedule_in_past", message: "Pick a time in the future." } };
  if (at.getTime() - now.getTime() > MAX_AHEAD_MS) throw new AibotsInputError("Calls can be scheduled up to 90 days ahead.");
  const reason = typeof input.overrideReason === "string" ? input.overrideReason.trim().slice(0, 300) : "";
  if (reason && reason.length < 10) throw new AibotsInputError("Explain why this call must happen outside the calling hours (at least 10 characters).");
  const isManager = can(viewer, "VOICE_CALL_MANAGE");
  const check = await checkCallAllowed({
    viewer, agentId: c.agentId, purpose: c.purpose, rawPhone: c.phone, target: c.target, at, now, excludeCallId: c._id,
    initiatorId: c.initiatedBy?.userId ?? viewer.userId, windowOverride: isManager && reason.length >= 10, overrideRefused: Boolean(reason) && !isManager,
    fromNumberId: c.fromNumberId, deps,
  });
  if (!check.ok) return { ok: false, failure: check.failure };
  check.compliance.callingWindow.overrideReason = isManager && reason ? reason : null;
  const r = await (await callsCollection()).updateOne(
    { _id: c._id, status: "scheduled" },
    { $set: { scheduledFor: at, anchorAt: at, compliance: check.compliance, updatedAt: now } },
  );
  if (r.modifiedCount !== 1) return { ok: false, failure: { code: "not_live", message: "This call has just been dialed or cancelled, so it can't be moved." } };
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: c._id, botId: c.agentId, summary: "Rescheduled a call", metadata: { to: at.toISOString() } });
  return { ok: true, scheduledFor: at.toISOString() };
}
