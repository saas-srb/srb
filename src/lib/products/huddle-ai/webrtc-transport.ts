/**
 * `webrtc-mesh` implementation of the meeting media transport (the seam is
 * `meeting-transport.ts`). One `RTCPeerConnection` per remote participant, SDP +
 * ICE exchanged over the fast per-call SSE signal channel
 * (`/api/huddle-ai/calls/[id]/signal-stream` + `POST .../signal`).
 *
 * Isomorphic-safe imports only — this runs in the browser. Swapping in an SFU
 * transport means a new class here; `CallStage` and the call API stay unchanged.
 *
 * Uses the WHATWG "perfect negotiation" pattern so simultaneous offers don't
 * deadlock: the peer with the lexicographically smaller id is *polite* and rolls
 * back on glare; the other is *impolite* and always makes the initial offer.
 */

export type NetworkQuality = "good" | "ok" | "poor" | "unknown";
export type SignalType = "offer" | "answer" | "ice" | "bye";

export interface MeshConfig {
  callId: string;
  selfId: string;
  iceServers: RTCIceServer[];
  sendSignal: (to: string, type: SignalType, data: unknown) => void;
  onRemoteStream: (peerId: string, stream: MediaStream | null) => void;
  onPeerConnectionState: (peerId: string, state: RTCPeerConnectionState) => void;
}

interface PeerCtx {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  stream: MediaStream;
}

export class MeshTransport {
  readonly kind = "webrtc-mesh" as const;
  private peers = new Map<string, PeerCtx>();
  private local: MediaStream | null = null;
  private closed = false;

  constructor(private cfg: MeshConfig) {}

  // -- local media --------------------------------------------------------
  setLocalStream(stream: MediaStream | null): void {
    this.local = stream;
    for (const [, ctx] of this.peers) this.syncSenders(ctx);
  }

  /** Swap the outgoing video track (screen share on/off) without renegotiating where possible. */
  async replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    for (const [, ctx] of this.peers) {
      const sender = ctx.pc.getSenders().find((s) => s.track?.kind === "video" || (!s.track && track?.kind === "video"));
      if (sender) {
        try {
          await sender.replaceTrack(track);
        } catch {
          /* fall back to renegotiation via negotiationneeded */
        }
      } else if (track) {
        ctx.pc.addTrack(track, this.local ?? new MediaStream([track]));
      }
    }
  }

  // -- roster ------------------------------------------------------------
  /** Reconcile peer connections against the authoritative joined roster (excludes self). */
  setRoster(peerIds: string[]): void {
    if (this.closed) return;
    const want = new Set(peerIds.filter((id) => id !== this.cfg.selfId));
    for (const id of want) if (!this.peers.has(id)) this.addPeer(id);
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.removePeer(id);
  }

  private addPeer(peerId: string): void {
    const polite = this.cfg.selfId < peerId; // smaller id = polite
    const pc = new RTCPeerConnection({ iceServers: this.cfg.iceServers });
    const ctx: PeerCtx = { pc, polite, makingOffer: false, ignoreOffer: false, stream: new MediaStream() };
    this.peers.set(peerId, ctx);

    this.syncSenders(ctx);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.cfg.sendSignal(peerId, "ice", candidate.toJSON());
    };
    pc.ontrack = ({ track, streams }) => {
      const s = streams[0] ?? ctx.stream;
      if (!ctx.stream.getTracks().includes(track)) ctx.stream.addTrack(track);
      this.cfg.onRemoteStream(peerId, s.getTracks().length ? s : ctx.stream);
      track.onended = () => this.cfg.onRemoteStream(peerId, ctx.stream);
    };
    pc.onnegotiationneeded = async () => {
      try {
        ctx.makingOffer = true;
        await pc.setLocalDescription();
        this.cfg.sendSignal(peerId, "offer", pc.localDescription);
      } catch {
        /* ignore */
      } finally {
        ctx.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      this.cfg.onPeerConnectionState(peerId, pc.connectionState);
      if (pc.connectionState === "failed") {
        try {
          pc.restartIce();
        } catch {
          /* ignore */
        }
      }
    };
  }

  private removePeer(peerId: string): void {
    const ctx = this.peers.get(peerId);
    if (!ctx) return;
    try {
      ctx.pc.close();
    } catch {
      /* ignore */
    }
    this.peers.delete(peerId);
    this.cfg.onRemoteStream(peerId, null);
  }

  private syncSenders(ctx: PeerCtx): void {
    const tracks = this.local?.getTracks() ?? [];
    const senders = ctx.pc.getSenders();
    // add missing
    for (const track of tracks) {
      if (!senders.some((s) => s.track === track)) {
        try {
          ctx.pc.addTrack(track, this.local!);
        } catch {
          /* ignore */
        }
      }
    }
  }

  // -- inbound signaling ------------------------------------------------
  async handleSignal(from: string, type: SignalType, data: unknown): Promise<void> {
    if (this.closed) return;
    if (type === "bye") {
      this.removePeer(from);
      return;
    }
    let ctx = this.peers.get(from);
    if (!ctx) {
      this.addPeer(from);
      ctx = this.peers.get(from)!;
    }
    const { pc } = ctx;

    try {
      if (type === "offer" || type === "answer") {
        const desc = data as RTCSessionDescriptionInit;
        const offerCollision = type === "offer" && (ctx.makingOffer || pc.signalingState !== "stable");
        ctx.ignoreOffer = !ctx.polite && offerCollision;
        if (ctx.ignoreOffer) return;

        await pc.setRemoteDescription(desc);
        if (type === "offer") {
          await pc.setLocalDescription();
          this.cfg.sendSignal(from, "answer", pc.localDescription);
        }
      } else if (type === "ice") {
        try {
          await pc.addIceCandidate(data as RTCIceCandidateInit);
        } catch {
          if (!ctx.ignoreOffer) throw new Error("ice");
        }
      }
    } catch {
      /* transient negotiation error — ICE restart / renegotiation will recover */
    }
  }

  // -- diagnostics ----------------------------------------------------
  async networkQuality(): Promise<NetworkQuality> {
    if (this.peers.size === 0) return "good";
    let worst: NetworkQuality = "good";
    for (const [, ctx] of this.peers) {
      try {
        const stats = await ctx.pc.getStats();
        let rtt = 0;
        let lossRatio = 0;
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && typeof r.currentRoundTripTime === "number") {
            rtt = Math.max(rtt, r.currentRoundTripTime);
          }
          if (r.type === "inbound-rtp" && typeof r.packetsLost === "number" && typeof r.packetsReceived === "number") {
            const total = r.packetsLost + r.packetsReceived;
            if (total > 0) lossRatio = Math.max(lossRatio, r.packetsLost / total);
          }
        });
        const q: NetworkQuality = rtt > 0.35 || lossRatio > 0.08 ? "poor" : rtt > 0.15 || lossRatio > 0.02 ? "ok" : "good";
        if (q === "poor") worst = "poor";
        else if (q === "ok" && worst !== "poor") worst = "ok";
      } catch {
        /* ignore */
      }
    }
    return worst;
  }

  close(): void {
    this.closed = true;
    for (const id of [...this.peers.keys()]) {
      this.cfg.sendSignal(id, "bye", null);
      this.removePeer(id);
    }
  }
}
