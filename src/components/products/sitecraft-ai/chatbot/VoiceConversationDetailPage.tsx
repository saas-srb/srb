import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AudioLines, Clock, Fingerprint, Globe, Mail, MessageSquare, Monitor, UserRound } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import VoiceTimeline from "@/components/products/dealflow-ai/VoiceTimeline";
import DeleteVoiceConversationButton from "@/app/(products)/sitecraft-ai/(protected)/chatbot/voice/conversations/[id]/DeleteVoiceConversationButton";
import { getVoiceConversation } from "@/lib/voice-conversations";
import { formatDateTime } from "@/lib/utils";

function secs(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export default async function VoiceConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getVoiceConversation(id);
  if (!detail) notFound();

  const s = detail.session;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Workspace", href: "/commandos" },
          { label: "AI Chatbot", href: "/commandos/chatbot" },
          { label: "Conversation AI", href: "/commandos/chatbot/voice" },
          { label: "Voice Conversations", href: "/commandos/chatbot/voice-conversations" },
          { label: `${s.sessionId.slice(0, 8)}…` },
        ]}
        title={<>Voice conversation</>}
        description={<>Session {s.sessionId}</>}
        actions={<><div className="flex items-center gap-2">
          <Link href="/commandos/chatbot/voice-conversations" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to list
          </Link>
          <DeleteVoiceConversationButton id={s.sessionId} />
        </div></>}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <GlassCard className="h-fit">
          <CardHeader>
            <CardTitle>Session details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(s.visitorName || s.visitorEmail) && (
              <div className="mb-1 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  <UserRound className="size-3" /> Identified visitor
                </p>
                {s.visitorName && <Detail icon={<UserRound className="size-4" />} label="Name" value={s.visitorName} />}
                {s.visitorEmail && <Detail icon={<Mail className="size-4" />} label="Email" value={s.visitorEmail} />}
              </div>
            )}
            <Detail icon={<Fingerprint className="size-4" />} label="Visitor ID" value={s.visitorId} />
            <Detail icon={<Monitor className="size-4" />} label="Device" value={`${s.device} · ${s.browser} · ${s.os}`} />
            <Detail icon={<Globe className="size-4" />} label="Source page" value={s.sourcePage || "(direct)"} />
            <Detail icon={<Clock className="size-4" />} label="Duration" value={secs(s.durationMs)} />
            <Detail icon={<AudioLines className="size-4" />} label="Voice / Text messages" value={`${s.voiceMessageCount} / ${s.textMessageCount}`} />
            <Detail icon={<MessageSquare className="size-4" />} label="Voice ID" value={s.voiceId} />
            <Detail icon={<Clock className="size-4" />} label="Started" value={formatDateTime(s.startedAt)} />
            <Detail icon={<Clock className="size-4" />} label="Last activity" value={formatDateTime(s.lastActivityAt)} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader>
            <CardTitle>Conversation timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <VoiceTimeline sessionId={s.sessionId} timeline={detail.timeline} />
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
