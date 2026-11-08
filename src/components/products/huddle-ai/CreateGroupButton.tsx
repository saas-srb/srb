"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGroupAction } from "@/app/(products)/huddle-ai/(protected)/groups/actions";

interface U {
  _id: string;
  displayName: string;
  title: string | null;
  department: string | null;
}

export default function CreateGroupButton({ users }: { users: U[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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
      const res = await createGroupAction({ name, description: description || undefined, memberIds: [...selected] });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="New group chat">
        <Plus className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>New group chat</SheetTitle>
            <SheetDescription>A private conversation with a fixed set of people.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label htmlFor="grp-name">Group name</Label>
              <Input id="grp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AI Team" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grp-desc">Description (optional)</Label>
              <Input id="grp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this group for?" />
            </div>
            <div className="space-y-1.5">
              <Label>Members ({selected.size} selected)</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="rounded-xl border-border/50 bg-background px-3 py-1.5 text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
              />
              <div className="max-h-60 overflow-y-auto rounded-xl border border-border/60 p-1">
                {filtered.map((u) => (
                  <label key={u._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={selected.has(u._id)} onChange={() => toggle(u._id)} className="accent-primary" />
                    <span className="truncate">{u.displayName}</span>
                    {(u.title || u.department) && (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {[u.title, u.department].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="border-t border-border/60 p-4">
            <Button type="button" className="w-full" disabled={pending || name.trim().length < 2 || selected.size === 0} onClick={submit}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Create group"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
