"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Copy, Download, FileText, LoaderCircle, Pause, Play, RefreshCw, Search, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { EmptyState, Notice, SectionCard } from "@/components/products/agentos/AibotsUi";
import CallStateBadge from "@/components/products/agentos/voice/CallStateBadge";
import type { BotSummary } from "@/lib/products/agentos/bots";
import type { VoiceCallView } from "@/lib/products/agentos/voice/calls";
import { activeLineIndex, callFileStem, callState, formatClock, formatIst, searchTranscript, splitMatches, transcriptToText } from "@/lib/products/agentos/voice/call-format";
import { refreshVoiceCallAction } from "@/app/(products)/agentos/(protected)/voice-actions";

const SPEEDS = [1, 1.25, 1.5, 2] as const;
const POLL_MS = 10_000;
const POLL_MAX = 18;

export default function CallDetail({ call: initial, bot, mine, audioUrl }: { call: VoiceCallView; bot: BotSummary | null; mine: boolean; audioUrl: string }) {
  const [call, setCall] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const state = callState(call);
  const lines = useMemo(() => call.transcript ?? [], [call.transcript]);
  const agentName = bot?.name ?? "Agent";
  const callerName = mine ? "You" : call.userEmail;

  // ---- ElevenLabs may still be preparing the call: pull it again (only the owner can) until it settles ----
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    const r = await refreshVoiceCallAction(call.chatId);
    setRefreshing(false);
    if (r.ok) setCall(r.call);
    else setRefreshError(r.error);
  }, [call.chatId]);
  const polls = useRef(0);
  useEffect(() => {
    if (!mine || state !== "processing") return;
    const id = setInterval(() => {
      if (polls.current++ >= POLL_MAX) return clearInterval(id);
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [mine, state, refresh]);

  // ---- audio ----
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState<number | null>(null);
  const [rate, setRate] = useState<(typeof SPEEDS)[number]>(1);
  const [audioState, setAudioState] = useState<"loading" | "ready" | "failed">("loading");
  const wantsAudio = call.connected && call.hasAudio !== false && state !== "processing";
  const total = length && Number.isFinite(length) ? length : (call.durationSecs ?? 0);

  const seekTo = (t: number, play = false) => {
    const a = audioRef.current;
    if (!a || audioState !== "ready") return;
    a.currentTime = Math.max(0, t);
    setTime(a.currentTime);
    if (play) void a.play().catch(() => {});
  };
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setAudioState("failed"));
    else a.pause();
  };
  const cycleRate = () => {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  // ---- transcript tools ----
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchTranscript(lines, query), [lines, query]);
  const [matchPos, setMatchPos] = useState(0);
  const lineEls = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const idx = matches[matchPos];
    if (idx !== undefined) lineEls.current[idx]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [matchPos, matches]);
  const stepMatch = (d: 1 | -1) => matches.length && setMatchPos((p) => (p + d + matches.length) % matches.length);
  const active = playing ? activeLineIndex(lines, time) : -1;

  const [copied, setCopied] = useState(false);
  const textOut = () => transcriptToText(lines, { agentName, callerName, startedAt: call.startedAt, durationSecs: call.durationSecs });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textOut());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setRefreshError("Couldn't copy to the clipboard. Use Download instead.");
    }
  };
  const downloadText = () => {
    const url = URL.createObjectURL(new Blob([textOut()], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${callFileStem(agentName, call.startedAt)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stem = callFileStem(agentName, call.startedAt);
  const audioNote = !call.connected
    ? "This call never connected, so nothing was recorded."
    : state === "processing"
      ? "ElevenLabs is still preparing the recording. This page checks again automatically."
      : call.hasAudio === false
        ? "ElevenLabs didn't record audio for this call."
        : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <SectionCard title="Recording">
          {audioNote ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">{state === "processing" && <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />}{audioNote}</p>
          ) : (
            <div className="space-y-2">
              {wantsAudio && (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  preload="metadata"
                  onLoadedMetadata={(e) => { setLength(e.currentTarget.duration); setAudioState("ready"); }}
                  onCanPlay={() => setAudioState("ready")}
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onError={() => setAudioState("failed")}
                />
              )}
              {audioState === "failed" ? (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>The recording couldn&apos;t be loaded. AgentOS plays calls live from ElevenLabs and doesn&apos;t keep a copy, so it may be past ElevenLabs&apos; retention period, or the ElevenLabs connection is unavailable. The transcript and summary below are saved here.</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" size="icon-lg" onClick={toggle} disabled={audioState !== "ready"} aria-label={playing ? "Pause" : "Play"}>
                    {audioState === "loading" ? <LoaderCircle className="size-5 animate-spin" /> : playing ? <Pause className="size-5" /> : <Play className="size-5" />}
                  </Button>
                  <span className="w-24 text-xs tabular-nums text-muted-foreground">{formatClock(time)} / {formatClock(total)}</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(total, 1)}
                    step={0.1}
                    value={Math.min(time, Math.max(total, 1))}
                    onChange={(e) => seekTo(Number(e.target.value))}
                    disabled={audioState !== "ready"}
                    aria-label="Seek"
                    className="h-1.5 min-w-32 flex-1 accent-primary"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={cycleRate} aria-label={`Playback speed ${rate}x`} className="w-14 tabular-nums">{rate}x</Button>
                  <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={audioUrl} download={`${stem}.mp3`} />}>
                    <Download className="size-3.5" /> Download
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Played live from ElevenLabs when you press play. AgentOS doesn&apos;t keep a copy of the audio.</p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Transcript"
          description={lines.length ? `${lines.length} message${lines.length === 1 ? "" : "s"}. Select a time to jump to it in the recording.` : undefined}
          action={
            lines.length ? (
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={copy}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}</Button>
                <Button type="button" size="sm" variant="outline" onClick={downloadText}><Download className="size-3.5" /> .txt</Button>
              </div>
            ) : undefined
          }
        >
          {lines.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setMatchPos(0); }}
                  onKeyDown={(e) => e.key === "Enter" && stepMatch(e.shiftKey ? -1 : 1)}
                  placeholder="Search this transcript"
                  aria-label="Search this transcript"
                  className="w-full rounded-xl border border-border/50 bg-background py-2 pr-3 pl-8 text-xs placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              {query.trim() && (
                <>
                  <span className="text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">{matches.length ? `${matchPos + 1} of ${matches.length}` : "No matches"}</span>
                  <Button type="button" size="icon-xs" variant="ghost" aria-label="Previous match" onClick={() => stepMatch(-1)} disabled={!matches.length}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" size="icon-xs" variant="ghost" aria-label="Next match" onClick={() => stepMatch(1)} disabled={!matches.length}><ArrowDown className="size-3.5" /></Button>
                </>
              )}
            </div>
          )}
          {lines.length > 0 ? (
            <ul className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">
              {lines.map((l, i) => {
                const user = l.role === "user";
                const isMatch = matches[matchPos] === i;
                return (
                  <li key={i} ref={(el) => { lineEls.current[i] = el; }} className={cn("flex", user ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm transition-shadow", user ? "bg-primary/12" : "bg-muted/60", (active === i || isMatch) && "ring-2 ring-primary/50")}>
                      <div className="mb-0.5 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                        <span>{user ? callerName : agentName}</span>
                        {l.atSecs !== null && (
                          <button type="button" onClick={() => seekTo(l.atSecs!, true)} disabled={audioState !== "ready"} className="rounded tabular-nums normal-case hover:text-primary disabled:cursor-default disabled:hover:text-muted-foreground" aria-label={`Jump to ${formatClock(l.atSecs)}`}>
                            {formatClock(l.atSecs)}
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap">
                        {splitMatches(l.text, query).map((p, j) => (p.match ? <mark key={j} className="rounded bg-amber-300/60 px-0.5 text-foreground">{p.text}</mark> : <span key={j}>{p.text}</span>))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={state === "processing" ? <LoaderCircle className="size-5 animate-spin" /> : <FileText className="size-5" />} title={state === "processing" ? "Preparing the transcript" : state === "not_connected" ? "This call never connected" : "No transcript was recorded"}>
              {state === "processing"
                ? mine ? "ElevenLabs is still processing this call. It refreshes by itself; you can also check now." : "ElevenLabs is still processing this call. The person who made it completes it when they open it."
                : state === "not_connected" ? "The call ended before the voice agent picked up, so there is nothing to show."
                : "ElevenLabs returned no spoken messages for this call."}
              {state === "processing" && mine && (
                <div className="mt-3"><Button type="button" size="sm" variant="outline" onClick={refresh} disabled={refreshing}><RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Check now</Button></div>
              )}
            </EmptyState>
          )}
          {refreshError && <div className="mt-3"><Notice tone="error">{refreshError}</Notice></div>}
        </SectionCard>
      </div>

      <div className="space-y-4">
        <SectionCard title="Call">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              {bot && <BotAvatar icon={bot.icon} color={bot.color} imageUrl={bot.avatarUrl} size="md" />}
              <div className="min-w-0">
                <p className="truncate font-semibold">{agentName}</p>
                {bot && <Link href={`/agentos/b/${bot._id}`} className="text-[11px] text-primary hover:underline">Open agent</Link>}
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Caller</dt><dd className="truncate text-right">{mine ? `You (${call.userEmail})` : call.userEmail}</dd>
              <dt className="text-muted-foreground">Started</dt><dd className="text-right">{formatIst(call.startedAt)} IST</dd>
              <dt className="text-muted-foreground">Duration</dt><dd className="text-right tabular-nums">{call.durationSecs ? formatClock(call.durationSecs) : "-"}</dd>
              <dt className="text-muted-foreground">Status</dt><dd className="flex justify-end"><CallStateBadge state={state} /></dd>
              {call.terminationReason && (<><dt className="text-muted-foreground">Ended</dt><dd className="text-right">{call.terminationReason}</dd></>)}
            </dl>
            <Link href="/agentos/calls" className="inline-block text-xs text-primary hover:underline">All calls</Link>
          </div>
        </SectionCard>

        {(call.summary || call.callSuccess || call.dataCollection.length > 0) && (
          <SectionCard title={call.summaryTitle || "Summary"} action={call.callSuccess && call.callSuccess !== "unknown" ? <Badge variant="outline">{call.callSuccess === "success" ? <Check /> : <AlertTriangle />} {call.callSuccess === "success" ? "Goal met" : "Goal not met"}</Badge> : undefined}>
            {call.summary && <p className="text-sm whitespace-pre-wrap">{call.summary}</p>}
            {call.dataCollection.length > 0 && (
              <dl className="mt-3 space-y-1.5 border-t border-border/40 pt-3 text-xs">
                {call.dataCollection.map((d) => (
                  <div key={d.key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{d.key}</dt><dd className="text-right font-medium">{d.value}</dd></div>
                ))}
              </dl>
            )}
          </SectionCard>
        )}
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"><Volume2 className="size-3" /> The transcript and summary are saved in AgentOS; the audio stays with ElevenLabs.</p>
      </div>
    </div>
  );
}
