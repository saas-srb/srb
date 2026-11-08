"use client";

import { useRef, useState } from "react";
import { Download, Volume2 } from "lucide-react";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/**
 * The recording of a finished call. The browser streams it from our own route (with seeking); the provider's key and address never reach the page.
 * Controls: play/seek (the browser's own), playback speed and a download link to the same route.
 */
export default function CallRecording({ url, note }: { url: string; note: string | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-2">
      <audio
        ref={ref}
        controls
        preload="none"
        src={url}
        className="w-full"
        aria-label="Call recording"
        onError={() => setFailed(true)}
        onPlay={() => setFailed(false)}
      >
        Your browser can&apos;t play audio.
      </audio>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          Speed
          <select
            value={speed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              if (ref.current) ref.current.playbackRate = v;
            }}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </label>
        <a href={url} download className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Download className="size-3.5" />Download</a>
      </div>
      {failed && <p role="alert" className="text-xs text-destructive">The recording couldn&apos;t be loaded. It may have expired at the provider, or your AgentOS session may have ended.</p>}
      {note && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Volume2 className="mt-0.5 size-3.5 shrink-0" />
          {note}
        </p>
      )}
    </div>
  );
}
