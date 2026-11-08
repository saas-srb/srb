import "server-only";
import { getCurrentChatUser, type CurrentChatUser } from "@/lib/messenger-auth";
import { getCall, isParticipant, type CallSession } from "@/lib/products/huddle-ai/calls";
import { HttpError } from "@/lib/products/huddle-ai/route-helpers";

/**
 * Guard for every call route: a valid Messenger session that is a participant
 * (any state) of the call. `mustBeInvited` lets ringing/left users still hit
 * decline / join.
 */
export async function requireCallAccess(callId: string): Promise<{ user: CurrentChatUser; call: CallSession }> {
  const user = await getCurrentChatUser();
  if (!user) throw new HttpError(401, "Not signed in.");
  const call = await getCall(callId);
  if (!call) throw new HttpError(404, "Call not found.");
  if (!(await isParticipant(callId, user.id))) throw new HttpError(403, "You're not part of this call.");
  return { user, call };
}
