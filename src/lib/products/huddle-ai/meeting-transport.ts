/**
 * Meeting media transport — the seam a real WebRTC / SFU integration slots into.
 *
 * The call room (`CallStage.tsx`) talks to `MeshTransport` (the `webrtc-mesh`
 * implementation in `webrtc-transport.ts`) directly for its richer API; this
 * interface remains the documented contract and the `LocalTransport` fallback.
 * To add an SFU transport, implement `MeetingTransport` (or extend the mesh
 * class) against a media server:
 *
 *   - `webrtc-mesh`  — one `RTCPeerConnection` per remote peer, SDP + ICE
 *     exchanged over a signaling channel (e.g. a dedicated `chat_events` kind or
 *     a websocket). Fine up to ~6 participants.
 *   - `sfu`          — a single `RTCPeerConnection` to a media server
 *     (mediasoup / LiveKit / Janus …) that forwards everyone's tracks. Scales.
 *
 * Server side, `chat_meetings.transport` + `roomId` already carry the provider
 * selection and room handle; `recordingEnabled` is where a server-side
 * recording pipeline hooks in.
 *
 * This file is isomorphic (no `server-only`) — the room component imports it.
 */

export type RemoteTrackHandler = (peerId: string, stream: MediaStream) => void;
export type PeerLeftHandler = (peerId: string) => void;
export type ConnectionStateHandler = (state: "connecting" | "connected" | "reconnecting" | "closed") => void;

export interface MeetingTransportConfig {
  roomId: string;
  selfId: string;
  displayName: string;
}

export interface MeetingTransport {
  readonly kind: "local" | "webrtc-mesh" | "sfu";
  /** Join the room, publishing the given local media (may be null = receive-only). */
  connect(local: MediaStream | null): Promise<void>;
  /** Replace / update the published local media (e.g. after toggling screen share). */
  publish(local: MediaStream | null): Promise<void>;
  /** Leave and tear down every peer connection. */
  disconnect(): Promise<void>;
  onRemoteTrack(handler: RemoteTrackHandler): void;
  onPeerLeft(handler: PeerLeftHandler): void;
  onConnectionState(handler: ConnectionStateHandler): void;
}

/**
 * No-signaling transport. Real media stays local to the joiner; there are no
 * remote streams. Everything else in the room (participant list, chat, screen
 * share preview, local recording) works unchanged.
 */
export class LocalTransport implements MeetingTransport {
  readonly kind = "local" as const;
  private stateHandler: ConnectionStateHandler | null = null;

  constructor(config: MeetingTransportConfig) {
    void config;
  }

  async connect(local: MediaStream | null): Promise<void> {
    void local;
    this.stateHandler?.("connected");
  }
  async publish(local: MediaStream | null): Promise<void> {
    void local;
  }
  async disconnect(): Promise<void> {
    this.stateHandler?.("closed");
  }
  onRemoteTrack(handler: RemoteTrackHandler): void {
    void handler;
  }
  onPeerLeft(handler: PeerLeftHandler): void {
    void handler;
  }
  onConnectionState(handler: ConnectionStateHandler): void {
    this.stateHandler = handler;
  }
}

export function createMeetingTransport(
  transport: "local" | "webrtc-mesh" | "sfu",
  config: MeetingTransportConfig
): MeetingTransport {
  switch (transport) {
    // case "webrtc-mesh": return new MeshTransport(config);
    // case "sfu":         return new SfuTransport(config);
    default:
      return new LocalTransport(config);
  }
}
