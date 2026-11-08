"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquarePlus, Lightbulb, Search, Trash2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { usePanelMeta } from "@/components/platform/PanelsProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useIntelligence } from "@/components/products/databrain-ai/IntelligenceProvider";
import { deleteConversationAction } from "@/app/(products)/databrain-ai/(protected)/actions";
import type { ConversationListItem } from "@/lib/products/databrain-ai/conversations";

function relative(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>;
}

function ConversationRow({ c, active, onNavigate }: { c: ConversationListItem; active: boolean; onNavigate?: () => void }) {
  const ctx = useIntelligence();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function del() {
    start(async () => {
      const res = await deleteConversationAction(c.id);
      if (!res.ok) {
        toast.error(res.error ?? "Could not delete that conversation.");
        return;
      }
      ctx.remove(c.id);
      toast.success("Conversation deleted");
      if (active) router.push("/databrain-ai");
    });
  }

  return (
    <div className={cn("group relative flex items-center rounded-lg transition-colors", active ? "bg-gradient-to-r from-primary/15 to-secondary/10" : "hover:bg-primary/5")} data-testid="conversation-row">
      <Link href={`/databrain-ai/c/${c.id}`} onClick={onNavigate} className="min-w-0 flex-1 px-3 py-2" aria-current={active ? "page" : undefined}>
        <p className={cn("truncate text-sm", active ? "font-semibold text-primary" : "font-medium text-foreground")}>{c.title}</p>
        <p className="text-[11px] text-muted-foreground">{relative(c.updatedAt)}</p>
      </Link>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button type="button" variant="ghost" size="icon-xs" className="absolute right-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100" aria-label={`Delete ${c.title}`} disabled={pending} />}>
          {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>“{c.title}” and its answers will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                del();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function IntelligenceSidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const panelName = usePanelMeta("intelligence")?.name ?? "AI Intelligence";
  const ctx = useIntelligence();
  const pathname = usePathname();
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const activeId = ctx.activeId ?? (pathname?.startsWith("/databrain-ai/c/") ? pathname.split("/")[3] : null);
  const shown = filter ? ctx.conversations.filter((c) => c.title.toLowerCase().includes(filter.toLowerCase())) : ctx.conversations;

  const newLink = (
    <Link
      href="/databrain-ai"
      onClick={() => {
        // A conversation started on this page got its id via history.replaceState, so the router believes it is
        // already on /databrain-ai and the link would do nothing: tell the chat to reset itself.
        ctx.setActiveId(null);
        window.dispatchEvent(new Event("intelligence:new"));
        onNavigate?.();
      }}
      aria-label={collapsed ? "New conversation" : undefined}
      className={cn("flex items-center gap-2.5 rounded-lg bg-primary/8 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/12", collapsed && "justify-center px-0")}
    >
      <MessageSquarePlus className="size-4 shrink-0" />
      {!collapsed && <span>New conversation</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <nav className="flex h-full flex-col gap-1 p-3">
        <Tooltip>
          <TooltipTrigger render={newLink} />
          <TooltipContent side="right">New conversation</TooltipContent>
        </Tooltip>
      </nav>
    );
  }

  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label={panelName}>
      {newLink}

      <SectionLabel>Conversations</SectionLabel>
      {ctx.conversations.length > 6 && (
        <label className="mb-1 flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground focus-within:border-primary/40">
          <Search className="size-3.5 shrink-0" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
      )}
      <div className="space-y-0.5" data-testid="conversation-list">
        {shown.slice(0, 40).map((c) => (
          <ConversationRow key={c.id} c={c} active={c.id === activeId} onNavigate={onNavigate} />
        ))}
      </div>
      {ctx.conversations.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No conversations yet. Ask your first question.</p>}
      {filter && shown.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No conversation matches “{filter}”.</p>}

      {ctx.examples.length > 0 && (
        <>
          <SectionLabel>What you can ask</SectionLabel>
          <ul className="space-y-0.5">
            {ctx.examples.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => {
                    ctx.setDraft(q);
                    if (pathname !== "/databrain-ai") router.push("/databrain-ai");
                    onNavigate?.();
                  }}
                  className="flex w-full items-start gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                >
                  <Lightbulb className="mt-0.5 size-3 shrink-0" />
                  <span>{q}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-3 pt-1 text-[11px] text-muted-foreground/80">Based on the data you can access.</p>
        </>
      )}
    </nav>
  );
}
