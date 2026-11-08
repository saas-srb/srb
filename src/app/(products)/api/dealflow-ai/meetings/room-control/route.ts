import { NextRequest } from "next/server";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { requireLms } from "@/lib/lms-auth";
import { userRateLimit } from "@/lib/security/rate-limit";
import {
  addParticipants, getMeeting, removeParticipant, setRoomFlags, setWaiting, transitionMeeting, type Actor,
} from "@/lib/dealflow-ai/db-meetings";
import { canHostMeeting, staffActor } from "@/lib/dealflow-ai/meetings/access";
import { getLiveKitCredentials, verifyRoomToken } from "@/lib/dealflow-ai/meetings/livekit";
import { handleAction, handleState, type AgentLive, type ControlDeps } from "@/lib/dealflow-ai/meetings/room-control";
import { meetingAgentIds, resolveMeetingAgents } from "@/lib/dealflow-ai/meeting-agents";
import { listAgentsForViewer } from "@/lib/products/agentos/picker";
import { viewerForUserId } from "@/lib/products/agentos/viewer";
import { normalizeParticipant } from "@/lib/dealflow-ai/meetings/validate";
import { nanoid } from "@/lib/dealflow-ai/nanoid";
import type { MeetingDoc } from "@/lib/dealflow-ai/meetings/types";

import { withTransport } from "@/lib/security/transport";
export const dynamic = "force-dynamic";

async function roomService(): Promise<RoomServiceClient | null> {
  const c = await getLiveKitCredentials();
  if (!c) return null;
  return new RoomServiceClient(c.url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), c.apiKey, c.apiSecret);
}

async function actorOf(userId: string): Promise<Actor> {
  const user = await requireLms();
  return user && user.id === userId ? staffActor(user) : { id: userId, name: "Host" };
}

const failed = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error ?? "That did not work.");

const deps: ControlDeps = {
  staff: async () => {
    const u = await requireLms();
    return u ? { id: u.id } : null;
  },
  verifyToken: async (token) => {
    const creds = await getLiveKitCredentials();
    const v = creds ? await verifyRoomToken(creds, token) : null;
    return v ? { participantId: v.participantId, roomId: v.roomId } : null;
  },
  getMeeting: async (roomId) => (await getMeeting(roomId)) as unknown as MeetingDoc | null,
  canHost: async (_userId, m) => {
    const u = await requireLms();
    return !!u && canHostMeeting(u, m);
  },
  resolveAgents: async (m) => {
    const views = await resolveMeetingAgents(meetingAgentIds(m));
    return views.map((v): AgentLive => {
      const p = m.participants.find((x) => x.kind === "agent" && x.refId === v.id);
      const own = p?.name && p.name !== v.name ? [p.name] : [];
      return { ...v, participantId: p?.id ?? v.id, aliases: [...(p?.aliases ?? []), ...(v.callNames ?? []), ...own] };
    });
  },
  availableAgents: async (userId, m) => {
    const viewer = await viewerForUserId(userId);
    if (!viewer) return [];
    const have = new Set(meetingAgentIds(m));
    return (await listAgentsForViewer(viewer, { kind: "voice" })).filter((a) => !have.has(a.id)).map((a) => ({ id: a.id, name: a.name, category: a.category }));
  },
  limit: (userId) => userRateLimit("meeting-control", userId, 60, 60),
  actions: {
    setLocked: async (roomId, userId, locked) => failed(await setRoomFlags(roomId, { locked }, await actorOf(userId))),
    setWaiting: async (roomId, userId, participantId, state) => failed(await setWaiting(roomId, participantId, state, await actorOf(userId))),
    addAgent: async (roomId, userId, agentId) => {
      const viewer = await viewerForUserId(userId);
      const allowed = viewer ? (await listAgentsForViewer(viewer, { kind: "voice" })).find((a) => a.id === agentId) : null;
      if (!allowed) return "That agent is not available to you.";
      const dir = { staff: new Map(), agents: new Map([[agentId, { name: allowed.name }]]) };
      const parsed = normalizeParticipant({ kind: "agent", refId: agentId }, dir, () => `p_${nanoid(10)}`, new Date());
      if (!parsed.ok) return parsed.error;
      return failed(await addParticipants(roomId, [parsed.value], await actorOf(userId)));
    },
    removeAgent: async (roomId, userId, participantId) => failed(await removeParticipant(roomId, participantId, await actorOf(userId))),
    end: async (roomId, userId) => {
      const r = failed(await transitionMeeting(roomId, "ended", await actorOf(userId)));
      if (r) return r;
      // Everyone is dropped from the call; a failure here is not fatal, the meeting is already ended.
      await (await roomService())?.deleteRoom(roomId).catch(() => {});
      return null;
    },
    muteMic: async (roomId, identity) => {
      const svc = await roomService();
      if (!svc) return "Video calling isn't set up.";
      try {
        const p = await svc.getParticipant(roomId, identity);
        const mic = p.tracks.find((t) => t.source === TrackSource.MICROPHONE && !t.muted);
        if (mic) await svc.mutePublishedTrack(roomId, identity, mic.sid, true);
        return null;
      } catch {
        return "That person is not in the call right now.";
      }
    },
    removeFromRoom: async (roomId, identity) => {
      const svc = await roomService();
      if (!svc) return "Video calling isn't set up.";
      try {
        await svc.removeParticipant(roomId, identity);
        return null;
      } catch {
        return "That person is not in the call right now.";
      }
    },
  },
};

/** GET ?roomId= : the live state of the room (agents, lock, waiting guests for hosts). */
async function handleGET(req: NextRequest) {
  try {
    return await handleState(req, new URL(req.url).searchParams.get("roomId")?.trim() ?? "", deps);
  } catch (err) {
    console.error("[room-control] GET error:", err);
    return Response.json({ ok: false, error: "Could not read the room" }, { status: 500 });
  }
}

/** POST { roomId, action, ... } : a host action. */
async function handlePOST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const roomId = typeof body?.roomId === "string" ? body.roomId.trim().slice(0, 80) : "";
    if (!roomId) return Response.json({ ok: false, error: "roomId is required" }, { status: 400 });
    return await handleAction(roomId, body, deps);
  } catch (err) {
    console.error("[room-control] POST error:", err);
    return Response.json({ ok: false, error: "That did not work" }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
