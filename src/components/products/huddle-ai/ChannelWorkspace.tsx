"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useState, useTransition } from "react";
import { Info, Users, Pin, FolderOpen, X, UserPlus, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import PresenceDot, { type PresenceStatus } from "@/components/products/huddle-ai/PresenceDot";
import { Markdown } from "@/components/chat/Markdown";
import { cn } from "@/lib/utils";
import {
  addChannelMembersAction,
  removeChannelMemberAction,
} from "@/app/(products)/huddle-ai/(protected)/channels/actions";
import { useRouter } from "next/navigation";

interface Member {
  userId: string;
  displayName: string;
  title: string | null;
  role: string;
  presence: PresenceStatus;
}

interface PinnedMessage {
  _id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface FileRow {
  _id: string;
  name: string;
  kind: string;
  category: string;
  storageKey: string;
  createdAt: string;
}

type Tab = "about" | "members" | "pinned" | "files";

export default function ChannelWorkspace({
  chat,
  channelId,
  description,
  topic,
  members,
  pinned,
  files,
  canModerate,
  currentUserId,
  readOnlyMembers = false,
}: {
  chat: React.ReactNode;
  channelId: string;
  description: string | null;
  topic: string | null;
  members: Member[];
  pinned: PinnedMessage[];
  files: FileRow[];
  canModerate: boolean;
  currentUserId: string;
  readOnlyMembers?: boolean;
}) {
  const manageMembers = canModerate && !readOnlyMembers;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("about");
  const [addOpen, setAddOpen] = useState(false);

  const tabs: { id: Tab; label: string; icon: typeof Info; count?: number }[] = [
    { id: "about", label: "About", icon: Info },
    { id: "members", label: "Members", icon: Users, count: members.length },
    { id: "pinned", label: "Pinned", icon: Pin, count: pinned.length },
    { id: "files", label: "Files", icon: FolderOpen, count: files.length },
  ];

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-end border-b border-border/60 px-2 py-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            <Info className="size-3.5" data-icon="inline-start" />
            Details
          </Button>
        </div>
        {chat}
      </div>

      {open && (
        <aside className="hidden w-80 shrink-0 flex-col border-l border-border/60 lg:flex">
          <div className="flex h-10 items-center justify-between border-b border-border/60 px-3">
            <span className="text-sm font-semibold">Channel details</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="border-b border-border/40 p-2">
            <PanelTabs className="w-full [&>*]:flex-1 [&>*]:px-2" active={tab} onSelect={(k) => setTab(k as Tab)} tabs={tabs.map((t) => ({ key: t.id, label: <span className="sr-only">{t.id}</span>, icon: <t.icon className="size-3.5" />, count: t.count !== undefined && t.count > 0 ? t.count : undefined }))} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
            {tab === "about" && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Topic</p>
                  <p className="text-foreground">{topic || "No topic set."}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Description</p>
                  <p className="text-foreground">{description || "No description."}</p>
                </div>
              </div>
            )}

            {tab === "members" && (
              <div className="space-y-1">
                {manageMembers && (
                  <Button type="button" variant="outline" size="sm" className="mb-2 w-full" onClick={() => setAddOpen(true)}>
                    <UserPlus className="size-3.5" data-icon="inline-start" />
                    Add members
                  </Button>
                )}
                {members.map((m) => (
                  <div key={m.userId} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                    <span className="relative flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {m.displayName.slice(0, 1).toUpperCase()}
                      <PresenceDot status={m.presence} ring className="absolute -right-0.5 -bottom-0.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{m.displayName}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {m.role !== "member" ? `${m.role} · ` : ""}
                        {m.title ?? ""}
                      </span>
                    </span>
                    {manageMembers && m.userId !== currentUserId && (
                      <RemoveMemberButton channelId={channelId} userId={m.userId} onDone={() => router.refresh()} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "pinned" && (
              <div className="space-y-2">
                {pinned.length === 0 && <p className="text-muted-foreground">No pinned messages.</p>}
                {pinned.map((p) => (
                  <div key={p._id} className="rounded-xl border border-border/60 bg-card p-2.5">
                    <p className="text-xs font-semibold text-foreground">{p.authorName}</p>
                    <div className="text-xs text-muted-foreground">
                      <Markdown content={p.body.slice(0, 280)} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "files" && (
              <div className="space-y-1.5">
                {files.length === 0 && <p className="text-muted-foreground">No files shared yet.</p>}
                {files.map((f) => (
                  <a
                    key={f._id}
                    href={`/api/huddle-ai/files/${f.storageKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border/50 px-2 py-1.5 text-xs hover:border-primary/40"
                  >
                    <Download className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{f.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{f.category}</span>
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {manageMembers && (
        <AddMembersSheet channelId={channelId} open={addOpen} onOpenChange={setAddOpen} existing={members.map((m) => m.userId)} />
      )}
    </div>
  );
}

function RemoveMemberButton({ channelId, userId, onDone }: { channelId: string; userId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remove member"
      className="opacity-0 transition-opacity group-hover:opacity-100"
      onClick={() =>
        startTransition(async () => {
          await removeChannelMemberAction(channelId, userId);
          onDone();
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5 text-muted-foreground hover:text-destructive" />}
    </button>
  );
}

function AddMembersSheet({
  channelId,
  open,
  onOpenChange,
  existing,
}: {
  channelId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ _id: string; displayName: string; title: string | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  async function runSearch(term: string) {
    setQ(term);
    if (!term.trim()) return setResults([]);
    const res = await fetch(`/api/huddle-ai/search?q=${encodeURIComponent(term)}&types=users`);
    const json = await res.json();
    setResults((json.results?.users ?? []).filter((u: { _id: string }) => !existing.includes(u._id)));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Add members</SheetTitle>
          <SheetDescription>They&apos;ll get access to the full channel history.</SheetDescription>
        </SheetHeader>
        <div className="border-b border-border/60 p-3">
          <Input
            value={q}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search people…"
            autoFocus
            className="rounded-xl border-border/50 bg-background px-3 py-1.5 text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.map((u) => (
            <label key={u._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={selected.has(u._id)}
                onChange={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(u._id)) next.delete(u._id);
                    else next.add(u._id);
                    return next;
                  })
                }
                className="accent-primary"
              />
              <span className="truncate">{u.displayName}</span>
              {u.title && <span className="ml-auto truncate text-xs text-muted-foreground">{u.title}</span>}
            </label>
          ))}
        </div>
        <div className="border-t border-border/60 p-3">
          <Button
            type="button"
            className="w-full"
            disabled={pending || selected.size === 0}
            onClick={() =>
              startTransition(async () => {
                await addChannelMembersAction(channelId, [...selected]);
                setSelected(new Set());
                setQ("");
                setResults([]);
                onOpenChange(false);
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : `Add ${selected.size || ""}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
