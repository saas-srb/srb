"use client";

import { Bot, User } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import type { VoiceTimelineEntry } from "@/lib/voice-conversations";

export default function VoiceTimeline({
  sessionId,
  timeline,
}: {
  sessionId: string;
  timeline: VoiceTimelineEntry[];
}) {
  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">This conversation has no voice messages.</p>;
  }

  return (
    <div className="space-y-4">
      {timeline.map((m) => {
        const isUser = m.role === "user";
        return (
          <div key={m._id} className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
            <div
              className={cn(
                "flex size-7 flex-none items-center justify-center rounded-full border",
                isUser
                  ? "border-border/60 bg-muted text-muted-foreground"
                  : "border-primary/30 bg-gradient-to-br from-primary to-brand-accent text-white"
              )}
            >
              {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
            </div>
            <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "rounded-2xl border px-3.5 py-2 text-sm",
                  isUser ? "rounded-tr-sm border-primary/20 bg-primary/10" : "rounded-tl-sm border-border/60 bg-card"
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.text || <span className="text-muted-foreground">(no transcript)</span>}</p>
                {!isUser && m.hasAudio && (
                  <audio
                    controls
                    preload="none"
                    src={`/api/dealflow-ai/chatbot/voice/${sessionId}/audio?msg=${m._id}`}
                    className="mt-2 h-8 w-full max-w-xs"
                  />
                )}
              </div>
              <span className="px-1 text-[10px] text-muted-foreground/60">
                {formatDateTime(m.createdAt)}
                {isUser && m.sttMs != null && ` · STT ${(m.sttMs / 1000).toFixed(1)}s`}
                {!isUser && m.ttsMs != null && ` · TTS ${(m.ttsMs / 1000).toFixed(1)}s`}
                {m.audioDurationMs > 0 && ` · ${(m.audioDurationMs / 1000).toFixed(1)}s audio`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
