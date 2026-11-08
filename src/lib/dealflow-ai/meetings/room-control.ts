import "server-only";
import type { MeetingDoc, MeetingParticipant } from "@/lib/dealflow-ai/meetings/types";
import type { MeetingAgentView } from "@/lib/dealflow-ai/meeting-agents";

/**
 * Live-room control: the state every participant polls (who the agents are, whether the room is locked ...) and the actions a host takes
 * (mute or remove a person, lock, admit, add or remove an agent, end for everyone). Dependencies are injected so the authorisation rules are
 * tested without LiveKit, a session or a database. Actions need a signed-in staff member who may host this meeting; guests can read the state
 * of their own meeting (with their room token) and nothing else.
 */

export interface AgentLive extends MeetingAgentView {
  /** The meeting-participant id of the agent (what the transcript and roster use). */
  participantId: string;
  aliases: string[];
}

export interface RoomState {
  ok: true;
  status: MeetingDoc["status"];
  locked: boolean;
  waitingRoom: boolean;
  agents: AgentLive[];
  /** Host only. */
  waiting?: Array<{ id: string; name: string; since: string }>;
  /** Host only: voice agents that could be added right now. */
  availableAgents?: Array<{ id: string; name: string; category: string }>;
}

export interface ControlDeps {
  staff(): Promise<{ id: string } | null>;
  /** Verifies the Bearer token of a participant of this room. */
  verifyToken(token: string): Promise<{ participantId: string; roomId: string } | null>;
  getMeeting(roomId: string): Promise<MeetingDoc | null>;
  canHost(userId: string, m: MeetingDoc): Promise<boolean>;
  resolveAgents(m: MeetingDoc): Promise<AgentLive[]>;
  availableAgents(userId: string, m: MeetingDoc): Promise<Array<{ id: string; name: string; category: string }>>;
  actions: {
    setLocked(roomId: string, userId: string, locked: boolean): Promise<string | null>;
    setWaiting(roomId: string, userId: string, participantId: string, state: "admitted" | "denied"): Promise<string | null>;
    addAgent(roomId: string, userId: string, agentId: string): Promise<string | null>;
    removeAgent(roomId: string, userId: string, participantId: string): Promise<string | null>;
    end(roomId: string, userId: string): Promise<string | null>;
    muteMic(roomId: string, identity: string): Promise<string | null>;
    removeFromRoom(roomId: string, identity: string): Promise<string | null>;
  };
  limit(userId: string): Promise<{ ok: true } | { ok: false; retryAfter: number }>;
}

const json = (status: number, error: string) => Response.json({ ok: false, error }, { status });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function handleState(req: Request, roomId: string, deps: ControlDeps): Promise<Response> {
  if (!roomId) return json(400, "roomId is required");
  const m = await deps.getMeeting(roomId);
  if (!m) return json(404, "Meeting not found");
  const user = await deps.staff();
  let host = false;
  if (user && (await deps.canHost(user.id, m))) host = true;
  if (!host) {
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const who = bearer ? await deps.verifyToken(bearer) : null;
    const listed = !!who && who.roomId === roomId && m.participants.some((p) => p.id === who.participantId);
    const staffListed = !!user && m.participants.some((p) => p.kind === "internal" && p.refId === user.id);
    if (!listed && !staffListed) return json(401, "Not part of this meeting.");
  }
  const state: RoomState = {
    ok: true,
    status: m.status,
    locked: !!m.locked,
    waitingRoom: !!m.waitingRoom,
    agents: await deps.resolveAgents(m),
  };
  if (host && user) {
    state.waiting = m.participants.filter((p) => p.kind === "external" && p.waitingSince && !p.admittedAt).map((p) => ({ id: p.id, name: p.name, since: p.waitingSince as string }));
    state.availableAgents = m.status === "live" ? await deps.availableAgents(user.id, m) : [];
  }
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}

export type ControlAction =
  | { action: "lock"; locked: boolean }
  | { action: "admit" | "deny"; participantId: string }
  | { action: "mute" | "remove"; participantId: string }
  | { action: "agent-add"; agentId: string }
  | { action: "agent-remove"; participantId: string }
  | { action: "end" };

export function parseAction(body: unknown): ControlAction | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  switch (b.action) {
    case "lock":
      return typeof b.locked === "boolean" ? { action: "lock", locked: b.locked } : null;
    case "admit":
    case "deny":
    case "mute":
    case "remove":
    case "agent-remove": {
      const participantId = str(b.participantId, 80);
      return participantId ? ({ action: b.action, participantId } as ControlAction) : null;
    }
    case "agent-add": {
      const agentId = str(b.agentId, 64);
      return agentId ? { action: "agent-add", agentId } : null;
    }
    case "end":
      return { action: "end" };
    default:
      return null;
  }
}

function find(m: MeetingDoc, id: string): MeetingParticipant | undefined {
  return m.participants.find((p) => p.id === id);
}

export async function handleAction(roomId: string, body: unknown, deps: ControlDeps): Promise<Response> {
  const user = await deps.staff();
  if (!user) return json(401, "Sign in as a host to do this.");
  const lim = await deps.limit(user.id);
  if (!lim.ok) return Response.json({ ok: false, error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(lim.retryAfter) } });
  const act = parseAction(body);
  if (!act) return json(400, "Unknown action");
  const m = await deps.getMeeting(roomId);
  if (!m) return json(404, "Meeting not found");
  if (!(await deps.canHost(user.id, m))) return json(403, "Only the host can do this.");
  const a = deps.actions;
  let err: string | null = null;
  switch (act.action) {
    case "lock":
      err = await a.setLocked(roomId, user.id, act.locked);
      break;
    case "admit":
    case "deny": {
      const p = find(m, act.participantId);
      if (!p || p.kind !== "external") return json(404, "That guest is not part of this meeting.");
      err = await a.setWaiting(roomId, user.id, p.id, act.action === "admit" ? "admitted" : "denied");
      break;
    }
    case "mute":
    case "remove": {
      const p = find(m, act.participantId);
      if (!p || p.kind === "agent") return json(404, "That person is not part of this meeting.");
      if (p.refId === user.id) return json(400, "You cannot do this to yourself.");
      err = act.action === "mute" ? await a.muteMic(roomId, p.id) : await a.removeFromRoom(roomId, p.id);
      break;
    }
    case "agent-add":
      if (m.status !== "live") return json(409, "Agents can be added while the meeting is live.");
      err = await a.addAgent(roomId, user.id, act.agentId);
      break;
    case "agent-remove": {
      const p = find(m, act.participantId);
      if (!p || p.kind !== "agent") return json(404, "That agent is not part of this meeting.");
      err = await a.removeAgent(roomId, user.id, p.id);
      break;
    }
    case "end":
      err = await a.end(roomId, user.id);
      break;
  }
  return err ? json(409, err) : Response.json({ ok: true });
}
