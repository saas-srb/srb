"use client";

import { memo, useEffect, useRef } from "react";
import { Hand, Mic, MicOff, Pin, PinOff, ScreenShare, Sparkles, UserX, VolumeX, Volume2 } from "lucide-react";
import { Track } from "livekit-client";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { cn } from "@/lib/utils";
import type { RoomAgent, RoomPerson } from "./types";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const HUES = [262, 200, 160, 28, 340, 120, 220, 48];
const hue = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

export function Waveform({ active, className }: { active: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-4 items-end gap-[3px]", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] origin-bottom rounded-full bg-current", active ? "mr-wave" : "h-1 opacity-50")}
          style={active ? { height: "100%", animationDelay: `${i * 110}ms` } : undefined}
        />
      ))}
    </span>
  );
}

function VideoSurface({ person, version }: { person: RoomPerson; version: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const source = person.videoSource;
  useEffect(() => {
    const el = ref.current;
    if (!el || !source) return;
    const pub = person.participant.getTrackPublication(source);
    const track = pub?.track;
    if (!track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [person.participant, source, version]);
  if (!source) return null;
  return <video ref={ref} autoPlay playsInline muted aria-label={`${person.name} video`} className={cn("absolute inset-0 size-full bg-black", source === Track.Source.ScreenShare ? "object-contain" : "object-cover", person.isLocal && source === Track.Source.Camera && "-scale-x-100")} />;
}

const QUALITY_BARS = { excellent: 3, good: 2, poor: 1, lost: 0, unknown: 0 } as const;

export function QualityBars({ quality }: { quality: RoomPerson["quality"] }) {
  const n = QUALITY_BARS[quality];
  const color = quality === "excellent" || quality === "good" ? "bg-emerald-500" : quality === "poor" ? "bg-amber-500" : "bg-red-500";
  return (
    <span role="img" aria-label={`Connection ${quality}`} className="inline-flex h-3 items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-sm", i <= n ? color : "bg-foreground/20")} style={{ height: `${i * 33}%` }} />
      ))}
    </span>
  );
}

interface TileShell {
  speaking?: boolean;
  compact?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  className?: string;
  label: string;
  children: React.ReactNode;
}

function Shell({ speaking, compact, pinned, onPin, className, label, children }: TileShell) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "group/tile relative isolate overflow-hidden rounded-2xl bg-card text-card-foreground ring-1 ring-border transition-shadow duration-200",
        speaking && "ring-2 ring-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.18)]",
        compact ? "h-full w-full" : "size-full",
        className,
      )}
    >
      {children}
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
          aria-pressed={pinned}
          className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-full bg-background/70 text-foreground opacity-0 backdrop-blur transition group-hover/tile:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary"
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
      )}
    </div>
  );
}

