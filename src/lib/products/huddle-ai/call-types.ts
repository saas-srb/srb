/** Isomorphic serialized call shapes — safe to import from client components. */

import type { CallMode, CallStatus, CallParticipantState, CallScope } from "@/lib/products/huddle-ai/call-constants";

export interface CallUserLite {
  _id: string;
  displayName: string;
  email: string;
  title: string | null;
  department: string | null;
  avatarUrl: string | null;
}

export interface SerializedCall {
  _id: string;
  scope: CallScope;
  mode: CallMode;
  status: CallStatus;
  title: string;
  rings: boolean;
  initiatedBy: string;
  meetingId: string | null;
  presenterId: string | null;
  participantLimit: number;
  startedAt: string;
  activeAt: string | null;
  endedAt: string | null;
  myRole: "host" | "guest" | null;
  participants: SerializedCallParticipant[];
}

export interface SerializedCallParticipant {
  userId: string;
  state: CallParticipantState;
  role: "host" | "guest";
  handRaised: boolean;
  screenSharing: boolean;
  joinedAt: string | null;
  online: boolean;
  user: CallUserLite | null;
}
