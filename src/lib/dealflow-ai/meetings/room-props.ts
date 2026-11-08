import type { MeetingAgentView } from "@/lib/dealflow-ai/meeting-agents";
import type { MeetingView, ParticipantKind, MeetingRole } from "@/lib/dealflow-ai/meetings/types";

/**
 * The contract between the pages that own scheduling / access (these) and the live room engine
 * (`@/components/products/dealflow-ai/meetings-room/MeetingRoom`). The pages render
 * `<MeetingRoom {...props} />` once the server has issued a LiveKit token for exactly this person.
 *
 * Everything in here was decided by the server: the browser can neither choose its identity nor its role.
 */
export interface MeetingRoomProps {
  /** The meeting without secrets (no token hashes). Agents' display data is resolved by the room from AgentOS. */
  meeting: MeetingView;
  /** The meeting's AI agents resolved live from AgentOS (name, role, icon/colour, voice name; no instructions). Removed agents come back as `available: false`. */
  agents: MeetingAgentView[];
  /** Who this browser is. `participantId` is also the LiveKit identity; the display name is fixed by the roster. */
  me: { participantId: string; kind: Exclude<ParticipantKind, "agent">; role: MeetingRole; name: string };
  liveKit: { url: string };
  /** LiveKit access token (JWT) for `me`. The same JWT authenticates calls to `/api/dealflow-ai/meetings/[roomId]/utterances` (Authorization: Bearer). */
  token: string;
  /**
   * True when this person may run the AI agents (an internal participant; the token then also allows publishing several audio tracks
   * from this browser). The room still elects one runner among those who can.
   */
  canRunAgents: boolean;
  /** Where to send the person when they leave or the meeting ends. */
  leaveHref: string;
  /**
   * Live room state (roster incl. agents added/removed live, waiting guests, lock, status): GET `/api/dealflow-ai/meetings/[roomId]/state` with
   * `Authorization: Bearer <token>` returns `{ ok, meeting: MeetingView, agents: MeetingAgentView[] }`. Poll it every few seconds.
   */
  stateUrl: string;
  /** POST here (Authorization: Bearer <token>) to store a finalized transcript line: `{ id, text, at?, speakerId?, addressedTo? }`. */
  utterancesUrl: string;
  /** Guests see no staff-only controls (end for all, lock, add agents ...); the server enforces the same on its routes. */
  isGuest: boolean;
  /** True when this person may use host controls (host / cohost / manager). */
  canHost: boolean;
}
