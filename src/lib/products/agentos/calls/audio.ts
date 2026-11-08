import "server-only";
import { recordAuditThrottled } from "@/lib/products/agentos/audit";
import { loadCallForViewer } from "@/lib/products/agentos/calls/engine";
import { NotFoundError, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { fetchAudioCached } from "@/lib/products/agentos/voice/call-history";
import type { CallDeps } from "@/lib/products/agentos/voice/calls";

/**
 * The recording of one engine call (phone, scheduled, inbound, website). Access is exactly the call page's: the person who placed it, or
 * anyone with call oversight; the call is read through the company's own data, so another company's id is simply "not found". Streamed
 * through the server: the ElevenLabs key, the conversation id and the upstream URL never reach the browser.
 * Throws NotFoundError when the id is not an engine call this person may see, or the call has no recording.
 */
export async function getEngineCallAudio(viewer: AibotsViewer, callId: string, deps: Pick<CallDeps, "client"> = {}): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const call = await loadCallForViewer(viewer, callId, true);
  if (!call.conversationId || call.hasAudio === false) throw new NotFoundError();
  if (call.initiatedBy?.userId !== viewer.userId) {
    await recordAuditThrottled({ actorId: viewer.userId, actorEmail: viewer.email, action: "view", entity: "call", entityId: call._id, botId: call.agentId, summary: "Played the recording of someone else's call" }, 30 * 60 * 1000);
  }
  return fetchAudioCached(`engine:${call._id}:${call.conversationId}`, call.conversationId, deps);
}
