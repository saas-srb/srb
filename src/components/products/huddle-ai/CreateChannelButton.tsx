"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2, Hash, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createChannelAction } from "@/app/(products)/huddle-ai/(protected)/channels/actions";

interface U {
  _id: string;
  displayName: string;
  title: string | null;
  department: string | null;
}

export default function CreateChannelButton({ users }: { users: U[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = users.filter((u) => u.displayName.toLowerCase().includes(q.toLowerCase()));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createChannelAction({
        name,
        description: description || undefined,
        visibility,
        memberIds: [...selected],
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Create channel">
        <Plus className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Create a channel</SheetTitle>
            <SheetDescription>Channels organise conversations around a topic or team.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label htmlFor="ch-name">Name</Label>
              <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. product-launch" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-desc">Description (optional)</Label>
              <Input id="ch-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this channel for?" />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["public", "private"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                      visibility === v ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-muted"
                    )}
                  >
                    {v === "public" ? <Hash className="size-4" /> : <Lock className="size-4" />}
                    <span className="capitalize">{v}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Add members</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="rounded-xl border-border/50 bg-background px-3 py-1.5 text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
              />
              <div className="max-h-52 overflow-y-auto rounded-xl border border-border/60 p-1">
                {filtered.map((u) => (
                  <label key={u._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={selected.has(u._id)} onChange={() => toggle(u._id)} className="accent-primary" />
                    <span className="truncate">{u.displayName}</span>
                    {u.title && <span className="ml-auto truncate text-xs text-muted-foreground">{u.title}</span>}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="border-t border-border/60 p-4">
            <Button type="button" className="w-full" disabled={pending || name.trim().length < 2} onClick={submit}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Create channel"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
