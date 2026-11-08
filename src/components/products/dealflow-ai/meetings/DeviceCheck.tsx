"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Before joining: shows the camera and a live microphone level so people find a broken device before they are in the room.
 * It only looks; the stream is released again, the room asks for the devices itself. Joining is never blocked by it (people may join listening only).
 */
export default function DeviceCheck({ onStatus }: { onStatus?: (s: { mic: boolean; camera: boolean }) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const [level, setLevel] = useState(0);
  const [state, setState] = useState<{ mic: boolean; camera: boolean; error: string; asked: boolean }>({ mic: false, camera: false, error: "", asked: false });

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    stop();
    const attempt = async (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c);
    let s: MediaStream | null = null;
    let error = "";
    try {
      s = await attempt({ audio: true, video: true });
    } catch {
      try {
        s = await attempt({ audio: true });
        error = "No camera available. You can still join with audio.";
      } catch (e) {
        error = e instanceof DOMException && e.name === "NotAllowedError" ? "Your browser blocked the microphone. Allow it in the address bar to be heard." : "No microphone found. You can join and listen, but nobody will hear you.";
      }
    }
    stream.current = s;
    const mic = !!s?.getAudioTracks().length;
    const camera = !!s?.getVideoTracks().length;
    setState({ mic, camera, error, asked: true });
    onStatus?.({ mic, camera });
    if (s && video.current) video.current.srcObject = s;
    if (s && mic) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    }
  }, [onStatus, stop]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        <video ref={video} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" />
        {!state.camera && <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground"><CameraOff className="size-8" /><span className="text-xs">{state.asked ? "Camera off" : "Camera preview"}</span></div>}
      </div>
      {state.asked ? (
        <div className="flex items-center gap-3 text-sm">
          {state.mic ? <Mic className="size-4 text-emerald-500" /> : <MicOff className="size-4 text-rose-500" />}
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${level * 100}%` }} /></div>
          {state.camera ? <Camera className="size-4 text-emerald-500" /> : <CameraOff className="size-4 text-muted-foreground" />}
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => void start()}><Mic className="size-4" />Check my microphone and camera</Button>
      )}
      {state.error ? <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{state.error}</p> : state.asked && state.mic ? <p className="text-xs text-muted-foreground">Say something: the bar should move.</p> : null}
    </div>
  );
}
