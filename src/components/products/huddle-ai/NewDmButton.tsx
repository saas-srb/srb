"use client";

import { useState, useTransition } from "react";
import { PenSquare, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { startDirectMessageAction } from "@/app/(products)/huddle-ai/(protected)/dm/actions";

interface U {
  _id: string;
  displayName: string;
  title: string | null;
  department: string | null;
}

export default function NewDmButton({ users }: { users: U[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = users.filter((u) => (u.displayName + (u.title ?? "") + (u.department ?? "")).toLowerCase().includes(q.toLowerCase()));

  function start(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await startDirectMessageAction(id);
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="New direct message">
        <PenSquare className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-sm">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>New message</SheetTitle>
            <SheetDescription>Pick someone to start a private conversation.</SheetDescription>
          </SheetHeader>
          <div className="border-b border-border/60 p-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="rounded-xl border-border/50 bg-background pl-8 pr-3 py-1.5 text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
                autoFocus
              />
            </div>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filtered.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No one matches.</p>}
            {filtered.map((u) => (
              <button
                key={u._id}
                type="button"
                disabled={pending}
                onClick={() => start(u._id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {u.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{u.displayName}</span>
                  {(u.title || u.department) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[u.title, u.department].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {pending && <Loader2 className="ml-auto size-4 animate-spin" />}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
