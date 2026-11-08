"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Clock,
  Fingerprint,
  Globe,
  Layers,
  Loader2,
  Mail,
  Monitor,
  MessageSquare,
  Phone,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import ChatTranscript from "@/components/products/dealflow-ai/ChatTranscript";
import { formatDateTime } from "@/lib/utils";
import type { ConversationDetail } from "@/lib/chat-conversations";
import { deleteConversationInPlaceAction } from "@/app/(products)/sitecraft-ai/(protected)/chatbot/actions";

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default function ConversationSheet({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<ConversationDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting UI for a new fetch
    setDetail(null);
    setLoading(true);
    fetch(`/api/dealflow-ai/chatbot/conversations/${sessionId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load this conversation.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  async function handleDelete() {
    if (!sessionId) return;
    setDeleting(true);
    const res = await deleteConversationInPlaceAction(sessionId);
    setDeleting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Conversation deleted");
    onOpenChange(false);
    router.refresh();
  }

  const session = detail?.session;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Conversation</SheetTitle>
          <SheetDescription>{session ? `Session ${session.sessionId.slice(0, 8)}…` : "Loading…"}</SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {session && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            {(session.visitorName || session.visitorEmail || session.visitorPhone || session.visitorService) && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  <UserRound className="size-3" /> Identified visitor
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {session.visitorName && (
                    <MetaRow icon={<UserRound className="size-4" />} label="Name" value={session.visitorName} />
                  )}
                  {session.visitorEmail && (
                    <MetaRow
                      icon={<Mail className="size-4" />}
                      label="Email"
                      value={<a href={`mailto:${session.visitorEmail}`} className="hover:text-primary">{session.visitorEmail}</a>}
                    />
                  )}
                  {session.visitorPhone && (
                    <MetaRow icon={<Phone className="size-4" />} label="Phone" value={session.visitorPhone} />
                  )}
                  {session.visitorService && (
                    <MetaRow icon={<Layers className="size-4" />} label="Main Service" value={session.visitorService} />
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <MetaRow icon={<Fingerprint className="size-4" />} label="Visitor" value={session.visitorId.slice(0, 12)} />
              <MetaRow
                icon={<Monitor className="size-4" />}
                label="Device"
                value={`${session.device} · ${session.browser}`}
              />
              <MetaRow icon={<Globe className="size-4" />} label="Source page" value={session.sourcePage || "(direct)"} />
              <MetaRow icon={<MessageSquare className="size-4" />} label="Messages" value={session.messageCount} />
              <MetaRow icon={<Clock className="size-4" />} label="Started" value={formatDateTime(session.startedAt)} />
              <MetaRow icon={<Clock className="size-4" />} label="Last activity" value={formatDateTime(session.lastActivityAt)} />
            </div>

            <Separator />

            <ChatTranscript messages={detail!.messages} />
          </div>
        )}

        <SheetFooter className="flex-row items-center justify-between gap-2">
          {session && (
            <Link
              href={`/commandos/chatbot/conversations/${session.sessionId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open full page
            </Link>
          )}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm" disabled={!session || deleting}>
                  <Trash2 className="size-3.5" data-icon="inline-start" />
                  Delete
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the session and all of its messages. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
