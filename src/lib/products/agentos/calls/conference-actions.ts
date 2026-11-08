"use server";

import { runCallAction, type ActionResult } from "@/lib/products/agentos/calls/action-run";
import { addConferenceNote, endConferenceCall, handBackConference, listenToCall, takeOverConference, type JoinCredentials } from "@/lib/products/agentos/calls/conference";
import { confirmSetupStep, getConferenceSetup, type ConferenceSetup } from "@/lib/products/agentos/calls/conference-setup";
import { getConference } from "@/lib/products/agentos/calls/conference-state";
import { addNote, endCall, getLiveView, pumpMonitor, type LiveView } from "@/lib/products/agentos/calls/live";
import type { CallFailure } from "@/lib/products/agentos/calls/types";
import { NotFoundError } from "@/lib/products/agentos/viewer";

/**
 * Server actions of the live call console and the live-call setup checklist. The person comes from the AgentOS session cookie, never from an
 * argument; each function re-checks who may do what (the person who placed the call, VOICE_CALL_TAKEOVER, or VOICE_CALL_MANAGE).
 */

const id = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");
type Outcome = { ok: true; unchanged?: boolean } | { ok: false; failure: CallFailure };
const asResult = (r: Outcome) => (r.ok ? r : { ok: false as const, error: r.failure.message, failure: r.failure });

/** One poll of the console (about every second): new transcript lines, who is in control, leg states. */
export async function pollLiveAction(callId: string, afterSeq: number): Promise<ActionResult<{ view: LiveView }>> {
  return runCallAction({}, async (v) => ({ ok: true as const, view: await getLiveView(v, id(callId), Number(afterSeq) || 0) }));
}

/** Direct (non-conference) calls only: holds ElevenLabs' live monitor open for a few seconds and stores what it replays. */
export async function pumpMonitorAction(callId: string): Promise<ActionResult<{ stored: number }>> {
  return runCallAction({}, async (v) => {
    try {
      return { ok: true as const, ...(await pumpMonitor(v, id(callId), { maxMs: 7000 })) };
    } catch (e) {
      if (e instanceof NotFoundError) throw e;
      return { ok: false as const, error: e instanceof Error ? e.message : "Live monitoring isn't available." };
    }
  });
}

export async function listenAction(callId: string): Promise<ActionResult<JoinCredentials>> {
  return runCallAction({ write: true }, async (v) => {
    const r = await listenToCall(v, id(callId));
    return r.ok ? r : (asResult(r) as ActionResult<JoinCredentials>);
  });
}
export async function takeOverAction(callId: string): Promise<ActionResult<{ unchanged?: boolean }>> {
  return runCallAction({ write: true }, async (v) => asResult(await takeOverConference(v, id(callId))));
}
export async function handBackAction(callId: string): Promise<ActionResult<{ unchanged?: boolean }>> {
  return runCallAction({ write: true }, async (v) => asResult(await handBackConference(v, id(callId))));
}
export async function endLiveCallAction(callId: string): Promise<ActionResult<{ unchanged?: boolean }>> {
  return runCallAction({ write: true }, async (v) => {
    if (await getConference(id(callId))) return asResult(await endConferenceCall(v, id(callId)));
    return asResult(await endCall(v, id(callId)));
  });
}
export async function addLiveNoteAction(callId: string, text: string): Promise<ActionResult<object>> {
  return runCallAction({ write: true }, async (v) => {
    const r = (await getConference(id(callId))) ? await addConferenceNote(v, id(callId), String(text ?? "")) : await addNote(v, id(callId), String(text ?? ""));
    return asResult(r);
  });
}

/** The live-call setup checklist (the Phone settings page and the console's "not set up" panel). */
export async function liveSetupAction(): Promise<ActionResult<{ setup: ConferenceSetup }>> {
  return runCallAction({}, async (v) => ({ ok: true as const, setup: await getConferenceSetup(v) }));
}
export async function confirmLiveSetupStepAction(step: "voiceUrl" | "agentAudio", done: boolean): Promise<ActionResult<object>> {
  return runCallAction({ write: true, permission: "VOICE_CALL_MANAGE" }, async (v) => {
    await confirmSetupStep(v, step, Boolean(done));
    return { ok: true as const };
  });
}