export const PersonTile = memo(function PersonTile({
  person, version, compact, pinned, onPin, caption,
}: {
  person: RoomPerson;
  version: number;
  compact?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  caption?: string;
}) {
  const staff = person.kind === "internal";
  return (
    <Shell label={person.isLocal ? `${person.name} (you)` : person.name} speaking={person.speaking} compact={compact} pinned={pinned} onPin={onPin}>
      {person.videoSource ? (
        <VideoSurface person={person} version={version} />
      ) : (
        <div className="absolute inset-0 grid place-items-center" style={{ background: `linear-gradient(135deg, hsl(${hue(person.identity)} 55% 38% / .35), hsl(${hue(person.identity)} 55% 20% / .12))` }}>
          <span className={cn("grid place-items-center rounded-full font-semibold text-white shadow-lg", compact ? "size-12 text-base" : "size-20 text-2xl sm:size-24 sm:text-3xl")} style={{ background: `hsl(${hue(person.identity)} 50% 42%)` }}>
            {initials(person.name)}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent p-2 text-white">
        <div className="flex min-w-0 items-center gap-1.5">
          {person.micOn ? <Mic className="size-3.5 shrink-0" aria-label="Microphone on" /> : <MicOff className="size-3.5 shrink-0 text-red-300" aria-label="Microphone off" />}
          <span className="truncate text-xs font-medium sm:text-sm">{person.isLocal ? `${person.name} (You)` : person.name}</span>
          <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide", staff ? "bg-indigo-500/80" : "bg-amber-500/85")}>{staff ? "Staff" : "Guest"}</span>
          {person.role !== "participant" && !compact && <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-px text-[10px] font-semibold uppercase">{person.role === "host" ? "Host" : "Co-host"}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {person.sharing && <ScreenShare className="size-3.5" aria-label="Sharing screen" />}
          {person.handUp && (
            <span className="grid size-5 place-items-center rounded-full bg-amber-400 text-black" role="img" aria-label="Hand raised">
              <Hand className="size-3" />
            </span>
          )}
          <QualityBars quality={person.quality} />
        </div>
      </div>
      {caption && person.isLocal && <div className="pointer-events-none absolute inset-x-2 bottom-9 rounded-lg bg-black/70 px-2 py-1 text-xs text-white">{caption}</div>}
    </Shell>
  );
});

const STATE_LABEL = { listening: "Listening", thinking: "Thinking", speaking: "Speaking", muted: "Muted" } as const;

export const AgentTile = memo(function AgentTile({
  agent, compact, pinned, onPin, canHost, onMute, onRemove,
}: {
  agent: RoomAgent;
  compact?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  canHost?: boolean;
  onMute?: () => void;
  onRemove?: () => void;
}) {
  const speaking = agent.state === "speaking";
  return (
    <Shell label={`${agent.name}, AI agent, ${STATE_LABEL[agent.state].toLowerCase()}`} speaking={speaking} compact={compact} pinned={pinned} onPin={onPin}>
      <div className={cn("absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/15 via-card to-primary/5", speaking && "from-emerald-400/20")}>
        <div className="relative">
          {speaking && <span aria-hidden className="mr-pulse absolute -inset-3 rounded-full bg-emerald-400/25" />}
          {agent.state === "thinking" && <span aria-hidden className="mr-pulse absolute -inset-3 rounded-full bg-primary/20" />}
          <BotAvatar icon={agent.icon ?? "bot"} color={agent.color ?? "indigo"} imageUrl={agent.avatarUrl} size="lg" className={cn("relative !rounded-full", compact ? "!size-12" : "!size-20 sm:!size-24", !agent.available && "opacity-50 grayscale")} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent p-2 text-white">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="size-3.5 shrink-0 text-violet-300" aria-hidden />
          <span className="truncate text-xs font-medium sm:text-sm">{agent.name}</span>
          <span className="shrink-0 rounded-full bg-violet-500/85 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">AI</span>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[11px]", speaking && "text-emerald-300", agent.state === "thinking" && "text-violet-200")}>
          {agent.state === "speaking" && <Waveform active />}
          {agent.state === "thinking" && <span aria-hidden className="mr-dots">●●●</span>}
          {agent.state === "muted" && <VolumeX className="size-3" aria-hidden />}
          {STATE_LABEL[agent.state]}
        </span>
      </div>
      {!compact && agent.role && <div className="absolute top-2 left-2 max-w-[60%] truncate rounded-full bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">{agent.role}</div>}
      {canHost && (
        <div className="absolute top-2 right-11 z-10 flex gap-1 opacity-0 transition group-hover/tile:opacity-100 focus-within:opacity-100">
          <button type="button" onClick={onMute} aria-label={agent.muted ? `Unmute ${agent.name}` : `Mute ${agent.name}`} className="grid size-7 place-items-center rounded-full bg-background/70 backdrop-blur focus-visible:ring-2 focus-visible:ring-primary">
            {agent.muted ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          </button>
          <button type="button" onClick={onRemove} aria-label={`Remove ${agent.name} from the meeting`} className="grid size-7 place-items-center rounded-full bg-background/70 text-destructive backdrop-blur focus-visible:ring-2 focus-visible:ring-primary">
            <UserX className="size-3.5" />
          </button>
        </div>
      )}
    </Shell>
  );
});
