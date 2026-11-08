"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Hash, MessageSquare, User, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TYPES = [
  { id: "messages", label: "Messages" },
  { id: "channels", label: "Channels" },
  { id: "users", label: "People" },
] as const;

interface Results {
  messages: { _id: string; scopeType: string; scopeId: string; scopeLabel: string; authorName: string; body: string; createdAt: string }[];
  channels: { _id: string; slug: string; name: string; kind: string; description: string | null; memberCount: number }[];
  users: { _id: string; displayName: string; email: string; title: string | null; department: string | null }[];
}

export default function GlobalSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [active, setActive] = useState<Set<string>>(new Set(["messages", "channels", "users"]));
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/huddle-ai/search?q=${encodeURIComponent(term)}&types=${[...active].join(",")}`);
        const json = await res.json();
        setResults(json.results ?? null);
      } finally {
        setLoading(false);
      }
      const next = new URLSearchParams(params.toString());
      next.set("q", term);
      router.replace(`/huddle-ai/search?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [q, active, router, params]);

  const toggle = (id: string) =>
    setActive((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n.size ? n : prev;
    });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search messages, channels and people…"
          className="h-11 rounded-xl border-border/50 bg-background pl-9 text-base text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
          autoFocus
        />
        {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active.has(t.id) ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!results && !loading && (
        <p className="py-12 text-center text-sm text-muted-foreground">Type to search across everything you can see.</p>
      )}

      {results && (
        <div className="space-y-6">
          {active.has("channels") && results.channels.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Channels</h3>
              <div className="space-y-1.5">
                {results.channels.map((c) => (
                  <Link
                    key={c._id}
                    href={`/huddle-ai/channels/${c.slug}`}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2 hover:border-primary/40"
                  >
                    <Hash className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                      {c.description && <span className="block truncate text-xs text-muted-foreground">{c.description}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{c.memberCount} members</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {active.has("users") && results.users.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">People</h3>
              <div className="space-y-1.5">
                {results.users.map((u) => (
                  <div key={u._id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {u.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{u.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[u.title, u.department].filter(Boolean).join(" · ") || u.email}
                      </span>
                    </span>
                    <User className="size-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {active.has("messages") && results.messages.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Messages</h3>
              <div className="space-y-1.5">
                {results.messages.map((m) => (
                  <Link
                    key={m._id}
                    href={m.scopeType === "dm" ? `/huddle-ai/dm/${m.scopeId}` : `/huddle-ai/channels`}
                    className="block rounded-xl border border-border/50 bg-card px-3 py-2 hover:border-primary/40"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MessageSquare className="size-3" />
                      {m.authorName} · {m.scopeLabel} · {new Date(m.createdAt).toLocaleDateString()}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-foreground">{m.body}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.channels.length + results.users.length + results.messages.length === 0 && !loading && (
            <p className="py-12 text-center text-sm text-muted-foreground">No matches.</p>
          )}
        </div>
      )}
    </div>
  );
}
