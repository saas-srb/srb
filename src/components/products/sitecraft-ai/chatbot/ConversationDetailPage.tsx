import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  Fingerprint,
  Globe,
  Layers,
  Mail,
  Monitor,
  MessageSquare,
  Phone,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ChatTranscript from "@/components/products/dealflow-ai/ChatTranscript";
import DeleteConversationButton from "@/app/(products)/sitecraft-ai/(protected)/chatbot/conversations/[id]/DeleteConversationButton";
import { getConversation } from "@/lib/chat-conversations";
import { formatDateTime } from "@/lib/utils";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getConversation(id);
  if (!detail) notFound();

  const s = detail.session;
  const flagged = detail.messages.some((m) => m.flaggedInjection);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Workspace", href: "/commandos" },
          { label: "AI Chatbot", href: "/commandos/chatbot" },
          { label: "Conversations", href: "/commandos/chatbot/conversations" },
          { label: `${s.sessionId.slice(0, 8)}…` },
        ]}
        title={<>Conversation transcript</>}
        description={<>Session {s.sessionId}</>}
        actions={<><div className="flex items-center gap-2">
          <Link
            href="/commandos/chatbot/conversations"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to list
          </Link>
          <DeleteConversationButton id={s.sessionId} />
        </div></>}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <GlassCard className="h-fit">
          <CardHeader>
            <CardTitle>Session details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(s.visitorName || s.visitorEmail || s.visitorPhone || s.visitorService) && (
              <div className="mb-1 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  <UserRound className="size-3" /> Identified visitor
                </p>
                {s.visitorName && <Detail icon={<UserRound className="size-4" />} label="Name" value={s.visitorName} />}
                {s.visitorEmail && <Detail icon={<Mail className="size-4" />} label="Email" value={s.visitorEmail} />}
                {s.visitorPhone && <Detail icon={<Phone className="size-4" />} label="Phone" value={s.visitorPhone} />}
                {s.visitorService && (
                  <Detail icon={<Layers className="size-4" />} label="Main Service" value={s.visitorService} />
                )}
              </div>
            )}
            <Detail icon={<Fingerprint className="size-4" />} label="Visitor ID" value={s.visitorId} />
            <Detail icon={<Monitor className="size-4" />} label="Device" value={`${s.device} · ${s.browser} · ${s.os}`} />
            <Detail icon={<Globe className="size-4" />} label="Source page" value={s.sourcePage || "(direct)"} />
            <Detail icon={<MessageSquare className="size-4" />} label="Messages" value={String(s.messageCount)} />
            <Detail icon={<Clock className="size-4" />} label="Started" value={formatDateTime(s.startedAt)} />
            <Detail icon={<Clock className="size-4" />} label="Last activity" value={formatDateTime(s.lastActivityAt)} />
            <Detail
              icon={<ShieldAlert className="size-4" />}
              label="Status"
              value={s.status === "active" ? "Active" : "Ended"}
            />
            {s.ipHash && (
              <Detail icon={<Fingerprint className="size-4" />} label="IP (hashed)" value={s.ipHash} />
            )}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader>
            <CardTitle>Transcript{flagged ? " (contains flagged input)" : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChatTranscript messages={detail.messages} />
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
