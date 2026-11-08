"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, Mic, MicOff, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MeetingView } from "@/lib/dealflow-ai/meetings/types";
import type { JoinOptions } from "./useMeetingRoom";
import type { RoomAgent } from "./types";

/** The check before joining: camera preview, microphone level, device choice. Joining is also the click that lets the browser start audio. */
export function Lobby({ meeting, name, agents, busy, error, onJoin }: { meeting: MeetingView; name: string; agents: RoomAgent[]; busy: boolean; error: string | null; onJoin: (o: JoinOptions) => void }) {
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(false);
  const [devices, setDevices] = useState<{ mics: MediaDeviceInfo[]; cams: MediaDeviceInfo[] }>({ mics: [], cams: [] });
  const [micId, setMicId] = useState("");
  const [camId, setCamId] = useState("");
  const [level, setLevel] = useState(0);
  const [perm, setPerm] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    let raf = 0;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    (async () => {
      stop();
      if (!mic && !cam) return;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: mic ? (micId ? { deviceId: { exact: micId } } : true) : false, video: cam ? (camId ? { deviceId: { exact: camId } } : true) : false });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        setPerm(null);
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices({ mics: list.filter((d) => d.kind === "audioinput"), cams: list.filter((d) => d.kind === "videoinput") });
        if (video.current) video.current.srcObject = cam ? s : null;
        if (mic && s.getAudioTracks().length) {
          ctx = new AudioContext();
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          ctx.createMediaStreamSource(s).connect(an);
          const buf = new Uint8Array(an.fftSize);
          const loop = () => {
            an.getByteTimeDomainData(buf);
            let peak = 0;
            for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
            setLevel(Math.min(1, peak / 64));
            raf = requestAnimationFrame(loop);
          };
          loop();
        }
      } catch (e) {
        if (!cancelled) setPerm(e instanceof DOMException && e.name === "NotAllowedError" ? "Access to your microphone or camera is blocked. You can still join to listen and chat, or allow access in your browser's address bar." : "We could not start your microphone or camera. You can still join to listen and chat.");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void ctx?.close().catch(() => {});
      stop();
    };
  }, [mic, cam, micId, camId, stop]);

  const live = agents.filter((a) => a.available);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto grid min-h-full max-w-5xl items-center gap-8 p-4 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <div className="relative aspect-video overflow-hidden rounded-3xl bg-muted ring-1 ring-border">
            <video ref={video} autoPlay playsInline muted aria-label="Your camera preview" className={cn("size-full -scale-x-100 object-cover", !cam && "hidden")} />
            {!cam && (
              <div className="absolute inset-0 grid place-items-center">
                <span className="grid size-24 place-items-center rounded-full bg-primary/15 text-3xl font-semibold text-primary">{name.slice(0, 1).toUpperCase()}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/50 to-transparent p-4">
              <Button type="button" variant={mic ? "secondary" : "destructive"} size="icon-lg" onClick={() => setMic((v) => !v)} aria-pressed={mic} aria-label={mic ? "Turn microphone off" : "Turn microphone on"}>
                {mic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </Button>
              <Button type="button" variant={cam ? "secondary" : "destructive"} size="icon-lg" onClick={() => setCam((v) => !v)} aria-pressed={cam} aria-label={cam ? "Turn camera off" : "Turn camera on"}>
                {cam ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3" aria-label="Microphone level">
            <Mic className="size-4 text-muted-foreground" aria-hidden />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} aria-label="Microphone level">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
            </div>
          </div>
          {perm && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{perm}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Microphone
              <select value={micId} onChange={(e) => setMicId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground" disabled={!devices.mics.length}>
                <option value="">Default</option>
                {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Camera
              <select value={camId} onChange={(e) => setCamId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground" disabled={!devices.cams.length}>
                <option value="">Default</option>
                {devices.cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Ready to join?</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{meeting.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Joining as <span className="font-medium text-foreground">{name}</span></p>
          </div>
          {live.length > 0 && (
            <div className="rounded-2xl border bg-card p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium"><Sparkles className="size-4 text-violet-500" aria-hidden />AI agents in this meeting</p>
              <p className="mt-1 text-muted-foreground">{live.map((a) => a.name).join(", ")}. Say an agent&apos;s name, like &ldquo;{live[0].name}, what do you think?&rdquo;, and it answers out loud. Everything said is transcribed for the meeting notes.</p>
            </div>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />Your microphone is converted to text during the meeting; audio is sent only in short clips for that purpose.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button size="lg" className="h-11 w-full text-base" disabled={busy} onClick={() => { stop(); onJoin({ mic, cam, micDeviceId: micId || undefined, camDeviceId: camId || undefined }); }}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Joining…" : "Join now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
