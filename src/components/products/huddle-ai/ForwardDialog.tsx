"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Hash, Lock, MessageSquare, Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ClientMessage, MessageScope } from "@/components/products/huddle-ai/types";

interface Target {
  id: string;
  name: string;
  type: "channel" | "dm";
  visibility?: "public" | "private";
}

export default function ForwardDialog({
  message,
  fromScope,
  onClose,
}: {
  message: ClientMessage | null;
  fromScope: MessageScope;
  onClose: () => void;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<Target[]>([]);
  const [q, setQ] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!message) return;
    fetch("/api/huddle-ai/conversations")
      .then((r) => r.json())
      .then((j) => {
        const chans: Target[] = (j.channels ?? []).map((c: { id: string; name: string; visibility: string }) => ({
          id: c.id,
          name: c.name,
          type: "channel" as const,
          visibility: c.visibility,
        }));
        const dms: Target[] = (j.dms ?? []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name, type: "dm" as const }));
        setTargets([...chans, ...dms]);
      })
      .catch(() => {});
  }, [message]);

  const filtered = targets.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  function forward(target: Target) {
    if (!message) return;
    setError(null);
    setPendingId(target.id);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/huddle-ai/messages/${message._id}/forward`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromScopeType: fromScope.type,
            fromScopeId: fromScope.id,
            toScopeType: target.type,
            toScopeId: target.id,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not forward.");
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not forward.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <Sheet open={message !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Forward message</SheetTitle>
          <SheetDescription>Send a copy to another conversation.</SheetDescription>
        </SheetHeader>
        {message && (
          <div className="border-b border-border/60 bg-muted/30 px-4 py-2">
            <p className="line-clamp-3 text-xs text-muted-foreground">
              {message.body || (message.attachments[0] ? `📎 ${message.attachments[0].filename}` : "(no text)")}
            </p>
          </div>
        )}
        <div className="border-b border-border/60 p-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations…"
            autoFocus
            className="rounded-xl border-border/50 bg-background px-3 py-1.5 text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
          />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.map((t) => (
            <button
              key={`${t.type}-${t.id}`}
              type="button"
              disabled={pendingId !== null}
              onClick={() => forward(t)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {t.type === "dm" ? (
                  <MessageSquare className="size-3.5" />
                ) : t.visibility === "private" ? (
                  <Lock className="size-3.5" />
                ) : (
                  <Hash className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              {pendingId === t.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5 text-muted-foreground" />}
            </button>
          ))}
          {filtered.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nothing matches.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
