import { AudioLines, Bot, ExternalLink, FileText, TriangleAlert, User } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { Markdown } from "@/components/chat/Markdown";
import type { SerializedChatMessage } from "@/lib/chatbot-sessions";

export default function ChatTranscript({
  messages,
  className,
}: {
  messages: SerializedChatMessage[];
  className?: string;
}) {
  if (messages.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>This conversation has no messages.</p>;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {messages.map((m) => {
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
            <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "rounded-2xl border px-3.5 py-2 text-sm",
                  isUser
                    ? "rounded-tr-sm border-primary/20 bg-primary/10"
                    : m.error
                      ? "rounded-tl-sm border-destructive/30 bg-destructive/5"
                      : "rounded-tl-sm border-border/60 bg-card"
                )}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                ) : m.error && !m.content ? (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <TriangleAlert className="size-3.5 text-destructive" />
                    Generation failed
                  </p>
                ) : (
                  <Markdown content={m.content} />
                )}

                {!isUser && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/40 pt-2">
                    {m.citations.map((c, i) => {
                      const inner = (
                        <>
                          {c.kind === "pdf" ? (
                            <FileText className="size-3" />
                          ) : (
                            <ExternalLink className="size-3" />
                          )}
                          <span className="max-w-[200px] truncate">{c.title}</span>
                        </>
                      );
                      const cls =
                        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground";
                      return c.url ? (
                        <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className={cls}>
                          {inner}
                        </a>
                      ) : (
                        <span key={i} className={cls}>
                          {inner}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <span className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground/60">
                {m.voice && <AudioLines className="size-2.5 text-primary/70" />}
                {formatDateTime(m.createdAt)}
                {!isUser && m.responseTimeMs != null && ` · ${(m.responseTimeMs / 1000).toFixed(1)}s`}
                {!isUser && m.model && ` · ${m.model}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
