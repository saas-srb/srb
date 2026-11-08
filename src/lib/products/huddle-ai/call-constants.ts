/** Isomorphic calling constants — safe to import from client components. */

export const CALL_REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "🙌", "🔥", "😮", "😢", "🤔"] as const;

/** Default participant cap for a mesh call (env `MESSENGER_CALL_MAX` overrides, server-side). */
export const DEFAULT_CALL_MAX = 12;

/** Callee has this long to answer before the call is marked missed. */
export const RING_TIMEOUT_MS = 45_000;

/** A joined participant posts a heartbeat every this often; the sweep drops stale ones. */
export const CALL_HEARTBEAT_MS = 12_000;
export const CALL_STALE_MS = 40_000;

export type CallMode = "audio" | "video";
export type CallStatus = "ringing" | "active" | "ended";
export type CallParticipantState = "ringing" | "joined" | "left" | "declined" | "missed";
export type CallOutcome = "accepted" | "missed" | "declined" | "no_answer";
export type ScreenSurface = "screen" | "window" | "tab" | "unknown";

export interface CallScope {
  type: "dm" | "channel";
  id: string;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}
