import "server-only";
import { AccessToken, TokenVerifier, TrackSource, type VideoGrant } from "livekit-server-sdk";
import { connectionValues } from "@/lib/platform/connections/resolve";
import type { MeetingRole, ParticipantKind } from "@/lib/dealflow-ai/meetings/types";

/**
 * LiveKit access. Credentials come from the connection system (the company's own LiveKit first, else the platform's, set in Platform Console).
 * The API secret never leaves the server; the browser gets the public URL and a token for exactly one person.
 */
export interface LiveKitCredentials {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export async function getLiveKitCredentials(): Promise<LiveKitCredentials | null> {
  const v = await connectionValues("livekit");
  if (!v?.url || !v.apiKey || !v.apiSecret) return null;
  return { url: v.url, apiKey: v.apiKey, apiSecret: v.apiSecret };
}

export interface GrantInput {
  roomId: string;
  participantId: string;
  name: string;
  kind: Exclude<ParticipantKind, "agent">;
  role: MeetingRole;
  /** Staff who may run the AI agents publish several audio tracks (one per agent) from their browser. */
  canRunAgents: boolean;
  ttlSeconds: number;
}

/** What the person may do in the room. Pure so it can be tested without a LiveKit server. */
export function buildGrant(i: Pick<GrantInput, "roomId" | "canRunAgents" | "kind" | "role">): VideoGrant {
  const base: VideoGrant = {
    roomJoin: true,
    room: i.roomId,
    canSubscribe: true,
    // Data messages are attributed to the sender's server-set identity by LiveKit, so nobody can post a line "as" someone else.
    canPublishData: true,
    canUpdateOwnMetadata: false,
    roomAdmin: false,
    roomCreate: false,
    roomList: false,
    recorder: false,
    hidden: false,
    ingressAdmin: false,
  };
  if (i.canRunAgents) {
    // Unrestricted sources: the runner publishes each agent's voice as an extra audio track.
    return { ...base, canPublish: true };
  }
  return { ...base, canPublish: true, canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] };
}

/** The token's metadata: set by the server, so other participants can trust who someone is. */
export function participantMetadata(i: Pick<GrantInput, "participantId" | "kind" | "role" | "canRunAgents">): string {
  return JSON.stringify({ participantId: i.participantId, kind: i.kind, role: i.role, runner: i.canRunAgents });
}

export async function issueRoomToken(creds: LiveKitCredentials, i: GrantInput): Promise<string> {
  const at = new AccessToken(creds.apiKey, creds.apiSecret, {
    identity: i.participantId,
    name: i.name,
    metadata: participantMetadata(i),
    ttl: i.ttlSeconds,
  });
  at.addGrant(buildGrant(i));
  return at.toJwt();
}

export interface VerifiedRoomToken {
  participantId: string;
  roomId: string;
  kind: string;
  runner: boolean;
}

/** Checks a LiveKit token we issued (signature, expiry) and reads who it was issued to. Null when invalid. */
export async function verifyRoomToken(creds: LiveKitCredentials, token: string): Promise<VerifiedRoomToken | null> {
  try {
    const claims = await new TokenVerifier(creds.apiKey, creds.apiSecret).verify(token);
    const room = claims.video?.room;
    if (!claims.sub || !room) return null;
    let meta: { kind?: string; runner?: boolean } = {};
    try {
      meta = JSON.parse(claims.metadata ?? "{}");
    } catch {
      /* no metadata */
    }
    return { participantId: claims.sub, roomId: room, kind: meta.kind ?? "", runner: meta.runner === true };
  } catch {
    return null;
  }
}
